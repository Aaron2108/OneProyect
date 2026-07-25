import clsx from 'clsx';

/**
 * El estado nunca se comunica solo por color (accesibilidad): cada variante
 * lleva además una forma/glifo distinta (diamante, punto, cuadrado, estrella,
 * anillo), así funciona igual para daltonismo o escala de grises.
 */
export type PillKind =
  | 'ai'
  | 'human'
  | 'closed'
  | 'owner'
  | 'agent'
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

const CONFIG: Record<PillKind, { label: string; glyph: string; cls: string }> = {
  ai: { label: 'IA', glyph: '◆', cls: 'bg-ai-tint text-ai' },
  human: { label: 'Humano', glyph: '●', cls: 'bg-brand-tint text-brand' },
  closed: { label: 'Cerrada', glyph: '▪', cls: 'bg-[var(--muted-bg)] text-ink-soft' },
  owner: { label: 'Propietario', glyph: '★', cls: 'bg-brand-tint text-brand' },
  agent: { label: 'Agente', glyph: '○', cls: 'bg-[var(--muted-bg)] text-ink-soft' },
  scheduled: { label: 'Agendada', glyph: '◷', cls: 'bg-warn-tint text-warn' },
  confirmed: { label: 'Confirmada', glyph: '✓', cls: 'bg-brand-tint text-brand' },
  cancelled: { label: 'Cancelada', glyph: '✕', cls: 'bg-danger-tint text-danger' },
  completed: { label: 'Completada', glyph: '●', cls: 'bg-[var(--muted-bg)] text-ink-soft' },
};

export function Pill({ kind, label }: { kind: PillKind; label?: string }): JSX.Element {
  const c = CONFIG[kind];
  const isPulsing = kind === 'ai';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide',
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
