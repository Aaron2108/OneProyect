import clsx from 'clsx';

/**
 * El estado nunca se comunica solo por color (accesibilidad): cada variante
 * lleva además una forma/glifo distinta (diamante, punto, cuadrado, estrella,
 * anillo), así funciona igual para daltonismo o escala de grises.
 */
export type PillKind = 'ai' | 'human' | 'closed' | 'owner' | 'agent';

const CONFIG: Record<PillKind, { label: string; glyph: string; cls: string }> = {
  ai: { label: 'IA', glyph: '◆', cls: 'bg-ai-tint text-ai-700' },
  human: { label: 'Humano', glyph: '●', cls: 'bg-warn-tint text-warn' },
  closed: { label: 'Cerrada', glyph: '▪', cls: 'bg-[var(--muted-bg)] text-[var(--muted-ink)]' },
  owner: { label: 'Propietario', glyph: '★', cls: 'bg-brand-tint text-brand-700' },
  agent: { label: 'Agente', glyph: '○', cls: 'bg-[var(--muted-bg)] text-[var(--muted-ink)]' },
};

export function Pill({ kind, label }: { kind: PillKind; label?: string }): JSX.Element {
  const c = CONFIG[kind];
  const isPulsing = kind === 'ai';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
        c.cls,
      )}
    >
      <span className={clsx(isPulsing && 'animate-pulse')} aria-hidden="true">
        {c.glyph}
      </span>
      {label ?? c.label}
    </span>
  );
}
