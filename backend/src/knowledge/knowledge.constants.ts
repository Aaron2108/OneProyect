/**
 * Límites y constantes del conocimiento del negocio (documentos que la IA usa
 * para responder). Ver docs/DECISIONS.md.
 */

/**
 * Tamaño máximo de archivo aceptado (15 MB).
 *
 * El límite duro de la API de Anthropic es 32 MB **por request**, y base64
 * infla el binario ~1.37x — así que un PDF de más de ~23 MB ya no cabe cuando
 * hay que transcribirlo con visión. 15 MB deja margen para el resto del
 * request y sigue siendo holgado para documentos de negocio reales.
 */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Máximo de páginas que se aceptan de un PDF.
 *
 * Con `claude-haiku-4-5` (200K de contexto) el límite de la API para PDFs es
 * 100 páginas; los modelos de 1M llegan a 600. Se usa el límite más bajo porque
 * es el modelo por defecto del proyecto (ver config/configuration.ts).
 */
export const MAX_PDF_PAGES = 100;

/** Tamaño objetivo de cada fragmento, en caracteres. */
export const CHUNK_CHARS = 1400;

/**
 * Solape entre fragmentos consecutivos, en caracteres. Evita que una frase que
 * cae justo en el corte pierda su contexto y deje de recuperarse.
 */
export const CHUNK_OVERLAP_CHARS = 200;

/** Cuántos fragmentos como máximo se inyectan en el prompt por respuesta. */
export const KNOWLEDGE_TOP_K = 4;

/**
 * Mínimo de caracteres **por página** para considerar que un PDF tiene capa de
 * texto real.
 *
 * Se mide por página y no en total a propósito: un umbral absoluto confunde
 * "este PDF no tiene texto" (un escaneo) con "este documento es corto" (una
 * lista de precios de una página es perfectamente legítima), y mandaría el
 * segundo a transcribirse con visión gastando créditos sin necesidad.
 *
 * Una página escaneada devuelve ~0 caracteres; una con texto real, cientos.
 */
export const MIN_CHARS_PER_PAGE = 50;

/**
 * Mínimo absoluto de caracteres para que un documento aporte algo. Por debajo de
 * esto no hay contenido con el que la IA pueda responder.
 */
export const MIN_USEFUL_CHARS = 20;

/** Tipos MIME aceptados en la subida. */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;
