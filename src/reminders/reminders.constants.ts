/** Cola BullMQ que dispara los recordatorios vencidos de forma periódica. */
export const REMINDERS_QUEUE = 'reminders-dispatch';

/** Nombre del job periódico que revisa recordatorios pendientes. */
export const DISPATCH_DUE_JOB = 'dispatch-due-reminders';

/** Cada cuánto revisa la cola si hay recordatorios vencidos (ms). */
export const DISPATCH_INTERVAL_MS = 60 * 1000;

/** Máximo de recordatorios procesados por tick (evita picos). */
export const DISPATCH_BATCH = 50;

/**
 * Un recordatorio proactivo que lleva demasiado tiempo sin poder enviarse
 * (fuera de la ventana de 24h y sin plantilla disponible) se cancela como
 * "expirado" en vez de reintentarse indefinidamente.
 */
export const REMINDER_EXPIRY_MS = 72 * 60 * 60 * 1000;
