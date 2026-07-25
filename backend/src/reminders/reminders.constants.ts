/** Cola BullMQ que dispara los recordatorios vencidos de forma periódica. */
export const REMINDERS_QUEUE = 'reminders-dispatch';

/** Nombre del job periódico que revisa recordatorios pendientes. */
export const DISPATCH_DUE_JOB = 'dispatch-due-reminders';

/** Cada cuánto revisa la cola si hay recordatorios vencidos (ms). */
export const DISPATCH_INTERVAL_MS = 60 * 1000;

/** Máximo de recordatorios procesados por tick (evita picos). */
export const DISPATCH_BATCH = 50;

/**
 * Lease del claim atómico: al tomar un recordatorio, `nextAttemptAt` se adelanta
 * este tiempo para que ninguna otra instancia/tick lo procese en paralelo. Si el
 * worker cae a mitad, el recordatorio vuelve a ser elegible al vencer el lease.
 * Debe ser mayor que el tiempo máximo de procesamiento de un recordatorio.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Backoff fijo cuando el recordatorio aún no es enviable por causa externa
 * (sin credenciales de Meta, o fuera de la ventana de 24h sin plantilla): no es
 * un fallo, solo "todavía no", así que no se penaliza con backoff exponencial.
 */
export const DEFER_RETRY_MS = 15 * 60 * 1000;

/** Backoff exponencial ante fallos de envío reales (Meta rechaza el mensaje). */
export const SEND_BACKOFF_BASE_MS = 5 * 60 * 1000;
export const SEND_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

/** Máximo de intentos de envío fallidos antes de cancelar el recordatorio. */
export const MAX_SEND_ATTEMPTS = 5;

/**
 * Un recordatorio proactivo que lleva demasiado tiempo sin poder enviarse
 * (fuera de la ventana de 24h y sin plantilla disponible) se cancela como
 * "expirado" en vez de reintentarse indefinidamente.
 */
export const REMINDER_EXPIRY_MS = 72 * 60 * 60 * 1000;
