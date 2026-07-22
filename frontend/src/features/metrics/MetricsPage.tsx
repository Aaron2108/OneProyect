import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme-context';
import { CountUp } from '@/components/ui/CountUp';
import { RadialGauge } from '@/components/ui/RadialGauge';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import type { MetricsOverview } from '@/lib/types';

const CHART_COLORS = {
  light: { in: '#b26a00', human: '#0ca678', ai: '#6b5ce6' },
  dark: { in: '#e6b155', human: '#2ee6a6', ai: '#9d8cff' },
};

function Kpi({ label, dot, value, sub }: { label: string; dot: string; value: number; sub: string }): JSX.Element {
  return (
    <div className="reveal rounded bg-surface p-4 shadow-1">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: dot }} />
        {label}
      </div>
      <div className="mt-1.5 font-display text-[31px] font-bold leading-none tracking-tight">
        <CountUp value={value} />
      </div>
      <div className="mt-1.5 text-xs text-ink-faint">{sub}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export function MetricsPage({ active }: { active: boolean }): JSX.Element {
  const { theme } = useTheme();
  const colors = CHART_COLORS[theme];
  const [range, setRange] = useState(7);
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, range]);

  async function load(): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - (range - 1) * 86400000);
    from.setHours(0, 0, 0, 0);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    setData(await api<MetricsOverview>(`/metrics/overview?${qs}`));
    setLoadedOnce(true);
  }

  const chartData = useMemo(
    () => (data?.activity ?? []).map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` })),
    [data],
  );
  const autoPct = data ? Math.round(data.automationRate * 100) : 0;

  return (
    <div className="mx-auto max-w-[960px] p-5 sm:p-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3.5">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Métricas</h2>
          <p className="m-0 text-sm text-ink-soft">Cómo está trabajando tu empleado digital, en el período elegido.</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="flex-shrink-0 rounded-lg border border-line-strong bg-[var(--input-bg)] px-3 py-2 text-[13.5px]"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>

      {!loadedOnce || !data ? (
        <div className="bento-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="bento-grid">
          <Kpi label="Conversaciones" dot="var(--brand)" value={data.conversations.total} sub={`${data.conversations.open} abiertas · ${data.conversations.closed} cerradas`} />
          <Kpi label="Mensajes" dot={colors.human} value={data.messages.total} sub={`${data.messages.inbound} recibidos · ${data.messages.outbound} enviados`} />
          <Kpi label="Citas" dot="var(--warn)" value={data.appointments.total} sub={`${data.appointments.scheduled} agendadas · ${data.appointments.confirmed} confirmadas`} />
          <Kpi label="Contactos" dot="var(--ink-soft)" value={data.contacts.total} sub="personas en tu WhatsApp" />

          <div className="span-4 reveal flex flex-col items-center gap-6 rounded-lg bg-surface p-5 shadow-1 sm:flex-row">
            <RadialGauge aiPct={autoPct} />
            <div className="flex-1">
              <h3 className="mb-1 font-display text-base font-bold">Automatización</h3>
              <p className="mb-3 text-[13px] text-ink-soft">De las respuestas enviadas, cuántas resolvió la IA sin intervención humana.</p>
              <div className="flex gap-5 text-[13px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--ai)' }} />
                  IA <b>{data.messages.fromAi}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--brand)' }} />
                  Agente humano <b>{data.messages.fromHuman}</b>
                </span>
              </div>
            </div>
          </div>

          <div className="span-4 reveal rounded-lg bg-surface p-4 shadow-1 sm:p-5">
            <h3 className="mb-3.5 font-display text-base font-bold">Actividad · últimos {chartData.length} días</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.ceil(chartData.length / 8) - 1)}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} width={26} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover-bg)' }} />
                <Bar dataKey="inbound" name="Recibidos" fill={colors.in} radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="outbound" name="Enviados" fill={colors.human} radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2.5 flex gap-4 text-[12.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.in }} /> Recibidos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.human }} /> Enviados
              </span>
            </div>
            <button onClick={() => setShowTable((s) => !s)} className="mt-3 text-[13px] font-semibold text-brand" aria-expanded={showTable}>
              {showTable ? 'Ocultar datos' : 'Ver datos'}
            </button>
            {showTable && (
              <table className="mt-2.5 w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="border-b border-line py-1.5 text-left font-semibold text-ink-soft">Día</th>
                    <th className="border-b border-line py-1.5 text-right font-semibold text-ink-soft">Recibidos</th>
                    <th className="border-b border-line py-1.5 text-right font-semibold text-ink-soft">Enviados</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity.map((d) => (
                    <tr key={d.date}>
                      <td className="border-b border-line py-1.5">{d.date}</td>
                      <td className="tabular-nums border-b border-line py-1.5 text-right">{d.inbound}</td>
                      <td className="tabular-nums border-b border-line py-1.5 text-right">{d.outbound}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
