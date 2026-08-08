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
  /**
   * Cuándo se confirmó por última vez CONTRA GOOGLE que la conexión sirve.
   * Nulo = nunca desde que se conectó, y entonces "conectado" es solo lo que
   * dice la fila guardada, no algo verificado.
   */
  lastCheckedAt: string | null;
  /** Por qué falló la última comprobación, si falló. */
  lastCheckError: string | null;
}

/** Resultado de comprobar la conexión y empujar lo que estuviera pendiente. */
export interface GoogleCalendarCheckDto {
  /** Estado ya actualizado, para que el panel no tenga que volver a pedirlo. */
  status: GoogleCalendarStatusDto;
  /** true si Google respondió y la conexión sirve. */
  ok: boolean;
  /** Citas pendientes que se lograron subir en esta comprobación. */
  sincronizadas: number;
}
