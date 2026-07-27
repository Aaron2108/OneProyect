/**
 * Cómo se decide el aspecto de un avatar. Separado del componente para poder
 * comprobar lo único que tiene reglas: que el mismo contacto salga siempre con
 * el mismo color y que las iniciales sean las esperadas.
 */

/**
 * Paleta curada (no HSL aleatorio en 360°): un set fijo de gradientes que
 * conviven con el verde/índigo de marca sin desentonar — nada de tonos neón ni
 * saturados al azar. Los colores viven en `tokens.css`; aquí solo se elige cuál
 * toca.
 */
export const GRADIENTS = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-6)',
  'var(--avatar-7)',
];

/** Mismo contacto, mismo color: el gradiente sale de su id, no del azar. */
export function gradientFromSeed(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[h];
}

/** Iniciales del nombre; si no hay nombre, los dos últimos dígitos del teléfono. */
export function initials(name: string | null | undefined, phone: string | undefined): string {
  const n = (name || '').trim();
  if (n)
    return n
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  return (phone || '?').slice(-2);
}
