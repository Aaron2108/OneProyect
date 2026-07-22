import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Conversation,
  ConversationHandler,
  ConversationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListConversationsDto } from './dto/list-conversations.dto';

/**
 * Bandeja de conversaciones y control del handoff humano (RF-11).
 * Todo se filtra por `tenantId` (del token). Cambiar `handledBy` a HUMAN silencia
 * la respuesta automática de la IA: el worker de entrada solo responde con IA si
 * `handledBy === AI` (ver inbound-message.processor.ts).
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bandeja: conversaciones del tenant ordenadas por actividad reciente. */
  list(tenantId: string, filters: ListConversationsDto) {
    return this.prisma.conversation.findMany({
      where: {
        tenantId,
        status: filters.status,
        handledBy: filters.handledBy,
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    });
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
