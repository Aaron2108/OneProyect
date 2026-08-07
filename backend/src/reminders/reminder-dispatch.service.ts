import { Injectable, Logger } from '@nestjs/common';
import { ConsentStatus, Reminder, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappOutboundService } from '../whatsapp/whatsapp-outbound.service';
import {
  CLAIM_LEASE_MS,
  DEFER_RETRY_MS,
  DISPATCH_BATCH,
  MAX_SEND_ATTEMPTS,
  REMINDER_EXPIRY_MS,
  SEND_BACKOFF_BASE_MS,
  SEND_BACKOFF_MAX_MS,
} from './reminders.constants';

/** Recordatorio con las relaciones que necesita el despacho. */
export type DueReminder = Reminder & {
  contact: { phone: string; consent: { status: ConsentStatus } | null };
};

/** Resultado del intento de despacho de un recordatorio (para logging/tests). */
export type DispatchOutcome =
  | 'sent'
  | 'cancelled-no-consent'
  | 'expired-cancelled'
  | 'failed-cancelled'
  | 'deferred-no-config'
  | 'deferred-needs-template'
  | 'deferred-send-failed';

/**
 * Envía los recordatorios vencidos respetando las reglas de WhatsApp y de forma
 * segura a escala:
 * - **Concurrencia**: cada recordatorio se toma con un *claim atómico*
 *   (`updateMany` con guarda + lease en `nextAttemptAt`), de modo que ni varios
 *   ticks ni varias instancias del worker pueden procesar el mismo dos veces.
 * - **Sin inanición** (RF de escala): los recordatorios diferidos se reprograman
 *   con `nextAttemptAt` (backoff), así no acaparan el batch de cada tick.
 * - **Reintentos acotados**: los fallos de envío usan backoff exponencial y se
 *   cancelan tras `MAX_SEND_ATTEMPTS` o al expirar.
 * - **Consentimiento (RF-12)** y **ventana de 24h (RF-10)** antes de enviar.
 *
 * El estado pasa a SENT solo cuando el proveedor del canal acepta el envío.
 */
@Injectable()
export class ReminderDispatchService {
  private readonly logger = new Logger(ReminderDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: WhatsappOutboundService,
  ) {}

