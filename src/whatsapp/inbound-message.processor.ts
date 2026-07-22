import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageSender,
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { InboundMessageJob } from './whatsapp.types';

/**
 * Worker que procesa cada mensaje entrante de WhatsApp fuera del ciclo del
 * webhook. Persiste contacto/conversación/mensaje con aislamiento por tenant.
 * Todavía NO invoca a la IA (eso es el módulo `ai`, siguiente paso); aquí solo
 * se asegura la persistencia y el opt-in.
 */
@Processor(WHATSAPP_INBOUND_QUEUE)
export class InboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(private readonly prisma: PrismaService) {
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
      create: {
        tenantId,
        phone: data.from,
        name: data.contactName ?? null,
      },
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
  }

  /** El timestamp de Meta viene en segundos epoch (string). */
  private toDate(timestamp: string): Date {
    const seconds = Number(timestamp);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  }
}
