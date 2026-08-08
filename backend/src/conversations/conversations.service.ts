import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Conversation,
  ConversationHandler,
  ConversationStatus,
  Message,
  MessageDirection,
  MessageSender,
} from '@prisma/client';
import { AiContextMemoryService } from '../ai/ai-context-memory.service';
import { AiWriterService } from '../ai/ai-writer.service';
import { HistoryTurn } from '../ai/ai.types';
import { assertTenantId } from '../common/tenant.util';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv.util';
import { RealtimeService } from '../realtime/realtime.service';
import { WhatsappOutboundService } from '../whatsapp/whatsapp-outbound.service';
import { ListConversationsDto } from './dto/list-conversations.dto';

/** Tope de filas en una exportación (evita respuestas enormes). */
const EXPORT_LIMIT = 5000;

/** Cuántos mensajes como máximo se resumen al cerrar una conversación (Fase 4). */
const SUMMARY_HISTORY_LIMIT = 60;

/**
 * Bandeja de conversaciones y control del handoff humano (RF-11).
 * Todo se filtra por `tenantId` (del token). Cambiar `handledBy` a HUMAN silencia
 * la respuesta automática de la IA: el worker de entrada solo responde con IA si
 * `handledBy === AI` (ver inbound-message.processor.ts).
 *
 * `Message.content` y `ConversationNote.body` se cifran en reposo (ver
 * SECURITY.md §11) — no se buscan por SQL, así que cifrarlos no cambia nada
 * visible.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: WhatsappOutboundService,
    private readonly pii: PiiCryptoService,
    private readonly ai: AiWriterService,
    private readonly contextMemory: AiContextMemoryService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Bandeja: conversaciones del tenant ordenadas por actividad reciente, con
   * búsqueda por contacto y paginación keyset (cursor). El keyset (orden estable
   * `lastMessageAt desc, id desc` + `cursor`) escala mejor que `offset` porque no
   * recorre las filas saltadas.
   */
  async list(tenantId: string, filters: ListConversationsDto) {
    assertTenantId(tenantId);
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

  /** Exporta las conversaciones del tenant a CSV. */
  async exportCsv(tenantId: string): Promise<string> {
    assertTenantId(tenantId);
    const convs = await this.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: EXPORT_LIMIT,
      include: { contact: { select: { name: true, phone: true } } },
    });
    return toCsv(
      ['Contacto', 'Telefono', 'Estado', 'Atiende', 'SinLeer', 'UltimoMensaje', 'Creada'],
      convs.map((c) => [
        c.contact.name,
        c.contact.phone,
        c.status,
        c.handledBy,
        c.unreadCount,
        c.lastMessageAt?.toISOString() ?? '',
        c.createdAt.toISOString(),
      ]),
    );
  }

  /** Detalle de una conversación con su hilo de mensajes y el contador de notas. */
  async get(tenantId: string, id: string) {
    assertTenantId(tenantId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { notes: true } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return {
      ...conversation,
      messages: conversation.messages.map((m) => ({ ...m, content: this.pii.decrypt(m.content) })),
      ...this.summaryOf(conversation),
    };
  }

  /**
   * Genera (o rehace) el resumen de la conversación para el equipo.
   *
   * Bajo demanda y no al cerrar: resumir cuesta dinero, y pagarlo por cada
   * conversación —incluidas las que nadie va a leer— es gasto seguro a cambio
   * de valor incierto. Si ya hay uno al día se devuelve el guardado, así que
   * pulsar dos veces no cobra dos veces.
   */
  async summarizeForTeam(tenantId: string, id: string, force = false) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { direction: true, content: true } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }
    if (conversation.messages.length === 0) {
      throw new BadRequestException('La conversación no tiene mensajes que resumir.');
    }

    const guardado = this.summaryOf(conversation);
    if (!force && guardado.summary && !guardado.summaryStale) {
      return guardado;
    }

    const history: HistoryTurn[] = conversation.messages.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      text: this.pii.decrypt(m.content),
    }));
    const texto = await this.ai.summarizeForTeam(history, { tenantId, conversationId: id });
    if (!texto) {
      throw new BadRequestException('No se pudo generar el resumen.');
    }

    // `summaryAt` se fija ahora, no con `lastMessageAt`: si llega un mensaje
    // mientras se genera el resumen, debe quedar marcado como desactualizado.
    const summaryAt = new Date();
    const actualizada = await this.prisma.conversation.update({
      where: { id },
      data: { summary: this.pii.encrypt(texto), summaryAt },
      select: { summary: true, summaryAt: true, lastMessageAt: true },
    });
    return this.summaryOf(actualizada);
  }

  /**
   * Descifra el resumen y dice si se quedó viejo. Está desactualizado cuando
   * llegaron mensajes después de generarlo: enseñarlo como si siguiera siendo
   * válido llevaría al equipo a actuar sobre información vencida.
   */
  private summaryOf(c: { summary: string | null; summaryAt: Date | null; lastMessageAt: Date | null }) {
    return {
      summary: c.summary ? this.pii.decrypt(c.summary) : null,
      summaryAt: c.summaryAt?.toISOString() ?? null,
      summaryStale: !!(c.summaryAt && c.lastMessageAt && c.lastMessageAt > c.summaryAt),
    };
  }

  /** Notas internas de una conversación (scoped por tenant). */
  async listNotes(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    const notes = await this.prisma.conversationNote.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return notes.map((n) => ({ ...n, body: this.pii.decrypt(n.body) }));
  }

  /** Añade una nota interna. El autor viene del contexto de confianza (token). */
  async addNote(
    tenantId: string,
    id: string,
    author: { userId: string },
    body: string,
  ) {
    await this.assertExists(tenantId, id);
    const user = await this.prisma.user.findFirst({
      where: { id: author.userId, tenantId },
      select: { name: true },
    });
    const created = await this.prisma.conversationNote.create({
      data: {
        tenantId,
        conversationId: id,
        authorId: author.userId,
        authorName: user?.name ?? 'Usuario',
        body: this.pii.encrypt(body),
      },
    });
    return { ...created, body: this.pii.decrypt(created.body) };
  }

  private async assertExists(tenantId: string, id: string): Promise<void> {
    assertTenantId(tenantId);
    const owned = await this.prisma.conversation.count({ where: { id, tenantId } });
    if (owned === 0) {
      throw new NotFoundException('Conversación no encontrada');
    }
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
    assertTenantId(tenantId);
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
        content: this.pii.encrypt(text),
      },
    });

    // Al responder un humano, la conversación queda en sus manos (RF-11).
    await this.prisma.conversation.update({
      where: { id },
      data: { handledBy: ConversationHandler.HUMAN, lastMessageAt: new Date() },
    });

    await this.deliver(tenantId, conversation.contact.phone, conversation.lastInboundAt, message, text);

    // El resto del equipo ve el mensaje al instante, sin recargar. Se avisa
    // aunque la entrega falle: el mensaje existe en la conversación igualmente.
    this.realtime.emitirATenant(tenantId, { tipo: 'mensaje', conversationId: id, direccion: 'saliente' });
    this.realtime.emitirATenant(tenantId, { tipo: 'conversacion', conversationId: id, nueva: false });

    return { ...message, content: text };
  }

  /**
   * Entrega al cliente el mensaje ya persistido. `text` es el texto plano
   * (`message.content` ya está cifrado).
   *
   * Pasa por la abstracción del canal, así que no sabe —ni le importa— qué
   * proveedor lo transporta. Si no se puede entregar (canal sin vincular,
   * ventana de servicio cerrada, proveedor caído), el mensaje se queda guardado
   * y visible en la bandeja: perder la entrega es malo, perder el registro de lo
   * que el equipo escribió lo es más.
   */
  private async deliver(
    tenantId: string,
    to: string,
    lastInboundAt: Date | null,
    message: Message,
    text: string,
  ): Promise<void> {
    const envio = await this.outbound.enviarTexto({ tenantId, to, text, lastInboundAt });
    if (envio.externalMessageId) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { whatsappMessageId: envio.externalMessageId },
      });
    }
  }

  /** Marca la conversación como leída (pone el contador de sin leer a 0). */
  async markRead(tenantId: string, id: string): Promise<Conversation> {
    assertTenantId(tenantId);
    const owned = await this.prisma.conversation.count({ where: { id, tenantId } });
    if (owned === 0) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  }

  /** RF-11: pasar la conversación a un humano (silencia la IA). */
  handoffToHuman(tenantId: string, id: string): Promise<Conversation> {
    return this.setHandler(tenantId, id, ConversationHandler.HUMAN);
  }

  /** RF-11: devolver la conversación a la IA. */
  handbackToAi(tenantId: string, id: string): Promise<Conversation> {
    return this.setHandler(tenantId, id, ConversationHandler.AI);
  }

  /**
   * Cerrar / reabrir una conversación. Al cerrar, genera (best-effort) un
   * recuerdo de contexto del contacto a partir de un resumen de la
   * conversación (Fase 4, ver docs/DECISIONS.md) — no bloquea ni falla el
   * cierre si la memoria de contexto no está disponible o algo sale mal.
   */
  async setStatus(
    tenantId: string,
    id: string,
    status: ConversationStatus,
  ): Promise<Conversation> {
    const conversation = await this.updateScoped(tenantId, id, { status });
    if (status === ConversationStatus.CLOSED) {
      await this.rememberClosedConversation(tenantId, id);
    }
    return conversation;
  }

  private async rememberClosedConversation(tenantId: string, conversationId: string): Promise<void> {
    if (!this.contextMemory.isEnabled()) return;
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          contactId: true,
          messages: {
            orderBy: { createdAt: 'asc' },
            take: SUMMARY_HISTORY_LIMIT,
            select: { direction: true, content: true },
          },
        },
      });
      if (!conversation || conversation.messages.length === 0) return;

      const history: HistoryTurn[] = conversation.messages.map((m) => ({
        role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
        text: this.pii.decrypt(m.content),
      }));
      const summary = await this.ai.summarize(history, { tenantId, conversationId });
      if (!summary) return;
      await this.contextMemory.remember(tenantId, conversation.contactId, conversationId, summary);
    } catch (err) {
      this.logger.error(
        `No se pudo generar memoria de contexto al cerrar la conversación ${conversationId}: ${(err as Error).message}`,
      );
    }
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
