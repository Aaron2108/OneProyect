/** Nombres de las herramientas (tool-calling) que la IA puede invocar. */
export const TOOL_CREATE_APPOINTMENT = 'create_appointment';
export const TOOL_CREATE_REMINDER = 'create_reminder';
export const TOOL_UPDATE_CONTACT = 'update_contact';
export const TOOL_CHECK_PRODUCT = 'consultar_producto';

/** Cuántos productos devuelve una consulta del catálogo (cabe en el prompt). */
export const PRODUCT_SEARCH_LIMIT = 5;

/**
 * Herramientas que solo consultan y no modifican nada. En el chat de prueba del
 * panel se ejecutan DE VERDAD: simularlas devolvería productos inventados y el
 * dueño no podría comprobar si su agente responde bien sobre el catálogo. Las
 * que sí escriben (citas, recordatorios, contacto) se siguen simulando.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([TOOL_CHECK_PRODUCT]);

/** Máximo de iteraciones del bucle de tool-calling (guarda anti-bucle infinito). */
export const MAX_TOOL_ITERATIONS = 5;

/** Tokens máximos de salida por respuesta del agente (respuestas de chat cortas). */
export const MAX_OUTPUT_TOKENS = 1024;

/** Tokens máximos al resumir una conversación cerrada (Fase 4, memoria de contexto). */
export const MAX_SUMMARY_TOKENS = 200;

/**
 * Límite de espera del proveedor de pruebas NVIDIA. Sus modelos pueden tardar en
 * arrancar en frío, pero el worker de WhatsApp no puede quedarse colgado: si se
 * agota, el mensaje se reintenta por la cola en vez de bloquear.
 */
export const NVIDIA_REQUEST_TIMEOUT_MS = 60_000;
