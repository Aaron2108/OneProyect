import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill, type PillKind } from '@/components/ui/Pill';
import { GoogleCalendarCard } from '@/features/integrations/GoogleCalendarCard';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { AppointmentDialog } from './AppointmentDialog';
import { addMonths, buildMonthGrid, formatLongDate, formatTime, isSameDay, MONTH_LABELS, startOfMonth } from './calendar.util';
import { MonthGrid } from './MonthGrid';

const STATUS_PILL: Record<AppointmentStatus, PillKind> = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

export function CalendarPage({ active }: { active: boolean }): JSX.Element {
  const toast = useToast();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  async function load(): Promise<void> {
    const grid = buildMonthGrid(month);
    const from = grid[0].date.toISOString();
    const lastDay = grid[grid.length - 1].date;
    const to = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59).toISOString();
    try {
      const res = await api<Appointment[]>(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setAppointments(res);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudieron cargar las citas', 'error');
    }
  }

  useEffect(() => {
    if (active) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, month]);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  const dayAppointments = appointments
    .filter((a) => isSameDay(new Date(a.scheduledAt), selectedDate))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="mx-auto max-w-[820px] p-5 sm:p-10">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3.5">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Calendario</h2>
          <p className="m-0 text-sm text-ink-soft">Las citas agendadas con tus contactos.</p>
        </div>
        <Button variant="brand" onClick={openCreate}>
          + Nueva cita
        </Button>
      </div>

      <GoogleCalendarCard active={active} />

      <div className="mb-3.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Mes anterior"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--hover-bg)] hover:text-ink"
        >
          ‹
        </button>
        <div className="min-w-[168px] text-center font-display text-[15px] font-bold capitalize">
          {MONTH_LABELS[month.getMonth()]} {month.getFullYear()}
        </div>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Mes siguiente"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--hover-bg)] hover:text-ink"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => {
            setMonth(startOfMonth(new Date()));
            setSelectedDate(new Date());
          }}
          className="ml-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-[var(--hover-bg)] hover:text-ink"
        >
          Hoy
        </button>
      </div>

      <MonthGrid month={month} appointments={appointments} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display text-[15px] font-bold">{formatLongDate(selectedDate)}</h3>
          <button type="button" onClick={openCreate} className="text-[12.5px] font-semibold text-brand-700 hover:underline">
            + Agregar cita este día
          </button>
        </div>

        {dayAppointments.length === 0 ? (
          <EmptyState icon="📅" title="Sin citas este día" description="Agrega una con el botón de arriba." />
        ) : (
          <div ref={listRef} className="overflow-hidden rounded-lg bg-surface shadow-1">
            {dayAppointments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setEditing(a);
                  setDialogOpen(true);
                }}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--row-hover)]"
              >
                <div className="w-12 flex-shrink-0 font-mono text-[13px] text-ink-soft">{formatTime(a.scheduledAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{a.title}</div>
                  <div className="truncate text-[12.5px] text-ink-soft">{a.contact.name || a.contact.phone}</div>
                </div>
                <Pill kind={STATUS_PILL[a.status]} />
              </button>
            ))}
          </div>
        )}
      </div>

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editing}
        defaultDate={selectedDate}
        onSaved={load}
      />
    </div>
  );
}
