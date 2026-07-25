/** Forma mínima de las respuestas de Google que el módulo consume. */

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  status?: string;
}

/** Estado de la integración expuesto al panel (sin secretos). */
export interface GoogleCalendarStatusDto {
  connected: boolean;
  googleAccountEmail: string | null;
  connectedAt: string | null;
}
