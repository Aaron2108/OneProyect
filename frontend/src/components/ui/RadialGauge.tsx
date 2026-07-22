import { useEffect, useState } from 'react';
import { CountUp } from './CountUp';

/**
 * Medidor radial de automatización: un anillo de dos arcos (IA · índigo,
 * Humano · teal) que se dibuja al montar (transición de stroke-dashoffset),
 * con el porcentaje de IA contando hacia arriba en el centro.
 */
export function RadialGauge({ aiPct, size = 168 }: { aiPct: number; size?: number }): JSX.Element {
  const r = size / 2 - 14;
  const circumference = 2 * Math.PI * r;
  const aiLen = (aiPct / 100) * circumference;
  const humanLen = circumference - aiLen;

  // Arranca oculto (dashoffset = circumference completa) y "revela" tras montar.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const center = size / 2;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle className="gauge-track" cx={center} cy={center} r={r} fill="none" strokeWidth={11} />
        <circle
          className="gauge-ai"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${aiLen} ${circumference - aiLen}`}
          strokeDashoffset={revealed ? 0 : circumference}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
        />
        <circle
          className="gauge-human"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${humanLen} ${circumference - humanLen}`}
          strokeDashoffset={revealed ? -aiLen : circumference - aiLen}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1) .1s' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-[34px] font-extrabold tracking-tight text-ai-700">
          <CountUp value={aiPct} />%
        </span>
        <span className="text-[11px] text-ink-soft">lo resuelve la IA</span>
      </div>
    </div>
  );
}
