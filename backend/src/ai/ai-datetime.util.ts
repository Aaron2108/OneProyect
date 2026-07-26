/**
 * Fecha y hora para el agente de IA.
 *
 * Dos problemas que resuelve este módulo, ambos detectados agendando citas de
 * verdad:
 *
 * 1. **El modelo no sabía qué día es hoy.** Sin eso tenía que adivinar el año al
 *    interpretar "mañana" o "el 3 de agosto", con riesgo de agendar en un año
 *    pasado.
 * 2. **No sabía en qué zona horaria está el negocio.** Escribía la hora en UTC
 *    (`16:00:00Z`), así que un cliente que pedía las 4 de la tarde terminaba con
 *    la cita corrida tantas horas como el desplazamiento de su zona.
 *
 * La zona es **de cada negocio** (`Tenant.timeZone`, que el propietario elige en
 * el panel). Si no la ha elegido se cae a `BUSINESS_TIME_ZONE` y, en último
 * término, a la del servidor — ver DECISIONS.md.
 */

/** Zona por defecto si la configurada es inválida: la del proceso. */
function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Si `Intl` acepta la zona. Se usa para validar lo que llega del panel. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve la zona a usar, en orden de preferencia. Una zona con un error de
 * tipeo haría fallar a `Intl` en CADA mensaje, así que se degrada en vez de
 * romper: se prueba cada candidata y se cae a la del servidor.
 */
export function resolveTimeZone(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate && isValidTimeZone(candidate)) return candidate;
  }
  return serverTimeZone();
}

/** Desplazamiento de la zona en el instante dado, con formato ISO (`-05:00`). */
function isoOffset(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  // "GMT-05:00" → "-05:00". Algunas versiones de ICU devuelven "GMT" a secas
  // para UTC, de ahí el respaldo.
  const match = /GMT([+-]\d{2}:\d{2})/.exec(name);
  return match ? match[1] : '+00:00';
}

/** Fecha (sin hora) en la zona del negocio, como `2026-07-25`. */
function isoDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Líneas del system prompt que le dan al modelo la fecha de hoy y la zona del
 * negocio, con un ejemplo construido con la fecha real para no enseñarle un año
 * equivocado.
 */
export function describeNow(now: Date, timeZone: string): string[] {
  const humana = new Intl.DateTimeFormat('es', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const offset = isoOffset(now, timeZone);

  return [
    `Hoy es ${humana}. La zona horaria del negocio es ${timeZone} (UTC${offset}).`,
    'Calcula siempre las fechas relativas ("mañana", "el viernes", "en dos semanas") a partir de la fecha de hoy.',
    `Al llamar a una herramienta con fecha y hora, escríbela en ISO 8601 con el desplazamiento del negocio (ej. ${isoDate(now, timeZone)}T15:00:00${offset}), nunca en UTC: si la escribes en UTC, la cita queda agendada a una hora distinta de la que pidió el cliente.`,
  ];
}

/**
 * Fecha y hora en la zona del negocio, para confirmarle al cliente. Se usa en el
 * resultado que se le devuelve al modelo, así que debe ser texto que el cliente
 * pueda leer tal cual (nada de UTC ni de identificadores internos).
 */
export function formatBusinessDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
