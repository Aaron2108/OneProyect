/**
 * Comprobaciones de forma en la frontera con la API.
 *
 * `api<T>()` no valida nada: hace `data as T` y confía. Mientras el backend
 * responda lo esperado no pasa nada, pero el día que un despliegue cambie un
 * campo —o que un proxy conteste otra cosa— el fallo aparece muy lejos de aquí,
 * en mitad del render y con un mensaje que no ayuda ("cannot read properties of
 * undefined"). Estas funciones lo convierten en un error con nombre, en el sitio
 * donde entran los datos.
 *
 * Se comprueba **solo lo que la interfaz recorre sin protección**: los objetos
 * anidados y las listas. Los campos sueltos de dentro no se exigen a propósito:
 * si falta uno, la pantalla enseña un hueco, y eso es preferible a rechazar una
 * respuesta buena y dejar al usuario sin pantalla. Validar de más aquí convierte
 * un defecto cosmético en una caída.
 */

import type { ConversationDetail, MetricsOverview } from './types';

type Registro = Record<string, unknown>;

function esObjeto(x: unknown): x is Registro {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Lo que el hilo de la bandeja recorre: `messages.map`, `_count.notes` y
 * `contact.phone`. Si algo de eso no viene, la conversación no se puede pintar.
 */
export function esConversationDetail(x: unknown): x is ConversationDetail {
  if (!esObjeto(x)) return false;
  if (typeof x.id !== 'string') return false;
  if (!Array.isArray(x.messages)) return false;
  if (!esObjeto(x.contact) || typeof x.contact.phone !== 'string') return false;
  if (!esObjeto(x._count) || typeof x._count.notes !== 'number') return false;
  return true;
}

/**
 * Lo que Métricas desglosa: cinco bloques de cifras, la tasa de automatización
 * (que se multiplica, así que tiene que ser número) y la serie del gráfico.
 */
export function esMetricsOverview(x: unknown): x is MetricsOverview {
  if (!esObjeto(x)) return false;
  for (const bloque of ['conversations', 'messages', 'contacts', 'appointments', 'reminders']) {
    if (!esObjeto(x[bloque])) return false;
  }
  if (typeof x.automationRate !== 'number') return false;
  if (!esObjeto(x.responseTime)) return false;
  if (!Array.isArray(x.activity)) return false;
  return true;
}
