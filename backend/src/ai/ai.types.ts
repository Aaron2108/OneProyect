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

/**
 * Consumo de una o varias llamadas al proveedor, ya sumado.
 *
 * `calls` es el número real de llamadas a la API, que NO es uno por respuesta:
 * una respuesta con tool-calling encadena varias. Es justo la diferencia que la
 * guarda de costo no puede ver, porque cuenta mensajes.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
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
  /**
   * Tokens gastados en generar esta respuesta. Ausente en modo simulado, donde
   * no hay llamada real que medir — registrar ceros ensuciaría el histórico de
   * gasto con actividad que nunca costó nada.
   */
  usage?: TokenUsage;
}
