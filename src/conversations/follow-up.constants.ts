/** Cola BullMQ que revisa conversaciones sin respuesta para el seguimiento automático. */
export const FOLLOW_UP_QUEUE = 'conversation-follow-up';

/** Nombre del job periódico. */
export const SCAN_FOLLOW_UPS_JOB = 'scan-conversation-follow-ups';

/** Cada cuánto revisa la cola si hay conversaciones que necesitan seguimiento (ms). */
export const SCAN_INTERVAL_MS = 30 * 60 * 1000;

/** Máximo de conversaciones procesadas por tick (evita picos). */
export const SCAN_BATCH = 50;

/**
 * Cuánto esperar sin respuesta del contacto antes de enviar un seguimiento
 * automático. Debe ser bastante menor a las 24h de RF-10 (la ventana de
 * mensajería libre de Meta se cuenta desde el último mensaje ENTRANTE, no
 * desde este envío) para que el seguimiento todavía se pueda mandar como
 * texto libre, sin depender de una plantilla pre-aprobada (pendiente).
 */
export const FOLLOW_UP_DELAY_MS = 12 * 60 * 60 * 1000;

/**
 * Máximo de seguimientos automáticos por racha de silencio (se resetea a 0
 * en cuanto el contacto vuelve a escribir). Deliberadamente bajo: el objetivo
 * es no perder al cliente, no insistirle.
 */
export const MAX_FOLLOW_UPS = 1;

/** Marca en `Reminder.source` los recordatorios generados por este servicio. */
export const FOLLOW_UP_SOURCE = 'auto-followup';
