import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ConsentStatus,
  Contact,
  Conversation,
  ConversationHandler,
  ConversationStatus,
  MessageDirection,
  MessageSender,
  Tenant,
} from '@prisma/client';
import { Job } from 'bullmq';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AiService } from '../ai/ai.service';
import { HistoryTurn } from '../ai/ai.types';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { requestsHumanAgent } from './whatsapp-handoff.util';
import { WhatsappOutboundService } from './whatsapp-outbound.service';
import { InboundMessageJob } from './whatsapp.types';

/** Cuántos mensajes recientes de contexto se le pasan a la IA. */
const HISTORY_LIMIT = 20;

/**
 * Worker que procesa cada mensaje de WhatsApp fuera del ciclo del webhook.
 * Persiste contacto/conversación/mensaje con aislamiento por tenant y, si la
 * conversación la maneja la IA, genera una respuesta contextual.
 *
 * No sabe qué proveedor trajo el mensaje: recibe un job ya normalizado y envía
 * a través de `WhatsappOutboundService`. Esa es la razón de que la migración a
 * Meta no toque este archivo, que es el que concentra las reglas de negocio.
 */
@Processor(WHATSAPP_INBOUND_QUEUE)
export class InboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly outbound: WhatsappOutboundService,
    private readonly pii: PiiCryptoService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJob>): Promise<void> {
    const data = job.data;
    const tenantId = data.tenantId;

    // 1. El tenant ya lo resolvió el webhook (a partir de la instancia); aquí
    //    solo se carga. Si desapareció entre medias, no hay nada que hacer.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      this.logger.warn(`Tenant ${tenantId} inexistente; mensaje ${data.externalMessageId} ignorado`);
      return;
    }

    // 2. Dedup: reenvío del proveedor, o eco de un mensaje que ya guardamos al
    //    enviarlo desde la bandeja.
    const existente = await this.prisma.message.findUnique({
      where: {
        tenantId_whatsappMessageId: { tenantId, whatsappMessageId: data.externalMessageId },
      },
    });
    if (existente) {
      this.logger.debug(`Mensaje ${data.externalMessageId} ya procesado; se omite`);
      return;
    }

    const contacto = await this.upsertContacto(tenantId, data);
    const { conversacion, esNueva } = await this.conversacionAbierta(tenantId, contacto.id);
    const enviadoEn = new Date(data.enviadoEn);

    if (data.direccion === 'saliente') {
      await this.registrarSaliente(tenant, conversacion, data, enviadoEn, esNueva);
      return;
    }

    await this.registrarEntrante(tenant, contacto, conversacion, data, enviadoEn, esNueva);
  }

  // -------------------------------------------------------------------------
  // Mensajes del cliente
  // -------------------------------------------------------------------------

  private async registrarEntrante(
    tenant: Tenant,
    contacto: Contact,
    conversacion: Conversation,
    data: InboundMessageJob,
    enviadoEn: Date,
    esNueva: boolean,
  ): Promise<void> {
    const tenantId = tenant.id;

    // Opt-in (RF-12): el contacto inició la conversación → consentimiento.
    await this.prisma.contactConsent.upsert({
      where: { contactId: contacto.id },
      create: {
        tenantId,
        contactId: contacto.id,
        status: ConsentStatus.GRANTED,
        source: 'mensaje entrante',
        grantedAt: new Date(),
      },
      update: {},
    });

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversacion.id,
        direction: MessageDirection.INBOUND,
        sender: MessageSender.CONTACT,
        whatsappMessageId: data.externalMessageId,
        type: data.tipo,
        content: this.pii.encrypt(data.texto),
        createdAt: enviadoEn,
      },
    });

    // Marcas de tiempo (RF-10: la ventana de 24h se mide desde aquí) y contador
    // de sin leer. `followUpCount` se resetea: el contacto respondió, se rompe la
    // racha de silencio que dispara el seguimiento automático.
    await this.prisma.conversation.update({
      where: { id: conversacion.id },
      data: {
        lastInboundAt: enviadoEn,
        lastMessageAt: enviadoEn,
        unreadCount: { increment: 1 },
        followUpCount: 0,
      },
    });

    this.avisar(tenantId, conversacion.id, 'entrante', esNueva);
    this.logger.log(
      `Mensaje ${data.externalMessageId} de ${data.contactPhone} persistido (tenant ${tenantId})`,
    );

    // Handoff automático (RF-11): si el cliente pide una persona, la conversación
    // pasa a un humano y la IA no responde por encima.
    if (
      conversacion.handledBy === ConversationHandler.AI &&
      requestsHumanAgent(data.texto)
    ) {
      await this.prisma.conversation.update({
        where: { id: conversacion.id },
        data: { handledBy: ConversationHandler.HUMAN },
      });
      this.avisar(tenantId, conversacion.id, 'entrante', false);
      this.logger.log(
        `Conversación ${conversacion.id} escalada a humano (solicitud del cliente)`,
      );
      return;
    }

    if (conversacion.handledBy === ConversationHandler.AI && this.ai.isEnabled()) {
      await this.respondWithAi(tenant, contacto, conversacion.id, enviadoEn);
    }
  }

  // -------------------------------------------------------------------------
  // Mensajes que salen del negocio sin pasar por el panel
  // -------------------------------------------------------------------------

  /**
   * El dueño contestó desde el WhatsApp de su móvil.
   *
   * Se guarda como saliente de una persona (no de la IA) y la conversación pasa
   * a manos humanas: alguien ya está atendiendo por otro medio, y que la IA
   * siguiera respondiendo dejaría dos voces contestando al mismo cliente.
   *
   * No toca `unreadCount` ni `lastInboundAt`: nadie del equipo tiene nada nuevo
   * que leer, y la ventana de servicio se mide desde el cliente, no desde aquí.
   */
  private async registrarSaliente(
    tenant: Tenant,
    conversacion: Conversation,
    data: InboundMessageJob,
    enviadoEn: Date,
    esNueva: boolean,
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversacion.id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.HUMAN,
        whatsappMessageId: data.externalMessageId,
        type: data.tipo,
        content: this.pii.encrypt(data.texto),
        createdAt: enviadoEn,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversacion.id },
      data: { lastMessageAt: enviadoEn, handledBy: ConversationHandler.HUMAN },
    });

    this.avisar(tenant.id, conversacion.id, 'saliente', esNueva);
    this.logger.log(
      `Mensaje saliente ${data.externalMessageId} registrado desde el teléfono del negocio`,
    );
  }

  // -------------------------------------------------------------------------
  // Piezas compartidas
  // -------------------------------------------------------------------------

  private async upsertContacto(tenantId: string, data: InboundMessageJob): Promise<Contact> {
    return this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: data.contactPhone } },
      create: { tenantId, phone: data.contactPhone, name: data.contactName },
      update: data.contactName ? { name: data.contactName } : {},
    });
  }

  private async conversacionAbierta(
    tenantId: string,
    contactId: string,
  ): Promise<{ conversacion: Conversation; esNueva: boolean }> {
    const abierta = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId, status: ConversationStatus.OPEN },
      orderBy: { createdAt: 'desc' },
    });
    if (abierta) return { conversacion: abierta, esNueva: false };

    const creada = await this.prisma.conversation.create({ data: { tenantId, contactId } });
    return { conversacion: creada, esNueva: true };
  }

  /** Avisa al panel para que la bandeja se mueva sola. */
  private avisar(
    tenantId: string,
    conversationId: string,
    direccion: 'entrante' | 'saliente',
    nueva: boolean,
  ): void {
    this.realtime.emitirATenant(tenantId, { tipo: 'mensaje', conversationId, direccion });
    this.realtime.emitirATenant(tenantId, { tipo: 'conversacion', conversationId, nueva });
  }

  /**
   * Genera y persiste la respuesta de la IA. Los errores no propagan (para no
   * reintentar en bucle una falla persistente del modelo); quedan logueados.
   */
  private async respondWithAi(
    tenant: Tenant,
    contact: Contact,
    conversationId: string,
    lastInboundAt: Date,
  ): Promise<void> {
    try {
      const ctx = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        conversationId,
      };

      // Guarda de costo. Si se agotó el presupuesto se escala a una persona en
      // vez de no responder: desde el lado del cliente, callarse es que el
      // negocio lo dejó en visto.
      const limite = await this.ai.withinRateLimit(conversationId, tenant.id);
      if (!limite.allowed) {
        await this.ai.escalateForCostLimit(ctx, limite.reason!);
        return;
      }

      const history = await this.loadHistory(conversationId);
      const reply = await this.ai.respond(ctx, history);
      if (!reply.text) return;

      const persisted = await this.prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.AI,
          type: 'text',
          content: this.pii.encrypt(reply.text),
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
      this.avisar(tenant.id, conversationId, 'saliente', false);

      this.logger.log(
        `IA respondió en conversación ${conversationId} (${reply.actions.length} acción/es)`,
      );

      // La respuesta queda guardada aunque no se pueda entregar (canal caído,
      // ventana cerrada): así siempre es visible en la bandeja.
      const envio = await this.outbound.enviarTexto({
        tenantId: tenant.id,
        to: contact.phone,
        text: reply.text,
        lastInboundAt,
      });
      if (envio.externalMessageId) {
        await this.prisma.message.update({
          where: { id: persisted.id },
          data: { whatsappMessageId: envio.externalMessageId },
        });
      }
    } catch (err) {
      this.logger.error(`Fallo generando respuesta de IA: ${(err as Error).message}`);
    }
  }

  /** Carga los últimos mensajes de la conversación como historial para la IA. */
  private async loadHistory(conversationId: string): Promise<HistoryTurn[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return messages.reverse().map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      text: this.pii.decrypt(m.content),
    }));
  }
}
