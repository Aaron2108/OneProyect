import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Coins,
  Download,
  Minus,
  MessageSquare,
  Send,
  Sparkles,
  Timer,
  TriangleAlert,
  Users,
} from 'lucide-react';
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

const DIA_MS = 86400000;

/**
 * Segundos en algo legible: «8 s», «3 min», «2 h 10 min».
 *
 * `null` no se convierte en «0 s»: significa que no hubo ninguna pareja
 * entrante→saliente en el período, que es una cosa muy distinta de contestar al
 * instante. Y por debajo del segundo se dice así en vez de redondear a cero,
 * que es lo que pasa cuando la IA responde en milisegundos.
 */
function formatearEspera(segundos: number | null): string | null {
  if (segundos === null) return null;
  if (segundos < 1) return 'menos de 1 s';
  if (segundos < 60) return `${Math.round(segundos)} s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)} min`;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`;
}

/**
 * Variación frente al mismo número en el período anterior.
 *
 * El dato no lo inventa el panel: se pide el mismo `/metrics/overview` para la
 * ventana inmediatamente anterior y se comparan. Por eso `anterior` puede ser
 * `null` —esa segunda petición falló o todavía no llegó— y en ese caso no se
 * pinta nada, que es lo honesto: mejor sin variación que con una inventada.
 */
function Variacion({ actual, anterior }: { actual: number; anterior: number | null }): JSX.Element | null {
  if (anterior === null) return null;

  if (anterior === 0) {
    // No hay base con la que dividir: un porcentaje aquí sería infinito o cero
    // según cómo se mire, y ninguna de las dos cosas significa nada.
    if (actual === 0) return <span className="text-[11.5px] text-ink-disabled">sin actividad antes</span>;
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand">
        <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden="true" /> nuevo este período
      </span>
    );
  }

  const pct = ((actual - anterior) / anterior) * 100;
  const redondeado = Math.abs(pct) < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);

  if (redondeado === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-faint">
        <Minus size={13} strokeWidth={2.5} aria-hidden="true" /> sin cambio
      </span>
    );
  }

  const sube = redondeado > 0;
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${sube ? 'text-brand' : 'text-warn'}`}
    >
      <Flecha size={13} strokeWidth={2.5} aria-hidden="true" />
      {sube ? '+' : '−'}
      {Math.abs(redondeado).toLocaleString('es')}%
      <span className="font-normal text-ink-faint">vs. anterior</span>
    </span>
  );
}

function Kpi({
  label,
  icon: Icon,
  value,
  anterior,
  sub,
}: {
  label: string;
  icon: typeof MessageSquare;
  value: number;
  anterior: number | null;
  sub: string;
}): JSX.Element {
  return (
    <div className="reveal kpi-card flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-soft">{label}</div>
        <Icon size={16} strokeWidth={2} className="flex-shrink-0 text-ink-disabled" />
      </div>
      <div className="tabular-nums font-display text-[30px] font-bold leading-none tracking-tight">
        <CountUp value={value} />
      </div>
      <div className="mt-2.5 min-h-[17px]">
        <Variacion actual={value} anterior={anterior} />
      </div>
      <div className="mt-1.5 text-xs text-ink-faint">{sub}</div>
    </div>
  );
}

