/**
 * Ventana de servicio de 24h de WhatsApp (RF-10).
 *
 * Meta solo permite enviar mensajes de texto libre dentro de las 24h posteriores
 * al último mensaje entrante del cliente. Fuera de esa ventana se exige una
 * plantilla (template) pre-aprobada. Este helper decide si aún es posible el
 * texto libre.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Se puede enviar un mensaje de texto libre?
 * True si el último mensaje entrante ocurrió hace menos de 24h.
 */
export function isWithinServiceWindow(
  lastInboundAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) {
    return false;
  }
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}
