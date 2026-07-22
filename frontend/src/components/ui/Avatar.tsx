/** Color estable derivado del texto (id/teléfono), en la familia de la marca. */
function colorFromSeed(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(150deg, hsl(${h} 42% 46%), hsl(${(h + 34) % 360} 46% 38%))`;
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
      style={{ width: size, height: size, fontSize: size * 0.375, background: colorFromSeed(seed || phone || name || '?') }}
    >
      {initials(name, phone)}
    </div>
  );
}
