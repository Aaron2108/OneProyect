import clsx from 'clsx';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { buildMonthGrid, isSameDay, toDateKey, WEEKDAY_LABELS } from './calendar.util';

/** Color del punto por estado — el estado en sí ya se ve con detalle en el panel del día (nunca solo el punto). */
const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warn',
  CONFIRMED: 'bg-brand',
  CANCELLED: 'bg-danger',
  COMPLETED: 'bg-[var(--muted-ink)]',
};

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
  const days = buildMonthGrid(month);
  const byDay = new Map<string, Appointment[]>();
  for (const appt of appointments) {
    const key = toDateKey(new Date(appt.scheduledAt));
    const list = byDay.get(key);
    if (list) list.push(appt);
    else byDay.set(key, [appt]);
  }

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
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(day.date)}
              aria-current={day.isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={clsx(
                'flex min-h-[78px] flex-col items-start gap-1 border-b border-r border-line p-1.5 text-left transition-colors last:border-r-0 hover:bg-[var(--row-hover)] sm:min-h-[92px] sm:p-2',
                !day.inCurrentMonth && 'opacity-40',
                isSelected && 'bg-brand-tint hover:bg-brand-tint',
              )}
            >
              <span
                className={clsx(
                  'grid h-6 w-6 place-items-center rounded-full text-[12.5px] font-semibold',
                  day.isToday && 'bg-brand text-white',
                )}
              >
                {day.date.getDate()}
              </span>
              {dayAppointments.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-0.5" aria-hidden="true">
                    {dayAppointments.slice(0, 5).map((a) => (
                      <span key={a.id} className={clsx('h-1.5 w-1.5 rounded-full', STATUS_DOT[a.status])} />
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
