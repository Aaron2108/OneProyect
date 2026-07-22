import { Injectable, Logger } from '@nestjs/common';
import { ConsentStatus, Reminder, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { isWithinServiceWindow } from '../whatsapp/whatsapp-window.util';
import { DISPATCH_BATCH, REMINDER_EXPIRY_MS } from './reminders.constants';

/** Recordatorio con las relaciones que necesita el despacho. */
export type DueReminder = Reminder & {
  contact: { phone: string; consent: { status: ConsentStatus } | null };
  tenant: { whatsappPhoneNumberId: string | null };
};

/** Resultado del intento de despacho de un recordatorio (para logging/tests). */
export type DispatchOutcome =
  | 'sent'
  | 'cancelled-no-consent'
  | 'expired-cancelled'
  | 'deferred-no-config'
  | 'deferred-needs-template'
  | 'deferred-send-failed';

/**
 * Envía los recordatorios vencidos respetando las reglas de WhatsApp:
 * - Consentimiento del contacto (RF-12): sin opt-in GRANTED no se envía.
 * - Ventana de 24h (RF-10): fuera de ella un mensaje proactivo exige plantilla
 *   pre-aprobada (aún no implementada); mientras tanto se aplaza y, si expira,
 *   se cancela para no reintentar indefinidamente.
 *
 * El estado del recordatorio solo pasa a SENT cuando Meta acepta el envío.
 */
@Injectable()
export class ReminderDispatchService {
  private readonly logger = new Logger(ReminderDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WhatsappSenderService,
  ) {}

  /** Procesa los recordatorios PENDING cuya hora ya llegó. */
  async dispatchDue(now: Date = new Date()): Promise<Record<DispatchOutcome, number>> {
    const due = (await this.prisma.reminder.findMany({
      where: { status: ReminderStatus.PENDING, remindAt: { lte: now } },
      orderBy: { remindAt: 'asc' },
      take: DISPATCH_BATCH,
      include: {
        contact: { select: { phone: true, consent: { select: { status: true } } } },
        tenant: { select: { whatsappPhoneNumberId: true } },
      },
    })) as unknown as DueReminder[];

    const tally = this.emptyTally();
    for (const reminder of due) {
      const outcome = await this.dispatchOne(reminder, now);
      tally[outcome] += 1;
    }

    if (due.length > 0) {
      this.logger.log(
        `Recordatorios vencidos: ${due.length} · enviados ${tally.sent}, ` +
          `cancelados ${tally['cancelled-no-consent'] + tally['expired-cancelled']}, ` +
          `aplazados ${tally['deferred-no-config'] + tally['deferred-needs-template'] + tally['deferred-send-failed']}`,
      );
    }
    return tally;
  }

  /** Intenta despachar un recordatorio y actualiza su estado según el resultado. */
  async dispatchOne(reminder: DueReminder, now: Date = new Date()): Promise<DispatchOutcome> {
    // RF-12: sin consentimiento GRANTED no se envía nada proactivo.
    const consent = reminder.contact.consent;
    if (!consent || consent.status !== ConsentStatus.GRANTED) {
      await this.setStatus(reminder.id, ReminderStatus.CANCELLED);
      this.logger.warn(`Recordatorio ${reminder.id} cancelado: contacto sin opt-in (RF-12)`);
      return 'cancelled-no-consent';
    }

    // Necesita número del tenant y credenciales de Meta para poder enviar.
    const phoneNumberId = reminder.tenant.whatsappPhoneNumberId;
    if (!phoneNumberId || !this.sender.isEnabled()) {
      return 'deferred-no-config'; // se queda PENDING hasta que haya configuración
    }

    // RF-10: fuera de la ventana de 24h se requiere plantilla pre-aprobada.
    const lastInboundAt = await this.latestInboundAt(reminder.tenantId, reminder.contactId);
    if (!isWithinServiceWindow(lastInboundAt, now)) {
      if (this.isExpired(reminder, now)) {
        await this.setStatus(reminder.id, ReminderStatus.CANCELLED);
        this.logger.warn(
          `Recordatorio ${reminder.id} cancelado (expirado): fuera de la ventana de 24h y sin plantilla`,
        );
        return 'expired-cancelled';
      }
      return 'deferred-needs-template'; // se queda PENDING hasta implementar plantillas
    }

    // Dentro de la ventana: se puede enviar texto libre.
    try {
      await this.sender.sendText({
        phoneNumberId,
        to: reminder.contact.phone,
        text: reminder.message,
      });
      await this.setStatus(reminder.id, ReminderStatus.SENT);
      this.logger.log(`Recordatorio ${reminder.id} enviado a ${reminder.contact.phone}`);
      return 'sent';
    } catch (err) {
      this.logger.error(
        `Fallo enviando recordatorio ${reminder.id}: ${(err as Error).message}`,
      );
      // Acota el reintento: un fallo persistente (p. ej. teléfono inválido que
      // Meta siempre rechaza) se cancela al expirar en vez de reintentar por
      // siempre cada tick.
      if (this.isExpired(reminder, now)) {
        await this.setStatus(reminder.id, ReminderStatus.CANCELLED);
        this.logger.warn(`Recordatorio ${reminder.id} cancelado (expirado): fallo de envío persistente`);
        return 'expired-cancelled';
      }
      return 'deferred-send-failed'; // sigue PENDING y se reintenta en el próximo tick
    }
  }

  /** Un recordatorio proactivo que lleva más de `REMINDER_EXPIRY_MS` sin poder enviarse. */
  private isExpired(reminder: DueReminder, now: Date): boolean {
    return now.getTime() - reminder.remindAt.getTime() > REMINDER_EXPIRY_MS;
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

  private setStatus(id: string, status: ReminderStatus): Promise<Reminder> {
    return this.prisma.reminder.update({ where: { id }, data: { status } });
  }

  private emptyTally(): Record<DispatchOutcome, number> {
    return {
      sent: 0,
      'cancelled-no-consent': 0,
      'expired-cancelled': 0,
      'deferred-no-config': 0,
      'deferred-needs-template': 0,
      'deferred-send-failed': 0,
    };
  }
}
