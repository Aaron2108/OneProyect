import { gradientFromSeed, initials } from './avatar.util';

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
