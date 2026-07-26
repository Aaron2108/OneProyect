/** Contexto de confianza de una conversación; NUNCA lo decide el modelo. */
export interface ConversationContext {
  tenantId: string;
  tenantName: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  conversationId: string;
  /**
   * Zona horaria del negocio, ya resuelta. La rellena `AiService` antes de
   * ejecutar herramientas: quien construye el contexto (el worker de WhatsApp,
   * el chat de prueba) no tiene por qué saber de husos horarios.
   */
  timeZone?: string;
}

/** Un turno del historial que se le pasa a la IA. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Una herramienta que el modelo decidió invocar, con sus argumentos. */
export interface ToolIntent {
  name: string;
  input: Record<string, unknown>;
}

/** Resultado de una respuesta del agente. */
export interface AgentReply {
  /** Texto a enviar al cliente por WhatsApp. */
  text: string;
  /** Acciones ejecutadas por tool-calling (para logging/auditoría). */
  actions: string[];
  /**
   * Solo en el chat de prueba del panel: lo que el agente HABRÍA hecho, sin
   * haberlo hecho. Ausente en una conversación real, donde las acciones de
   * `actions` sí se ejecutaron.
   */
  simulatedTools?: ToolIntent[];
}
