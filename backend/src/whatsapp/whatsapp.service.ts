import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaProvider } from './providers/meta.provider';
import {
  timingSafeStringEqual,
  verifyWhatsAppSignature,
} from './whatsapp-signature.util';
import { WhatsappIngestService } from './whatsapp-ingest.service';
import { WhatsAppWebhookBody } from './whatsapp.types';

/**
 * La parte del webhook de Meta que no se puede abstraer: la verificación de
 * registro (`hub.*`) y la firma HMAC del cuerpo, que son suyas y de nadie más.
 *
 * Traducir el payload ya no se hace aquí sino en `MetaProvider`, y repartir los
 * eventos tampoco: de eso se encarga `WhatsappIngestService`, el mismo que
 * atiende a Evolution. Lo que queda es exactamente lo que distingue a Meta.
 */
@Injectable()
export class WhatsappService {
  constructor(
    private readonly config: ConfigService,
    private readonly meta: MetaProvider,
    private readonly ingest: WhatsappIngestService,
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
   * Traduce el payload de Meta y lo entrega a la ingesta común.
   *
   * Se usa `MetaProvider` explícitamente y no el proveedor activo: esta ruta ES
   * el webhook de Meta, así que quien lo interpreta está decidido de antemano.
   * Si el negocio no tiene una instancia META registrada, la ingesta descarta
   * los eventos por sí sola al no encontrar a su dueño.
   */
  async enqueueInbound(body: WhatsAppWebhookBody): Promise<number> {
    return this.ingest.ingerir(this.meta.interpretarWebhook(body));
  }
}
