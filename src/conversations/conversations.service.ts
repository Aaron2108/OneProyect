import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Conversation,
  ConversationHandler,
  ConversationStatus,
  Message,
  MessageDirection,
  MessageSender,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { isWithinServiceWindow } from '../whatsapp/whatsapp-window.util';
import { ListConversationsDto } from './dto/list-conversations.dto';

/**
 * Bandeja de conversaciones y control del handoff humano (RF-11).
 * Todo se filtra por `tenantId` (del token). Cambiar `handledBy` a HUMAN silencia
 * la respuesta automática de la IA: el worker de entrada solo responde con IA si
 * `handledBy === AI` (ver inbound-message.processor.ts).
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WhatsappSenderService,
  ) {}

  /**
   * Bandeja: conversaciones del tenant ordenadas por actividad reciente, con
   * búsqueda por contacto y paginación keyset (cursor). El keyset (orden estable
   * `lastMessageAt desc, id desc` + `cursor`) escala mejor que `offset` porque no
   * recorre las filas saltadas.
   */
  async list(tenantId: string, filters: ListConversationsDto) {
    const limit = filters.limit ?? 25;
    const q = filters.q?.trim();
    const items = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        status: filters.status,
        handledBy: filters.handledBy,
        ...(q
          ? {
              contact: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { phone: { contains: q } },
                ],
              },
            }
          : {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    });
    const nextCursor = items.length === limit ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /** Detalle de una conversación con su hilo de mensajes. */
  async get(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return conversation;
  }

  /**
   * Un humano responde manualmente al cliente desde la bandeja. Persiste el
   * mensaje (OUTBOUND/HUMAN), pasa la conversación a HUMAN (para que la IA no
   * responda por encima del agente) y lo envía por la Meta Cloud API dentro de
   * la ventana de 24h (RF-10). El mensaje queda guardado aunque el envío falle.
   */
  async sendManualMessage(
    tenantId: string,
    id: string,
    text: string,
  ): Promise<Message> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: { contact: { select: { phone: true } }, tenant: { select: { whatsappPhoneNumberId: true } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.HUMAN,
        type: 'text',
        content: text,
      },
    });

    // Al responder un humano, la conversación queda en sus manos (RF-11).
    await this.prisma.conversation.update({
      where: { id },
      data: { handledBy: ConversationHandler.HUMAN, lastMessageAt: new Date() },
    });

    await this.deliver(conversation.tenant.whatsappPhoneNumberId, conversation.contact.phone, conversation.lastInboundAt, message, id);
    return message;
  }

  /** Envía el mensaje ya persistido al cliente por Meta (si es posible). */
  private async deliver(
    phoneNumberId: string | null,
    to: string,
    lastInboundAt: Date | null,
    message: Message,
    conversationId: string,
  ): Promise<void> {
    if (!this.sender.isEnabled()) {
      return; // sin credenciales de Meta (local): mensaje persistido, no enviado
    }
    if (!phoneNumberId) {
      this.logger.warn(`Tenant sin whatsappPhoneNumberId; mensaje ${message.id} no enviado`);
      return;
    }
    if (!isWithinServiceWindow(lastInboundAt)) {
      this.logger.warn(
        `Ventana de 24h cerrada (conversación ${conversationId}); se requiere plantilla, envío omitido`,
      );
      return;
    }
    try {
      const { messageId: wamid } = await this.sender.sendText({
        phoneNumberId,
        to,
        text: message.content,
      });
      if (wamid) {
        await this.prisma.message.update({
          where: { id: message.id },
          data: { whatsappMessageId: wamid },
        });
      }
    } catch (err) {
      this.logger.error(`Fallo enviando mensaje manual a Meta: ${(err as Error).message}`);
    }
  }

  /** RF-11: pasar la conversación a un humano (silencia la IA). */
  handoffToHuman(tenantId: string, id: string): Promise<Conversation> {
    return this.setHandler(tenantId, id, ConversationHandler.HUMAN);
  }

  /** RF-11: devolver la conversación a la IA. */
  handbackToAi(tenantId: string, id: string): Promise<Conversation> {
    return this.setHandler(tenantId, id, ConversationHandler.AI);
  }

  /** Cerrar / reabrir una conversación. */
  setStatus(
    tenantId: string,
    id: string,
    status: ConversationStatus,
  ): Promise<Conversation> {
    return this.updateScoped(tenantId, id, { status });
  }

  private setHandler(
    tenantId: string,
    id: string,
    handledBy: ConversationHandler,
  ): Promise<Conversation> {
    return this.updateScoped(tenantId, id, { handledBy });
  }

  /**
   * Actualiza una conversación asegurando primero que pertenece al tenant.
   * (Prisma `update` solo admite un id único en `where`, por eso se comprueba
   * la pertenencia con un `count` previo en vez de en el propio `update`.)
   */
  private async updateScoped(
    tenantId: string,
    id: string,
    data: { handledBy?: ConversationHandler; status?: ConversationStatus },
  ): Promise<Conversation> {
    const owned = await this.prisma.conversation.count({
      where: { id, tenantId },
    });
    if (owned === 0) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return this.prisma.conversation.update({ where: { id }, data });
  }
}
