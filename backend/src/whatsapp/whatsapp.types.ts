/**
 * Tipos mínimos del payload del webhook de la Meta Cloud API (WhatsApp).
 * Solo se modela lo que el MVP consume; el payload real trae más campos.
 * Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

export interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  field: string;
  value: WhatsAppChangeValue;
}

export interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number?: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  wa_id: string;
  profile?: { name?: string };
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

export interface WhatsAppStatus {
  id: string;
  status: string;
  recipient_id: string;
}

/**
 * Lo que se encola para procesar un mensaje fuera del ciclo del webhook.
 *
 * Es vocabulario propio, no de ningún proveedor: el worker que lo consume no
 * sabe —ni debe saber— si el mensaje vino de Evolution o de Meta. Antes esto
 * hablaba de `phoneNumberId` y `waMessageId`, y esa fuga era justo lo que
 * habría obligado a reescribir el worker el día de la migración.
 *
 * Todo son primitivos porque BullMQ serializa el job a JSON: un `Date` llegaría
 * al otro lado convertido en texto y sin que el tipo lo advirtiera.
 */
export interface InboundMessageJob {
  /** Resuelto en el webhook: el worker no vuelve a deducir de quién es esto. */
  tenantId: string;
  /** Identificador de la sesión en el proveedor. */
  externalId: string;
  /** ID del mensaje en el proveedor: la clave de deduplicación. */
  externalMessageId: string;
  direccion: 'entrante' | 'saliente';
  /** Teléfono del cliente, en dígitos (E.164 sin `+`). */
  contactPhone: string;
  contactName: string | null;
  tipo: string;
  texto: string;
  /** ISO 8601. */
  enviadoEn: string;
}
