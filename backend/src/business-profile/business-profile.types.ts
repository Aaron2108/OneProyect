/** Documento activo que alimenta el contexto de la IA. */
export interface AiContextDocument {
  filename: string;
  charCount: number;
}

/**
 * Contexto completo que recibe la IA antes de responder, para el panel
 * "Agente IA". Permite que el dueño audite exactamente qué sabe el agente y
 * cuánto cuesta ese contexto en cada mensaje.
 */
export interface AiContextPreview {
  /** System prompt ya armado, tal cual lo recibe el modelo. */
  prompt: string;
  /** Consulta de ejemplo con la que se recuperó la documentación. */
  sampleQuery: string;
  /** Tokens del prompt. */
  tokens: number;
  /**
   * true si `tokens` es una estimación local en vez del conteo real de la API.
   * Ocurre sin API key (p. ej. AI_PROVIDER=mock): se muestra como aproximado en
   * lugar de presentar un número inventado como si fuera exacto.
   */
  tokensEstimated: boolean;
  /** Cuántos fragmentos de documentación entraron en este prompt. */
  knowledgeChunksUsed: number;
  /** Documentos activos del negocio. */
  documents: AiContextDocument[];
}
