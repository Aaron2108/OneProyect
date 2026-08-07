import { WhatsappConnectionStatus } from '@prisma/client';

/** Canal único de eventos del panel. Un solo nombre, varios `tipo` dentro. */
export const EVENTO_PANEL = 'panel';

/**
 * Lo que el backend le cuenta al panel en vivo.
 *
 * Los avisos son deliberadamente flacos: dicen QUÉ cambió, no el contenido
 * nuevo. El panel recarga lo que le afecta por la API de siempre, así que hay
 * una sola forma de serializar una conversación (la del controlador) en vez de
 * dos que se desincronizan en cuanto una crece un campo. El precio es una
 * petición extra; el beneficio es que el socket no puede mostrar algo que la
 * API contradiga.
 *
 * También evita un problema de permisos: por el socket viajan identificadores,
 * no contenido cifrado de conversaciones.
 */
export type EventoPanel = EventoMensajeNuevo | EventoConversacion | EventoCanal;

/** Se guardó un mensaje en una conversación (entrante o saliente). */
export interface EventoMensajeNuevo {
  tipo: 'mensaje';
  conversationId: string;
  direccion: 'entrante' | 'saliente';
}

/** Cambió algo de la conversación que la lista debe reflejar. */
export interface EventoConversacion {
  tipo: 'conversacion';
  conversationId: string;
  /** true si la conversación acaba de crearse (no estaba en la lista). */
  nueva: boolean;
}

/** El vínculo con WhatsApp cambió de estado. */
export interface EventoCanal {
  tipo: 'canal';
  status: WhatsappConnectionStatus;
}
