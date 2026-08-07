/**
 * Tipos del webhook y de las respuestas de Evolution API.
 *
 * Solo se modela lo que el MVP consume; el payload real trae bastante más.
 * Viven aquí, junto al provider, y no en `whatsapp.types.ts`: son vocabulario
 * de un proveedor concreto y no deben filtrarse al resto del sistema.
 *
 * Contrastado con el código del proyecto (v2):
 * - Envoltorio del webhook: `src/api/integrations/event/webhook/webhook.controller.ts`
 * - Nombres de evento: `src/api/types/wa.types.ts` (enum `Events`)
 */

/** Envoltorio común de todo webhook: `{ event, instance, data, ... }`. */
export interface EvolutionWebhookBody {
  event?: string;
  instance?: string;
  data?: unknown;
  /** JID del número conectado (el del negocio). */
  sender?: string;
  date_time?: string;
}

/** `messages.upsert` — el evento que alimenta la bandeja. */
export interface EvolutionMessageData {
  key?: {
    /** "<numero>@s.whatsapp.net" para 1 a 1, "…@g.us" para grupos. */
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  pushName?: string;
  /** Segundos epoch. Baileys lo manda como número; algunas versiones, como texto. */
  messageTimestamp?: number | string;
  messageType?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string; fileName?: string };
    audioMessage?: unknown;
  };
}

/** `connection.update` — vínculo arriba o abajo. */
export interface EvolutionConnectionData {
  /** "open" = conectado; "connecting" | "close" = no operativo. */
  state?: string;
  statusReason?: number | string;
  wuid?: string;
}

/** `qrcode.updated` — el QR anterior caducó sin escanearse. */
export interface EvolutionQrData {
  qrcode?: { base64?: string; code?: string; count?: number };
  base64?: string;
}

/** Respuesta de `POST /instance/create`. */
export interface EvolutionCreateResponse {
  instance?: { instanceName?: string; status?: string };
  /** Token de la instancia. Según versión, texto plano u objeto `{ apikey }`. */
  hash?: string | { apikey?: string };
  qrcode?: { base64?: string; code?: string };
}

/** Respuesta de `GET /instance/connect/{instancia}`. */
export interface EvolutionConnectResponse {
  base64?: string;
  code?: string;
  pairingCode?: string;
  count?: number;
  instance?: { state?: string };
}

/** Respuesta de `GET /instance/connectionState/{instancia}`. */
export interface EvolutionStateResponse {
  instance?: { instanceName?: string; state?: string; owner?: string };
}

/** Respuesta de `GET /instance/fetchInstances`. */
export interface EvolutionInstanceInfo {
  name?: string;
  instanceName?: string;
  connectionStatus?: string;
  ownerJid?: string;
  number?: string;
}

/** Respuesta de `POST /message/sendText/{instancia}`. */
export interface EvolutionSendResponse {
  key?: { id?: string };
}
