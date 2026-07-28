import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { CalendarClock, Coins, MessageSquare, Send, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { esMetricsOverview } from '@/lib/guards';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { RadialGauge } from '@/components/ui/RadialGauge';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import type { AiUsageTotals, MetricsOverview } from '@/lib/types';

const CHART_COLORS = { in: 'var(--chart-in)', out: 'var(--chart-out)' };

/** Nombres legibles de las finalidades que devuelve la API. */
const PURPOSE_LABELS: Record<string, string> = {
  respond: 'Responder a clientes',
  summarize: 'Resumir al cerrar',
  'follow-up': 'Seguimientos',
};

/**
 * Una de las cuatro cifras de apoyo.
 *
 * Llevaban un punto de color al lado de la etiqueta que no codificaba nada:
 * verde, verde claro, ámbar y gris repartidos sin criterio. Dos de ellos eran
 * casi el mismo verde, y el ámbar de «Citas» se leía como una advertencia
 * porque en el resto del panel el ámbar es justo eso. El icono ya identifica la
 * tarjeta; el punto solo añadía color.
 */
function Kpi({
  label,
  icon: Icon,
  value,
  sub,
}: {
  label: string;
  icon: typeof MessageSquare;
  value: number;
  sub: string;
}): JSX.Element {
  return (
    <div className="reveal kpi-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-soft">{label}</div>
        <Icon size={16} strokeWidth={2} className="flex-shrink-0 text-ink-disabled" />
      </div>
      {/* 26px y no 32: estas cuatro cifras acompañan al porcentaje de
          automatización, que es la respuesta que se viene a buscar. Al mismo
          tamaño competían con él y la pantalla no decía por dónde empezar. */}
      <div className="font-display text-[26px] font-bold leading-none tracking-tight">
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
  const [error, setError] = useState('');

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
        api<unknown>(`/metrics/overview?${qs}`),
        api<AiUsageTotals>(`/metrics/ai-usage?${qs}`),
      ]);
      // Se comprueba la forma antes de desglosarla: esta pantalla entra a
      // `data.messages.fromAi` y compañía sin red debajo.
      if (!esMetricsOverview(overview)) throw new Error('Las métricas llegaron incompletas');
      setData(overview);
      setUsage(consumo);
      setLoadedOnce(true);
      setError('');
    } catch (e) {
      // Sin aviso, al cambiar de período se quedaban las cifras anteriores en
      // pantalla (o el esqueleto girando) y nadie sabía que no eran las pedidas.
      const mensaje = e instanceof Error ? e.message : 'No se pudieron cargar las métricas';
      // El toast se va solo. Si no ha cargado nunca, el esqueleto se quedaba
      // girando para siempre y la pantalla no llegaba a decir qué había pasado.
      setError(mensaje);
      toast.show(mensaje, 'error');
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

      {error && !data ? (
        <EmptyState
          icon={TriangleAlert}
          title="No se pudieron cargar las métricas"
          description={error}
          action={
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      ) : !loadedOnce || !data ? (
        <div className="bento-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="bento-grid">
          {/* La automatización va primera y a todo el ancho.
              Estaba debajo de las cuatro cifras y con la mitad de su tamaño de
              letra, cuando es la única que responde a la pregunta que trae aquí
              a un dueño de negocio: si esto le está quitando trabajo o no. Las
              otras cuatro son la prueba, no la conclusión. */}
          <div className="span-4 reveal flex flex-col items-center gap-7 kpi-card sm:flex-row">
            <RadialGauge aiPct={autoPct} />
            <div className="flex-1">
              <h3 className="mb-1.5 flex items-center gap-2 font-display text-xl font-bold tracking-tight">
                <Sparkles size={18} strokeWidth={2} className="text-ai" /> Automatización
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

          <Kpi
            label="Conversaciones"
            icon={MessageSquare}
            value={data.conversations.total}
            sub={`${data.conversations.open} abiertas · ${data.conversations.closed} cerradas`}
          />
          <Kpi
            label="Mensajes"
            icon={Send}
            value={data.messages.total}
            sub={`${data.messages.inbound} recibidos · ${data.messages.outbound} enviados`}
          />
          <Kpi
            label="Citas"
            icon={CalendarClock}
            value={data.appointments.total}
            sub={`${data.appointments.confirmed} confirmadas · ${data.reminders.pending} recordatorios pendientes`}
          />
          <Kpi label="Contactos" icon={Users} value={data.contacts.total} sub="personas en tu WhatsApp" />

          {usage && usage.calls > 0 && (
            <div className="span-4 reveal kpi-card">
              <h3 className="mb-1.5 flex items-center gap-2 font-display text-base font-bold">
                <Coins size={16} strokeWidth={2} className="text-ai" /> Consumo de la IA
              </h3>
              {/* Tres frases para justificar por qué no hay un importe: la
                  tarjeta se explicaba a sí misma antes de enseñar un solo dato.
                  El motivo cabe en una línea y va donde toca, junto a las
                  cifras que lo necesitan. */}
              <p className="mb-4 text-[13px] text-ink-soft">
                Lo que tu agente gastó en el período, en tokens: el importe depende del modelo y
                de la tarifa vigente.
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
            {/* El período lo fija el selector de arriba; contar las filas
                devueltas hacía que un período sin actividad se anunciara como
                «últimos 0 días». */}
            <h3 className="mb-4 font-display text-base font-bold">Actividad · últimos {range} días</h3>
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
                <Bar dataKey="outbound" name="Enviados" fill={CHART_COLORS.out} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex gap-5 text-[12.5px] text-ink-soft">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.in }} /> Recibidos
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.out }} /> Enviados
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
