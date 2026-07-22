import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ConsentStatus,
  ConversationHandler,
  ConversationStatus,
  MessageDirection,
  MessageSender,
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { HistoryTurn } from '../ai/ai.types';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { isWithinServiceWindow } from './whatsapp-window.util';
import { InboundMessageJob } from './whatsapp.types';

/** Cuántos mensajes recientes de contexto se le pasan a la IA. */
const HISTORY_LIMIT = 20;

/**
 * Worker que procesa cada mensaje entrante de WhatsApp fuera del ciclo del
 * webhook. Persiste contacto/conversación/mensaje con aislamiento por tenant y,
 * si la conversación la maneja la IA, genera una respuesta contextual.
 */
@Processor(WHATSAPP_INBOUND_QUEUE)
export class InboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly sender: WhatsappSenderService,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJob>): Promise<void> {
    const data = job.data;

    // 1. Resolver el tenant dueño de este número de WhatsApp.
    const tenant = await this.prisma.tenant.findUnique({
      where: { whatsappPhoneNumberId: data.phoneNumberId },
    });
    if (!tenant) {
      this.logger.warn(
        `Sin tenant para phone_number_id=${data.phoneNumberId}; mensaje ${data.waMessageId} ignorado`,
      );
      return;
    }
    const tenantId = tenant.id;

    // 2. Dedup: si el mensaje ya existe (reenvío de Meta), no reprocesar.
    const existing = await this.prisma.message.findUnique({
      where: {
        tenantId_whatsappMessageId: {
          tenantId,
          whatsappMessageId: data.waMessageId,
        },
      },
    });
    if (existing) {
      this.logger.debug(`Mensaje ${data.waMessageId} ya procesado; se omite`);
      return;
    }

    // 3. Upsert del contacto por (tenant, teléfono).
    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: data.from } },
      create: { tenantId, phone: data.from, name: data.contactName ?? null },
      update: data.contactName ? { name: data.contactName } : {},
    });

    // 4. Opt-in (RF-12): el contacto inició la conversación → consentimiento.
    await this.prisma.contactConsent.upsert({
      where: { contactId: contact.id },
      create: {
        tenantId,
        contactId: contact.id,
        status: ConsentStatus.GRANTED,
        source: 'mensaje entrante',
        grantedAt: new Date(),
      },
      update: {},
    });

    // 5. Conversación abierta del contacto (o crear una).
    let conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id, status: ConversationStatus.OPEN },
      orderBy: { createdAt: 'desc' },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { tenantId, contactId: contact.id },
      });
    }

    const sentAt = this.toDate(data.timestamp);

    // 6. Persistir el mensaje entrante.
    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        sender: MessageSender.CONTACT,
        whatsappMessageId: data.waMessageId,
        type: data.type,
        content: data.text,
        createdAt: sentAt,
      },
    });

    // 7. Actualizar marcas de tiempo (RF-10: ventana de 24h se mide desde aquí).
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: sentAt, lastMessageAt: sentAt },
    });

    this.logger.log(
      `Mensaje ${data.waMessageId} de ${data.from} persistido (tenant ${tenantId})`,
    );

    // 8. Respuesta de IA (solo si la conversación la maneja la IA — RF-11 handoff).
    if (conversation.handledBy === ConversationHandler.AI && this.ai.isEnabled()) {
      await this.respondWithAi(tenant, contact, conversation.id, sentAt);
    }
  }

  /**
   * Genera y persiste la respuesta de la IA. Los errores no propagan (para no
   * reintentar en bucle una falla persistente del modelo); quedan logueados.
   */
  private async respondWithAi(
    tenant: { id: string; name: string; whatsappPhoneNumberId: string | null },
    contact: { id: string; name: string | null; phone: string },
    conversationId: string,
    lastInboundAt: Date,
  ): Promise<void> {
    try {
      if (!(await this.ai.withinRateLimit(conversationId))) {
        this.logger.warn(
          `Límite de IA alcanzado en conversación ${conversationId}; sin respuesta automática`,
        );
        return;
      }

      const history = await this.loadHistory(conversationId);
      const reply = await this.ai.respond(
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
          conversationId,
        },
        history,
      );

      if (!reply.text) return;

      // Persistir la respuesta como mensaje saliente de la IA.
      const persisted = await this.prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.AI,
          type: 'text',
          content: reply.text,
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      this.logger.log(
        `IA respondió en conversación ${conversationId} (${reply.actions.length} acción/es)`,
      );

      // Enviar la respuesta al cliente vía Meta Cloud API (RF-10).
      await this.sendReply(tenant, contact.phone, conversationId, persisted.id, reply.text, lastInboundAt);
    } catch (err) {
      this.logger.error(`Fallo generando respuesta de IA: ${(err as Error).message}`);
    }
  }

  /**
   * Envía la respuesta ya persistida al cliente por la Meta Cloud API. La respuesta
   * queda guardada aunque el envío no sea posible (sin credenciales, ventana de 24h
   * cerrada o error de Meta): así siempre es visible en la bandeja. Al enviarse con
   * éxito se guarda el wamid devuelto por Meta (para futuro seguimiento de estado).
   */
  private async sendReply(
    tenant: { id: string; whatsappPhoneNumberId: string | null },
    to: string,
    conversationId: string,
    messageId: string,
    text: string,
    lastInboundAt: Date,
  ): Promise<void> {
    if (!this.sender.isEnabled()) {
      return; // sin credenciales de Meta (local/mock): respuesta persistida, no enviada
    }
    if (!tenant.whatsappPhoneNumberId) {
      this.logger.warn(`Tenant ${tenant.id} sin whatsappPhoneNumberId; respuesta no enviada`);
      return;
    }
    // RF-10: fuera de la ventana de 24h Meta exige plantilla pre-aprobada (diferido).
    if (!isWithinServiceWindow(lastInboundAt)) {
      this.logger.warn(
        `Ventana de 24h cerrada (conversación ${conversationId}); se requiere plantilla, envío omitido`,
      );
      return;
    }

    try {
      const { messageId: wamid } = await this.sender.sendText({
        phoneNumberId: tenant.whatsappPhoneNumberId,
        to,
        text,
      });
      if (wamid) {
        await this.prisma.message.update({
          where: { id: messageId },
          data: { whatsappMessageId: wamid },
        });
      }
    } catch (err) {
      this.logger.error(`Fallo enviando respuesta a Meta: ${(err as Error).message}`);
    }
  }

  /** Carga los últimos mensajes de la conversación como historial para la IA. */
  private async loadHistory(conversationId: string): Promise<HistoryTurn[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return messages
      .reverse()
      .map((m) => ({
        role:
          m.direction === MessageDirection.INBOUND
            ? ('user' as const)
            : ('assistant' as const),
        text: m.content,
      }));
  }

  /** El timestamp de Meta viene en segundos epoch (string). */
  private toDate(timestamp: string): Date {
    const seconds = Number(timestamp);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  }
}