/** Una línea del resumen ejecutivo: etiqueta a la izquierda, cifra a la derecha. */
function Linea({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-soft">
        {color && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: color }} />}
        <span className="truncate">{label}</span>
      </span>
      <b className="tabular-nums flex-shrink-0 text-[13.5px]">{value}</b>
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
  // El mismo resumen para la ventana anterior, solo para las variaciones. Si
  // falla no se cuenta como error de la pantalla: las cifras del período
  // pedido siguen siendo válidas, simplemente no se enseña la comparación.
  const [previo, setPrevio] = useState<MetricsOverview | null>(null);
  const [usage, setUsage] = useState<AiUsageTotals | null>(null);
  const [showTable, setShowTable] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const load = useCallback(async (dias: number): Promise<void> => {
    const to = new Date();
    const from = new Date(to.getTime() - (dias - 1) * DIA_MS);
    from.setHours(0, 0, 0, 0);
    // La ventana anterior, del mismo tamaño y pegada a la actual.
    const toPrev = new Date(from.getTime() - 1);
    const fromPrev = new Date(from.getTime() - dias * DIA_MS);
    const rango = (a: Date, b: Date): string =>
      `from=${encodeURIComponent(a.toISOString())}&to=${encodeURIComponent(b.toISOString())}`;

    try {
      // En paralelo: son preguntas distintas (cuánto se trabajó, cuánto costó y
      // cómo fue antes) y ninguna debe esperar a la otra.
      const [overview, consumo, anterior] = await Promise.all([
        api<unknown>(`/metrics/overview?${rango(from, to)}`),
        api<AiUsageTotals>(`/metrics/ai-usage?${rango(from, to)}`),
        // La comparación es un extra: si se cae, no tumba la pantalla.
        api<unknown>(`/metrics/overview?${rango(fromPrev, toPrev)}`).catch(() => null),
      ]);
      // Se comprueba la forma antes de desglosarla: esta pantalla entra a
      // `data.messages.fromAi` y compañía sin red debajo.
      if (!esMetricsOverview(overview)) throw new Error('Las métricas llegaron incompletas');
      setData(overview);
      setUsage(consumo);
      setPrevio(esMetricsOverview(anterior) ? anterior : null);
      setActualizado(new Date());
      setLoadedOnce(true);
      setError('');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudieron cargar las métricas';
      // El toast se va solo. Si no ha cargado nunca, el esqueleto se quedaba
      // girando para siempre y la pantalla no llegaba a decir qué había pasado.
      setError(mensaje);
      toast.show(mensaje, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const chartData = useMemo(
    () => (data?.activity ?? []).map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` })),
    [data],
  );
  const autoPct = data ? Math.round(data.automationRate * 100) : 0;

  /**
   * Exporta la actividad diaria a CSV.
   *
   * Se arma en el navegador con los datos que ya están en pantalla: la API de
   * métricas solo tiene `overview` y `ai-usage`, no hay endpoint de descarga, y
   * un botón que pidiera uno inexistente sería un botón roto.
   */
  function exportarCsv(): void {
    if (!data) return;
    const filas = [
      ['Día', 'Recibidos', 'Enviados'],
      ...data.activity.map((d) => [d.date, String(d.inbound), String(d.outbound)]),
    ];
    // El BOM es lo que hace que Excel abra el archivo como UTF-8; sin él, los
    // acentos de la cabecera salen rotos.
    const blob = new Blob(['﻿' + filas.map((f) => f.join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actividad-${range}-dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-wide">
      {/* ---- Fila 1: qué es esto, qué período y qué se puede hacer ---- */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Métricas</h2>
          <p className="m-0 text-sm text-ink-soft">Cómo está trabajando tu empleado digital, en el período elegido.</p>
        </div>
        {/* `flex-nowrap`: los tres controles son una sola pieza y en una fila
            de 1600px caben de sobra. Envolviéndolos, el selector se llevaba una
            línea para él solo y el botón otra. */}
        <div className="flex flex-shrink-0 items-center gap-2.5">
          {actualizado && (
            <span className="hidden text-[11.5px] text-ink-faint sm:inline">
              Actualizado a las {actualizado.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            aria-label="Período"
            className="flex-shrink-0 !py-2.5"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </Select>
          <Button size="sm" variant="sec" onClick={exportarCsv} disabled={!data}>
            <Download size={15} strokeWidth={2.25} /> Exportar
          </Button>
        </div>
      </div>

      {error && !data ? (
        <EmptyState
          icon={TriangleAlert}
          title="No se pudieron cargar las métricas"
          description={error}
          action={
            <Button size="sm" variant="ghost" onClick={() => void load(range)}>
              Reintentar
            </Button>
          }
        />
      ) : !loadedOnce || !data ? (
        <div className="grid-kpis">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="stack-lg">
          {/* ---- Fila 2: las cuatro cifras, con su variación ---- */}
          <div className="grid-kpis">
            <Kpi
              label="Conversaciones"
              icon={MessageSquare}
              value={data.conversations.total}
              anterior={previo?.conversations.total ?? null}
              sub={`${data.conversations.open} abiertas · ${data.conversations.closed} cerradas`}
            />
            <Kpi
              label="Mensajes"
              icon={Send}
              value={data.messages.total}
              anterior={previo?.messages.total ?? null}
              sub={`${data.messages.inbound} recibidos · ${data.messages.outbound} enviados`}
            />
            <Kpi
              label="Contactos"
              icon={Users}
              value={data.contacts.total}
              anterior={previo?.contacts.total ?? null}
              sub="personas en tu WhatsApp"
            />
            <Kpi
              label="Citas"
              icon={CalendarClock}
              value={data.appointments.total}
              anterior={previo?.appointments.total ?? null}
              sub={`${data.appointments.confirmed} confirmadas · ${data.reminders.pending} recordatorios pendientes`}
            />
          </div>

          {/* ---- Fila 3: el gráfico y, al lado, quién hizo el trabajo ----
               El consumo de la IA estaba también en esta columna, y entre el
               medidor, los dos desgloses y las seis líneas de consumo la
               derecha medía casi el doble que el gráfico: quedaba un hueco
               abierto debajo de él, sin dueño, hasta la fila siguiente. Ahora
               el consumo baja a la fila de la tabla, donde equilibra, y aquí
               quedan solo el medidor y los dos repartos. */}
          <div className="grid-2-1">
            <section className="reveal kpi-card flex flex-col">
              <div className="sec-head flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="sec-head__eyebrow">Actividad</span>
                  {/* El período lo fija el selector de arriba; contar las filas
                      devueltas hacía que un período sin actividad se anunciara
                      como «últimos 0 días». */}
                  <h3 className="sec-head__title font-display">Mensajes por día · últimos {range} días</h3>
                </div>
                <div className="flex gap-4 text-[12.5px] text-ink-soft">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.in }} /> Recibidos
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.out }} /> Enviados
                  </span>
                </div>
              </div>
              {/* `flex-1` con `min-h-0`: el gráfico crece hasta llenar el alto
                  que le marque la tarjeta más alta de la fila, en vez de
                  quedarse en 300px fijos y dejar el resto en blanco. El mínimo
                  evita que se aplaste si algún día la otra columna es corta. */}
              <div className="min-h-[280px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={3}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    {/* `minTickGap` en vez de un `interval` calculado a mano.
                        El interval se sacaba del número de días, que no dice
                        nada de cuántos píxeles hay: en tableta las fechas se
                        montaban unas encima de otras. Con esto es Recharts
                        quien mide el ancho real y descarta las que no caben,
                        conservando siempre la primera y la última. */}
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={26}
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover-bg)' }} />
                    <Bar dataKey="inbound" name="Recibidos" fill={CHART_COLORS.in} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="outbound" name="Enviados" fill={CHART_COLORS.out} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="reveal kpi-card flex flex-col">
              <div className="sec-head">
                <span className="sec-head__eyebrow">Resumen</span>
                <h3 className="sec-head__title font-display">Quién hizo el trabajo</h3>
              </div>

              <div className="flex items-center gap-4">
                <RadialGauge aiPct={autoPct} />
                <div className="min-w-0">
                  <h4 className="mb-1 flex items-center gap-2 text-[14px] font-bold">
                    <Sparkles size={15} strokeWidth={2} className="text-ai" /> Automatización
                  </h4>
                  <p className="m-0 text-[12.5px] leading-relaxed text-ink-soft">
                    De las respuestas enviadas, cuántas resolvió la IA sin intervención humana.
                  </p>
                </div>
              </div>

              {/* `mt-auto` reparte el sobrante entre el medidor y los desgloses
                  en vez de dejarlo todo al final. */}
              <div className="mt-auto pt-5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">
                  Conversaciones atendidas
                </div>
                <Linea label="Por la IA" value={data.conversations.handledByAi.toLocaleString('es')} color="var(--ai)" />
                <Linea
                  label="Por una persona"
                  value={data.conversations.handledByHuman.toLocaleString('es')}
                  color="var(--brand)"
                />
              </div>

              <div className="pt-5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">
                  Respuestas enviadas
                </div>
                <Linea label="Escritas por la IA" value={data.messages.fromAi.toLocaleString('es')} color="var(--ai)" />
                <Linea
                  label="Escritas por un agente"
                  value={data.messages.fromHuman.toLocaleString('es')}
                  color="var(--brand)"
                />
              </div>

              {/* Tiempo de respuesta.
                  Es la mediana y se dice que lo es: la media la arrastra una
                  sola respuesta nocturna y dejaría de describir a ninguna de
                  las respuestas reales. Si no hubo ninguna pareja
                  entrante→saliente en el período no se enseña nada, en vez de
                  un cero que se leería como «se contesta al instante». */}
              <div className="pt-5">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">
                  <Timer size={13} strokeWidth={2.25} /> Tiempo de respuesta (mediana)
                </div>
                {data.responseTime.samples === 0 ? (
                  <p className="py-2 text-[12.5px] text-ink-faint">
                    Todavía no hay ningún mensaje contestado en este período.
                  </p>
                ) : (
                  <>
                    <Linea label="En general" value={formatearEspera(data.responseTime.medianSeconds) ?? '—'} />
                    {data.responseTime.aiSamples > 0 && (
                      <Linea
                        label="Cuando contesta la IA"
                        value={formatearEspera(data.responseTime.aiMedianSeconds) ?? '—'}
                        color="var(--ai)"
                      />
                    )}
                    {data.responseTime.humanSamples > 0 && (
                      <Linea
                        label="Cuando contesta una persona"
                        value={formatearEspera(data.responseTime.humanMedianSeconds) ?? '—'}
                        color="var(--brand)"
                      />
                    )}
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
                      Sobre {data.responseTime.samples.toLocaleString('es')} respuesta
                      {data.responseTime.samples === 1 ? '' : 's'}. La media es{' '}
                      {formatearEspera(data.responseTime.averageSeconds) ?? '—'}, más alta porque una
                      sola respuesta tardía la arrastra entera.
                    </p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* ---- Fila 4: el detalle diario y, al lado, lo que costó ---- */}
          <div className="grid-2-1">
            <section className="reveal kpi-card flex flex-col">
              <div className="sec-head flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="sec-head__eyebrow">Detalle</span>
                  <h3 className="sec-head__title font-display">Actividad día a día</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="sec" onClick={exportarCsv}>
                    <Download size={14} strokeWidth={2.25} /> Descargar CSV
                  </Button>
                  <button
                    onClick={() => setShowTable((s) => !s)}
                    className="rounded-xs px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors duration-fast hover:bg-[var(--hover-bg)] hover:text-brand"
                    aria-expanded={showTable}
                  >
                    {showTable ? 'Ocultar tabla' : 'Ver tabla'}
                  </button>
                </div>
              </div>

              {showTable && (
                // Se desplaza por dentro: con 90 días son noventa filas, y sin
                // tope la página se alargaba tanto que la tabla dejaba de ser
                // una sección para convertirse en el final del panel.
                <div className="max-h-[420px] flex-1 overflow-auto">
                  <table className="w-full min-w-[420px] border-collapse text-[13px]">
                    <thead className="sticky top-0 bg-surface">
                      {/* `scope="col"` para que el lector de pantalla relacione cada
                          número con su columna al recorrer la tabla. */}
                      <tr>
                        <th scope="col" className="border-b border-line py-2 text-left font-semibold text-ink-soft">Día</th>
                        <th scope="col" className="border-b border-line py-2 text-right font-semibold text-ink-soft">Recibidos</th>
                        <th scope="col" className="border-b border-line py-2 text-right font-semibold text-ink-soft">Enviados</th>
                        <th scope="col" className="border-b border-line py-2 text-right font-semibold text-ink-soft">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activity.map((d) => (
                        <tr key={d.date} className="transition-colors duration-fast hover:bg-[var(--row-hover)]">
                          <td className="border-b border-line py-2">{d.date}</td>
                          <td className="tabular-nums border-b border-line py-2 text-right">{d.inbound}</td>
                          <td className="tabular-nums border-b border-line py-2 text-right">{d.outbound}</td>
                          <td className="tabular-nums border-b border-line py-2 text-right font-semibold">
                            {d.inbound + d.outbound}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {usage && usage.calls > 0 && (
              <section className="reveal kpi-card flex flex-col">
                <div className="sec-head">
                  <span className="sec-head__eyebrow">Coste</span>
                  <h3 className="sec-head__title flex items-center gap-2 font-display">
                    <Coins size={17} strokeWidth={2} className="text-ai" /> Consumo de la IA
                  </h3>
                </div>
                <Linea label="Llamadas a la API" value={usage.calls.toLocaleString('es')} />
                <Linea label="Tokens de entrada" value={usage.inputTokens.toLocaleString('es')} />
                <Linea label="Tokens de salida" value={usage.outputTokens.toLocaleString('es')} />
                {/* Las llamadas no son una por respuesta: agendar una cita o
                    mirar el catálogo encadena varias, y aquí se ve. */}
                {usage.byPurpose.map((p) => (
                  <Linea
                    key={p.purpose}
                    label={PURPOSE_LABELS[p.purpose] ?? p.purpose}
                    value={p.calls.toLocaleString('es')}
                  />
                ))}
                {/* Pegada a las cifras que explica, no al fondo de la tarjeta:
                    anclada abajo con `mt-auto` dejaba un hueco entre la última
                    cifra y la nota, y un vacío en medio del contenido se lee
                    peor que el mismo vacío al final. */}
                <p className="pt-4 text-[11.5px] leading-relaxed text-ink-faint">
                  En tokens y no en dinero: el importe depende del modelo y de la tarifa vigente.
                </p>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
