import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { CalendarClock, Coins, MessageSquare, Send, Sparkles, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Select } from '@/components/ui/Input';
import { CountUp } from '@/components/ui/CountUp';
import { RadialGauge } from '@/components/ui/RadialGauge';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import type { AiUsageTotals, MetricsOverview } from '@/lib/types';

const CHART_COLORS = { in: 'var(--warn)', human: 'var(--brand)', ai: 'var(--ai)' };

/** Nombres legibles de las finalidades que devuelve la API. */
const PURPOSE_LABELS: Record<string, string> = {
  respond: 'Responder a clientes',
  summarize: 'Resumir al cerrar',
  'follow-up': 'Seguimientos',
};

function Kpi({
  label,
  icon: Icon,
  dot,
  value,
  sub,
}: {
  label: string;
  icon: typeof MessageSquare;
  dot: string;
  value: number;
  sub: string;
}): JSX.Element {
  return (
    <div className="reveal kpi-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dot }} />
          {label}
        </div>
        <Icon size={16} strokeWidth={2} className="text-ink-disabled" />
      </div>
      <div className="font-display text-[32px] font-bold leading-none tracking-tight">
        <CountUp value={value} />
      </div>
      <div className="mt-2 text-xs text-ink-faint">{sub}</div>
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

export function MetricsPage(): JSX.Element {
  const toast = useToast();
  const [range, setRange] = useState(7);
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [usage, setUsage] = useState<AiUsageTotals | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function load(): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - (range - 1) * 86400000);
    from.setHours(0, 0, 0, 0);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    try {
      // En paralelo: son dos preguntas distintas (cuánto se trabajó y cuánto
      // costó) y ninguna debe esperar a la otra.
      const [overview, consumo] = await Promise.all([
        api<MetricsOverview>(`/metrics/overview?${qs}`),
        api<AiUsageTotals>(`/metrics/ai-usage?${qs}`),
      ]);
      setData(overview);
      setUsage(consumo);
      setLoadedOnce(true);
    } catch (e) {
      // Sin aviso, al cambiar de período se quedaban las cifras anteriores en
      // pantalla (o el esqueleto girando) y nadie sabía que no eran las pedidas.
      toast.show(e instanceof Error ? e.message : 'No se pudieron cargar las métricas', 'error');
    }
  }

  const chartData = useMemo(
    () => (data?.activity ?? []).map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` })),
    [data],
  );
  const autoPct = data ? Math.round(data.automationRate * 100) : 0;

  return (
    <div className="mx-auto max-w-[1040px] p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Métricas</h2>
          <p className="m-0 text-sm text-ink-soft">Cómo está trabajando tu empleado digital, en el período elegido.</p>
        </div>
        <Select value={range} onChange={(e) => setRange(Number(e.target.value))} className="w-auto flex-shrink-0 !py-2.5">
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </Select>
      </div>

      {!loadedOnce || !data ? (
        <div className="bento-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="bento-grid">
          <Kpi
            label="Conversaciones"
            icon={MessageSquare}
            dot="var(--brand)"
            value={data.conversations.total}
            sub={`${data.conversations.open} abiertas · ${data.conversations.closed} cerradas`}
          />
          <Kpi
            label="Mensajes"
            icon={Send}
            dot="var(--brand-hover)"
            value={data.messages.total}
            sub={`${data.messages.inbound} recibidos · ${data.messages.outbound} enviados`}
          />
          <Kpi
            label="Citas"
            icon={CalendarClock}
            dot="var(--warn)"
            value={data.appointments.total}
            sub={`${data.appointments.confirmed} confirmadas · ${data.reminders.pending} recordatorios pendientes`}
          />
          <Kpi label="Contactos" icon={Users} dot="var(--ink-soft)" value={data.contacts.total} sub="personas en tu WhatsApp" />

          <div className="span-4 reveal flex flex-col items-center gap-7 kpi-card sm:flex-row">
            <RadialGauge aiPct={autoPct} />
            <div className="flex-1">
              <h3 className="mb-1.5 flex items-center gap-2 font-display text-base font-bold">
                <Sparkles size={16} strokeWidth={2} className="text-ai" /> Automatización
              </h3>
              <p className="mb-4 text-[13px] text-ink-soft">De las respuestas enviadas, cuántas resolvió la IA sin intervención humana.</p>
              <div className="flex gap-6 text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--ai)' }} />
                  IA <b>{data.messages.fromAi}</b>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--brand)' }} />
                  Agente humano <b>{data.messages.fromHuman}</b>
                </span>
              </div>
            </div>
          </div>

          {usage && usage.calls > 0 && (
            <div className="span-4 reveal kpi-card">
              <h3 className="mb-1.5 flex items-center gap-2 font-display text-base font-bold">
                <Coins size={16} strokeWidth={2} className="text-ai" /> Consumo de la IA
              </h3>
              <p className="mb-4 text-[13px] text-ink-soft">
                Lo que tu agente gastó de verdad en el período. Se muestran tokens y no un
                importe: el precio depende del modelo y de la tarifa vigente, y calcularlo aquí
                daría una cifra que envejece mal.
              </p>
              <div className="flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <div className="tabular-nums font-display text-xl font-bold">{usage.calls.toLocaleString('es')}</div>
                  <div className="text-[12.5px] text-ink-soft">llamadas a la API</div>
                </div>
                <div>
                  <div className="tabular-nums font-display text-xl font-bold">{usage.inputTokens.toLocaleString('es')}</div>
                  <div className="text-[12.5px] text-ink-soft">tokens de entrada</div>
                </div>
                <div>
                  <div className="tabular-nums font-display text-xl font-bold">{usage.outputTokens.toLocaleString('es')}</div>
                  <div className="text-[12.5px] text-ink-soft">tokens de salida</div>
                </div>
              </div>
              {/* Las llamadas no son una por respuesta: agendar una cita o mirar
                  el catálogo encadena varias, y aquí se ve. */}
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-[12.5px] text-ink-soft">
                {usage.byPurpose.map((p) => (
                  <span key={p.purpose}>
                    {PURPOSE_LABELS[p.purpose] ?? p.purpose}: <b>{p.calls.toLocaleString('es')}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="span-4 reveal kpi-card">
            <h3 className="mb-4 font-display text-base font-bold">Actividad · últimos {chartData.length} días</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barGap={3}>
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
                <Bar dataKey="inbound" name="Recibidos" fill={CHART_COLORS.in} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="outbound" name="Enviados" fill={CHART_COLORS.human} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex gap-5 text-[12.5px] text-ink-soft">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.in }} /> Recibidos
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.human }} /> Enviados
              </span>
            </div>
            <button onClick={() => setShowTable((s) => !s)} className="mt-4 text-[13px] font-semibold text-brand" aria-expanded={showTable}>
              {showTable ? 'Ocultar datos' : 'Ver datos'}
            </button>
            {showTable && (
              <table className="mt-3 w-full border-collapse text-[13px]">
                <thead>
                  {/* `scope="col"` para que el lector de pantalla relacione cada
                      número con su columna al recorrer la tabla. */}
                  <tr>
                    <th scope="col" className="border-b border-line py-2 text-left font-semibold text-ink-soft">Día</th>
                    <th scope="col" className="border-b border-line py-2 text-right font-semibold text-ink-soft">Recibidos</th>
                    <th scope="col" className="border-b border-line py-2 text-right font-semibold text-ink-soft">Enviados</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity.map((d) => (
                    <tr key={d.date}>
                      <td className="border-b border-line py-2">{d.date}</td>
                      <td className="tabular-nums border-b border-line py-2 text-right">{d.inbound}</td>
                      <td className="tabular-nums border-b border-line py-2 text-right">{d.outbound}</td>
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
