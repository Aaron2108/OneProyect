import type { ReactNode } from 'react';

/**
 * Micro-ilustración hecha a mano (SVG + CSS), sin Lottie: no tenemos archivos
 * de animación reales y traer un JSON de animación desde un CDN externo sin
 * origen de confianza no vale la pena para un simple estado vacío. El mismo
 * efecto (movimiento suave, glow de marca) se logra con SVG + CSS puro.
 */
export function EmptyState({
  icon = '💬',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="reveal mx-auto max-w-[300px] p-5 text-center text-ink-faint">
      <div
        className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-lg bg-surface text-[28px] shadow-2"
        style={{ animation: 'floatY 4.5s ease-in-out infinite' }}
      >
        <span
          className="absolute inset-0 -z-10 rounded-full blur-xl"
          style={{ background: 'radial-gradient(circle, var(--brand-glow), transparent 70%)' }}
          aria-hidden="true"
        />
        {icon}
      </div>
      <h4 className="mb-1.5 font-display text-lg font-bold text-ink">{title}</h4>
      <p className="m-0 text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
