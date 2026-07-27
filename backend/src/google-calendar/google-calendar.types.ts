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
  /**
   * Hay integración guardada, pero sus credenciales ya no se pueden usar y hay
   * que volver a conectar. Antes `connected` solo decía si existía la fila, así
   * que el panel anunciaba "conectado" mientras las citas no llegaban a Google.
   */
  needsReconnect: boolean;
  /** Citas cuya sincronización falló y sigue reintentándose. */
  pendingSyncCount: number;
  /** Último error de sincronización, para que el dueño sepa qué está pasando. */
  lastSyncError: string | null;
}
