/** Cola BullMQ que reintenta sincronizaciones fallidas con Google Calendar. */
export const GOOGLE_CALENDAR_SYNC_QUEUE = 'google-calendar-sync-retry';

/** Nombre del job periódico que revisa reintentos vencidos. */
export const RETRY_DUE_JOB = 'retry-due-google-calendar-sync';

/** Cada cuánto revisa la cola si hay reintentos vencidos (ms). */
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** Máximo de reintentos procesados por tick (evita picos). */
export const RETRY_BATCH = 50;

/**
 * Lease del claim atómico: al tomar un job, `nextAttemptAt` se adelanta este
 * tiempo para que ninguna otra instancia/tick lo procese en paralelo.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Backoff exponencial entre reintentos ante fallos reales de la API de Google. */
export const BACKOFF_BASE_MS = 5 * 60 * 1000;
export const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * Máximo de intentos antes de abandonar: la cita queda como fuente de verdad
 * en WhatsFlow, pero deja de reintentarse contra Google (requiere revisión
 * manual, p. ej. reconectar la integración).
 */
export const MAX_SYNC_ATTEMPTS = 8;
