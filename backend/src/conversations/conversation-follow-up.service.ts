import { Injectable, Logger } from '@nestjs/common';
import { ConsentStatus, ConversationHandler, ConversationStatus, MessageDirection, ReminderStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { HistoryTurn } from '../ai/ai.types';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { FOLLOW_UP_DELAY_MS, FOLLOW_UP_SOURCE, MAX_FOLLOW_UPS, SCAN_BATCH } from './follow-up.constants';

/** Cuántos mensajes recientes se le pasan a la IA para redactar el seguimiento. */
const HISTORY_LIMIT = 10;

type FollowUpCandidate = {
  id: string;
  tenantId: string;
  contactId: string;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  followUpCount: number;
  tenant: { name: string };
  contact: { name: string | null; phone: string };
  messages: Array<{ direction: MessageDirection; content: string }>;
};

/**
 * Seguimiento automático sin intervención humana (Fase 4, ver docs/DECISIONS.md):
 * si el contacto no respondió al último mensaje de una conversación que
 * atiende la IA, se le envía un único mensaje de seguimiento (por defecto,
 * ver `MAX_FOLLOW_UPS`) en vez de dejar la conversación morir en silencio.
 *
 * Reutiliza deliberadamente la infraestructura de `ReminderDispatchService`
 * para el envío real: crea un `Reminder` (marcado con `source: "auto-followup"`)
 * en vez de enviar directamente, así el seguimiento respeta el mismo
 * consentimiento (RF-12), ventana de 24h (RF-10) y backoff que ya están
 * probados ahí — no se duplica esa lógica.
 */
@Injectable()
export class ConversationFollowUpService {
  private readonly logger = new Logger(ConversationFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly pii: PiiCryptoService,
  ) {}

  async scanAndSchedule(now: Date = new Date()): Promise<{ scheduled: number }> {
    const threshold = new Date(now.getTime() - FOLLOW_UP_DELAY_MS);
    const candidates = (await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.OPEN,
        handledBy: ConversationHandler.AI,
        followUpCount: { lt: MAX_FOLLOW_UPS },
        lastMessageAt: { not: null },
        contact: { consent: { status: ConsentStatus.GRANTED } },
        OR: [
          { lastFollowUpAt: null, lastMessageAt: { lte: threshold } },
          { lastFollowUpAt: { lte: threshold } },
        ],
      },
      take: SCAN_BATCH,
      include: {
        tenant: { select: { name: true } },
        contact: { select: { name: true, phone: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT, select: { direction: true, content: true } },
      },
    })) as unknown as FollowUpCandidate[];

    let scheduled = 0;
    for (const conv of candidates) {
      // El pre-filtro de arriba es una aproximación (por fecha); aquí se confirma
      // que el último mensaje fue saliente — si el contacto ya respondió, se salta.
      if (conv.lastInboundAt && conv.lastMessageAt && conv.lastInboundAt >= conv.lastMessageAt) {
        continue;
      }
      if (await this.scheduleOne(conv, now)) scheduled += 1;
    }
    if (candidates.length > 0) {
      this.logger.log(`Seguimiento automático: ${scheduled}/${candidates.length} conversaciones programadas`);
    }
    return { scheduled };
  }

  private async scheduleOne(conv: FollowUpCandidate, now: Date): Promise<boolean> {
    // Claim optimista (compare-and-swap sobre followUpCount): si otra
    // instancia/tick ya la tomó, el contador ya no coincide y no hace nada.
    const claim = await this.prisma.conversation.updateMany({
      where: { id: conv.id, followUpCount: conv.followUpCount },
      data: { followUpCount: { increment: 1 }, lastFollowUpAt: now },
    });
    if (claim.count === 0) return false;

    try {
      const history: HistoryTurn[] = conv.messages
        .slice()
        .reverse()
        .map((m) => ({
          role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
          text: this.pii.decrypt(m.content),
        }));
      const text = await this.ai.generateFollowUp(
        {
          tenantId: conv.tenantId,
          tenantName: conv.tenant.name,
          contactId: conv.contactId,
          contactName: conv.contact.name,
          contactPhone: conv.contact.phone,
          conversationId: conv.id,
        },
        history,
      );
      if (!text) return false;

      await this.prisma.reminder.create({
        data: {
          tenantId: conv.tenantId,
          contactId: conv.contactId,
          message: text,
          remindAt: now,
          status: ReminderStatus.PENDING,
          source: FOLLOW_UP_SOURCE,
        },
      });
      this.logger.log(`Seguimiento automático programado para la conversación ${conv.id}`);
      return true;
    } catch (err) {
      this.logger.error(
        `No se pudo generar el seguimiento automático de la conversación ${conv.id}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
