/**
 * Paleta curada (no HSL aleatorio en 360°): un set fijo de gradientes que
 * conviven con el verde/índigo de marca sin desentonar — nada de tonos
 * neón ni saturados al azar. Los colores viven en `tokens.css`; aquí solo se
 * elige cuál toca.
 */
const GRADIENTS = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-6)',
  'var(--avatar-7)',
];

function gradientFromSeed(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[h];
}

function initials(name: string | null | undefined, phone: string | undefined): string {
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

export function Avatar({
  name,
  phone,
  seed,
  size = 40,
}: {
  name?: string | null;
  phone?: string;
  seed?: string;
  size?: number;
}): JSX.Element {
  return (
    <div
      className="grid flex-shrink-0 place-items-center rounded-[12px] font-display font-bold text-white shadow-1"
      style={{ width: size, height: size, fontSize: size * 0.375, background: gradientFromSeed(seed || phone || name || '?') }}
    >
      {initials(name, phone)}
    </div>
  );
}
