/** Nombres de las herramientas (tool-calling) que la IA puede invocar. */
export const TOOL_CREATE_APPOINTMENT = 'create_appointment';
export const TOOL_CREATE_REMINDER = 'create_reminder';
export const TOOL_UPDATE_CONTACT = 'update_contact';

/** Máximo de iteraciones del bucle de tool-calling (guarda anti-bucle infinito). */
export const MAX_TOOL_ITERATIONS = 5;

/** Tokens máximos de salida por respuesta del agente (respuestas de chat cortas). */
export const MAX_OUTPUT_TOKENS = 1024;

/** Tokens máximos al resumir una conversación cerrada (Fase 4, memoria de contexto). */
export const MAX_SUMMARY_TOKENS = 200;
