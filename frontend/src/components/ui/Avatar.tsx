/**
 * Paleta curada (no HSL aleatorio en 360°): un set fijo de gradientes que
 * conviven con el verde/índigo de marca sin desentonar — nada de tonos
 * neón ni saturados al azar.
 */
const GRADIENTS = [
  'linear-gradient(150deg, #35f0a3, #1f8f63)',
  'linear-gradient(150deg, #6c7bff, #4a4fc9)',
  'linear-gradient(150deg, #4fb8e0, #2f7fa8)',
  'linear-gradient(150deg, #f6c453, #c98f2c)',
  'linear-gradient(150deg, #ff8fa3, #c9536a)',
  'linear-gradient(150deg, #9d8cff, #6c56d8)',
  'linear-gradient(150deg, #4fd6c4, #2a9484)',
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