  /** Procesa los recordatorios PENDING elegibles cuya hora ya llegó. */
  async dispatchDue(now: Date = new Date()): Promise<Record<DispatchOutcome, number>> {
    const candidates = (await this.prisma.reminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        remindAt: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { remindAt: 'asc' },
      take: DISPATCH_BATCH,
      include: {
        // El número por el que sale el mensaje ya no se resuelve aquí: lo hace
        // la abstracción del canal a partir del tenant.
        contact: { select: { phone: true, consent: { select: { status: true } } } },
      },
    })) as unknown as DueReminder[];

    const tally = this.emptyTally();
    let processed = 0;
    for (const reminder of candidates) {
      // Claim atómico: solo quien logra el update (count === 1) procesa. Adelanta
      // `nextAttemptAt` (lease) para que otra instancia/tick no lo tome en paralelo.
      const claim = await this.prisma.reminder.updateMany({
        where: {
          id: reminder.id,
          status: ReminderStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
      });
      if (claim.count === 0) {
        continue; // otra instancia/tick lo tomó primero
      }
      const outcome = await this.dispatchOne(reminder, now);
      tally[outcome] += 1;
      processed += 1;
    }

    if (processed > 0) {
      const cancelled =
        tally['cancelled-no-consent'] + tally['expired-cancelled'] + tally['failed-cancelled'];
      const deferred =
        tally['deferred-no-config'] + tally['deferred-needs-template'] + tally['deferred-send-failed'];
      this.logger.log(
        `Recordatorios procesados: ${processed} · enviados ${tally.sent}, cancelados ${cancelled}, aplazados ${deferred}`,
      );
    }
    return tally;
  }

  /**
   * Intenta despachar un recordatorio ya reclamado y decide su próxima transición.
   * Asume que el llamador tomó el claim (lease en `nextAttemptAt`).
   */
  async dispatchOne(reminder: DueReminder, now: Date = new Date()): Promise<DispatchOutcome> {
    // RF-12: sin consentimiento GRANTED no se envía nada proactivo.
    const consent = reminder.contact.consent;
    if (!consent || consent.status !== ConsentStatus.GRANTED) {
      await this.cancel(reminder.id);
      this.logger.warn(`Recordatorio ${reminder.id} cancelado: contacto sin opt-in (RF-12)`);
      return 'cancelled-no-consent';
    }

    // El envío pasa por la abstracción del canal: es ella quien sabe si hay
    // sesión viva y si el proveedor activo impone ventana de servicio. Este
    // servicio solo decide qué hacer con cada desenlace.
    const lastInboundAt = await this.latestInboundAt(reminder.tenantId, reminder.contactId);
    const envio = await this.outbound.enviarTexto({
      tenantId: reminder.tenantId,
      to: reminder.contact.phone,
      text: reminder.message,
      lastInboundAt,
    });

    if (envio.enviado) {
      await this.markSent(reminder.id);
      this.logger.log(`Recordatorio ${reminder.id} enviado a ${reminder.contact.phone}`);
      return 'sent';
    }

    // Sin canal vinculado no es culpa del recordatorio: se reintenta más tarde,
    // porque el dueño puede estar a punto de conectar WhatsApp.
    if (envio.motivo === 'canal-desconectado') {
      await this.deferUntil(reminder.id, now, DEFER_RETRY_MS);
      return 'deferred-no-config';
    }

    // RF-10: fuera de la ventana de 24h Meta exige plantilla pre-aprobada.
    if (envio.motivo === 'ventana-cerrada') {
      if (this.isExpired(reminder, now)) {
        await this.cancel(reminder.id);
        this.logger.warn(
          `Recordatorio ${reminder.id} cancelado (expirado): fuera de la ventana de 24h y sin plantilla`,
        );
        return 'expired-cancelled';
      }
      await this.deferUntil(reminder.id, now, DEFER_RETRY_MS);
      return 'deferred-needs-template';
    }

    this.logger.error(`Fallo enviando el recordatorio ${reminder.id}`);
    return this.handleSendFailure(reminder, now);
  }

  /** Backoff exponencial y cancelación tras demasiados intentos o expiración. */
  private async handleSendFailure(reminder: DueReminder, now: Date): Promise<DispatchOutcome> {
    const attempts = reminder.attempts + 1;
    if (attempts >= MAX_SEND_ATTEMPTS || this.isExpired(reminder, now)) {
      await this.cancel(reminder.id, attempts);
      this.logger.warn(
        `Recordatorio ${reminder.id} cancelado tras ${attempts} intento(s) de envío fallidos`,
      );
      return 'failed-cancelled';
    }
    const backoff = Math.min(
      SEND_BACKOFF_BASE_MS * 2 ** (attempts - 1),
      SEND_BACKOFF_MAX_MS,
    );
    await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: { attempts, nextAttemptAt: new Date(now.getTime() + backoff) },
    });
    return 'deferred-send-failed';
  }

  /** Última hora de mensaje entrante del contacto (para evaluar la ventana de 24h). */
  private async latestInboundAt(tenantId: string, contactId: string): Promise<Date | null> {
    // `lastInboundAt: { not: null }` evita que una conversación sin entrante
    // (NULLS FIRST en Postgres con DESC) tape a otra con timestamp real.
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId, lastInboundAt: { not: null } },
      orderBy: { lastInboundAt: 'desc' },
      select: { lastInboundAt: true },
    });
    return conversation?.lastInboundAt ?? null;
  }

  private isExpired(reminder: DueReminder, now: Date): boolean {
    return now.getTime() - reminder.remindAt.getTime() > REMINDER_EXPIRY_MS;
  }

  private markSent(id: string): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.SENT },
    });
  }

  private cancel(id: string, attempts?: number): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: attempts === undefined
        ? { status: ReminderStatus.CANCELLED }
        : { status: ReminderStatus.CANCELLED, attempts },
    });
  }

  /** Reprograma el recordatorio (sigue PENDING) para no acaparar el batch. */
  private deferUntil(id: string, now: Date, delayMs: number): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: { nextAttemptAt: new Date(now.getTime() + delayMs) },
    });
  }

  private emptyTally(): Record<DispatchOutcome, number> {
    return {
      sent: 0,
      'cancelled-no-consent': 0,
      'expired-cancelled': 0,
      'failed-cancelled': 0,
      'deferred-no-config': 0,
      'deferred-needs-template': 0,
      'deferred-send-failed': 0,
    };
  }
}
