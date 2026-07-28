import clsx from 'clsx';
import { useMemo } from 'react';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { buildMonthGrid, isSameDay, toDateKey, WEEKDAY_LABELS } from './calendar.util';

/** Color del punto por estado — el estado en sí ya se ve con detalle en el panel del día (nunca solo el punto). */
const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warn',
  CONFIRMED: 'bg-brand',
  CANCELLED: 'bg-danger',
  COMPLETED: 'bg-[var(--muted-ink)]',
};

/** Orden fijo de los puntos, para que un día no cambie de aspecto al recargar. */
const ORDEN_ESTADO: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

export function MonthGrid({
  month,
  appointments,
  selectedDate,
  onSelectDate,
}: {
  month: Date;
  appointments: Appointment[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}): JSX.Element {
  // La grilla son 42 `new Date` y el índice recorre todas las citas del mes.
  // Sin memorizar, ambas cosas se rehacían en cada render — y esta vista
  // re-renderiza al elegir un día, al abrir el diálogo y al cerrarlo, sin que
  // ni el mes ni las citas hayan cambiado.
  const days = useMemo(() => buildMonthGrid(month), [month]);
  const byDay = useMemo(() => {
    const mapa = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const key = toDateKey(new Date(appt.scheduledAt));
      const list = mapa.get(key);
      if (list) list.push(appt);
      else mapa.set(key, [appt]);
    }
    return mapa;
  }, [appointments]);

  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-1">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day.date);
          const dayAppointments = byDay.get(key) ?? [];
          const isSelected = isSameDay(day.date, selectedDate);
          // Un punto por estado presente ese día, no uno por cita.
          //
          // Antes se pintaba un punto por cita con un tope de cinco, mientras
          // el rótulo de debajo decía el total: un día con siete citas
          // enseñaba cinco puntos y «7 citas». Los puntos contaban mal y el
          // rótulo contaba bien, dos veces lo mismo y una de ellas falsa. Lo
          // que un punto puede decir de un vistazo es de qué tipo son —si hay
          // algo cancelado, si queda algo por confirmar—; el cuántas ya lo
          // dice el rótulo.
          const estados = ORDEN_ESTADO.filter((e) => dayAppointments.some((a) => a.status === e));
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(day.date)}
              aria-current={day.isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              // El contenido visible se lee como «27 3 citas», sin decir de qué
              // mes ni qué día de la semana. Con el mes a la vista sobra para
              // quien ve; para quien escucha, no.
              aria-label={`${day.date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}${
                dayAppointments.length ? `, ${dayAppointments.length} cita${dayAppointments.length > 1 ? 's' : ''}` : ', sin citas'
              }`}
              className={clsx(
                'flex min-h-[78px] flex-col items-start gap-1 border-b border-r border-line p-1.5 text-left transition-colors last:border-r-0 hover:bg-[var(--row-hover)] sm:min-h-[92px] sm:p-2',
                !day.inCurrentMonth && 'opacity-40',
                isSelected && 'bg-brand-tint hover:bg-brand-tint',
              )}
            >
              <span
                className={clsx(
                  'grid h-6 w-6 place-items-center rounded-full text-[12.5px] font-semibold',
                  // `text-white` sobre el verde de marca da un contraste de
                  // 1,6:1 — el número de hoy era prácticamente invisible. Para
                  // esto existe `--on-brand`, que es el token de «texto encima
                  // del verde» y sube a 11:1.
                  day.isToday && 'bg-brand text-brand-on',
                )}
              >
                {day.date.getDate()}
              </span>
              {dayAppointments.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-0.5" aria-hidden="true">
                    {estados.map((estado) => (
                      <span key={estado} className={clsx('h-1.5 w-1.5 rounded-full', STATUS_DOT[estado])} />
                    ))}
                  </div>
                  <span className="text-[10.5px] font-semibold text-ink-soft">
                    {dayAppointments.length} cita{dayAppointments.length > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
