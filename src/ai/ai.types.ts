/** Contexto de confianza de una conversación; NUNCA lo decide el modelo. */
export interface ConversationContext {
  tenantId: string;
  tenantName: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  conversationId: string;
}

/** Un turno del historial que se le pasa a la IA. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Resultado de una respuesta del agente. */
export interface AgentReply {
  /** Texto a enviar al cliente por WhatsApp. */
  text: string;
  /** Acciones ejecutadas por tool-calling (para logging/auditoría). */
  actions: string[];
}
