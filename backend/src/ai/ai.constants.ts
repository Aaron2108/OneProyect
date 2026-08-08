/** Nombres de las herramientas (tool-calling) que la IA puede invocar. */
export const TOOL_CREATE_APPOINTMENT = 'create_appointment';
export const TOOL_LIST_APPOINTMENTS = 'consultar_citas';
export const TOOL_CREATE_REMINDER = 'create_reminder';
export const TOOL_UPDATE_CONTACT = 'update_contact';
export const TOOL_CHECK_PRODUCT = 'consultar_producto';
export const TOOL_ESCALATE_TO_HUMAN = 'escalar_a_humano';

/**
 * Autor con el que la IA firma la nota interna al escalar. No es un `User`:
 * `ConversationNote.authorId` es texto libre (sin clave foránea), así que la
 * nota no queda atribuida a ninguna persona del equipo que no la escribió.
 */
export const AI_AUTHOR_ID = 'agente-ia';
export const AI_AUTHOR_NAME = 'Agente IA';

/** Cuántos productos devuelve una consulta del catálogo (cabe en el prompt). */
export const PRODUCT_SEARCH_LIMIT = 5;

/** Cuántas citas del contacto se le pasan al modelo de una vez. */
export const APPOINTMENT_LIST_LIMIT = 10;

/**
 * Herramientas que solo consultan y no modifican nada. En el chat de prueba del
 * panel se ejecutan DE VERDAD: simularlas devolvería productos inventados y el
 * dueño no podría comprobar si su agente responde bien sobre el catálogo. Las
 * que sí escriben (citas, recordatorios, contacto) se siguen simulando.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  TOOL_CHECK_PRODUCT,
  // Consultar las citas del contacto tampoco cambia nada, y simularla sería
  // contraproducente: el dueño probaría el agente y vería citas inventadas
  // justo en el punto donde el problema ERA que se las inventaba.
  TOOL_LIST_APPOINTMENTS,
]);

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
