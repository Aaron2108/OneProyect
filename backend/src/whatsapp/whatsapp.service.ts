import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  PROCESS_INBOUND_MESSAGE,
  WHATSAPP_INBOUND_QUEUE,
} from './whatsapp.constants';
import {
  timingSafeStringEqual,
  verifyWhatsAppSignature,
} from './whatsapp-signature.util';
import { InboundMessageJob, WhatsAppWebhookBody } from './whatsapp.types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(WHATSAPP_INBOUND_QUEUE) private readonly inboundQueue: Queue,
  ) {}

  /**
   * Verificación del webhook exigida por Meta al registrar la integración.
   * Devuelve el `challenge` si el modo y el verify token coinciden; si no, null.
   */
  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    const expected = this.config.get<string>('whatsapp.verifyToken') ?? '';
    if (mode === 'subscribe' && token && expected && timingSafeStringEqual(token, expected)) {
      return challenge ?? '';
    }
    return null;
  }

  /** Valida la firma del webhook con el App Secret configurado. */
  isValidSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const appSecret = this.config.get<string>('whatsapp.appSecret') ?? '';
    return verifyWhatsAppSignature(rawBody, signature, appSecret);
  }

  /**
   * Extrae los mensajes entrantes del payload y los encola para procesamiento
   * asíncrono. No hace trabajo pesado (IA, BD) aquí: el webhook debe responder
   * rápido a Meta (ARCHITECTURE.md §2). Los eventos de estado (entregas/lecturas)
   * se ignoran para no reprocesarlos (guarda NFR).
   */
  async enqueueInbound(body: WhatsAppWebhookBody): Promise<number> {
    let enqueued = 0;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const messages = value?.messages ?? [];
        if (messages.length === 0) {
          continue; // statuses u otros eventos sin mensaje entrante
        }
        const phoneNumberId = value.metadata?.phone_number_id;
        const contactName = value.contacts?.[0]?.profile?.name;

        for (const message of messages) {
          const job: InboundMessageJob = {
            phoneNumberId,
            waMessageId: message.id,
            from: message.from,
            contactName,
            type: message.type,
            text: message.text?.body ?? '',
            timestamp: message.timestamp,
          };
          // jobId = id de Meta → BullMQ deduplica reenvíos del mismo mensaje.
          // BullMQ no admite ":" en el jobId, por eso el separador es "_".
          await this.inboundQueue.add(PROCESS_INBOUND_MESSAGE, job, {
            jobId: `${phoneNumberId}_${message.id}`,
            removeOnComplete: true,
            removeOnFail: 100,
          });
          enqueued++;
        }
      }
    }
    if (enqueued > 0) {
      this.logger.log(`Encolados ${enqueued} mensaje(s) entrante(s) de WhatsApp`);
    }
    return enqueued;
  }
}
