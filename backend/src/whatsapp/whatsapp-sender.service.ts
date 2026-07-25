import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Resultado de un envío saliente a la Meta Cloud API. */
export interface SendResult {
  /** ID del mensaje en Meta (wamid) si el envío fue aceptado. */
  messageId: string | null;
}

/**
 * Envía mensajes salientes al cliente final vía la Meta Cloud API oficial
 * (WhatsApp). Cada tenant envía desde SU propio `phone_number_id`; el access
 * token es, en el MVP, global —un único número de pruebas, ver DECISIONS.md—;
 * el onboarding multi-número con token por tenant se difiere a fases posteriores.
 *
 * Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
@Injectable()
export class WhatsappSenderService {
  private readonly logger = new Logger(WhatsappSenderService.name);
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('whatsapp.accessToken') ?? '';
    this.baseUrl =
      this.config.get<string>('whatsapp.apiBaseUrl') ?? 'https://graph.facebook.com';
    this.apiVersion = this.config.get<string>('whatsapp.graphApiVersion') ?? 'v21.0';
  }

  /**
   * El envío está habilitado si hay access token configurado. Sin él (arranque
   * local / modo mock sin credenciales de Meta) la respuesta se persiste pero no
   * se envía —igual que `AiService.isEnabled()`—, para no romper el flujo local.
   */
  isEnabled(): boolean {
    return this.accessToken.length > 0;
  }

  /**
   * Envía un mensaje de texto libre al cliente. Solo válido dentro de la ventana
   * de servicio de 24h (RF-10); la comprobación de la ventana es responsabilidad
   * de quien llama. Devuelve el wamid si Meta acepta el envío; lanza si Meta
   * responde con error.
   */
  async sendText(params: {
    phoneNumberId: string;
    to: string;
    text: string;
  }): Promise<SendResult> {
    if (!this.isEnabled()) {
      this.logger.warn(
        'Envío deshabilitado: falta WHATSAPP_ACCESS_TOKEN; respuesta no enviada a Meta',
      );
      return { messageId: null };
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${params.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: { preview_url: false, body: params.text },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `Meta Cloud API respondió ${response.status}: ${errText.slice(0, 500)}`,
      );
    }

    const json = (await response.json()) as { messages?: { id: string }[] };
    const messageId = json.messages?.[0]?.id ?? null;
    this.logger.log(`Mensaje saliente enviado a ${params.to} (wamid ${messageId})`);
    return { messageId };
  }
}
