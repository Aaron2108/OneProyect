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

/** Payload normalizado que se encola para procesamiento asíncrono. */
export interface InboundMessageJob {
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  contactName?: string;
  type: string;
  text: string;
  timestamp: string;
}
