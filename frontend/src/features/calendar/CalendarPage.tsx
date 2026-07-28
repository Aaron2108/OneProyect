import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
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

export function CalendarPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [error, setError] = useState('');
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  async function load(): Promise<void> {
    const grid = buildMonthGrid(month);
    const from = grid[0].date.toISOString();
    const lastDay = grid[grid.length - 1].date;
    const to = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59).toISOString();
    try {
      const res = await api<Appointment[]>(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setAppointments(res);
      setError('');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudieron cargar las citas';
      // Un mes que no se pudo cargar se veía exactamente igual que un mes sin
      // ninguna cita: la rejilla en blanco y nada más. El único aviso era un
      // toast, que se va solo, y cambiar de mes lo repetía sin dejar rastro.
      setError(mensaje);
      setAppointments([]);
      toast.show(mensaje, 'error');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  // Filtrar y ordenar solo cuando cambian el día elegido o las citas: antes se
  // rehacía en cada render, incluido el de abrir o cerrar el diálogo.
  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.scheduledAt), selectedDate))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [appointments, selectedDate],
  );

  return (
    <div className="mx-auto max-w-[1100px] p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <CalendarDays size={22} strokeWidth={2} className="text-brand" /> Calendario
          </h2>
          <p className="m-0 text-sm text-ink-soft">Las citas agendadas con tus contactos.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} strokeWidth={2.25} /> Nueva cita
        </Button>
      </div>

      {/* Quien decide si la integración se ve es la página, no la tarjeta. Antes
          se montaba siempre y era ella la que devolvía null para los agentes:
          para entonces ya había consultado el estado de la conexión, una
          petición cuyo resultado nadie iba a ver. */}
      {user?.role === 'OWNER' && <GoogleCalendarCard />}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <div className="mb-4 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              aria-label="Mes anterior"
              className="grid h-8 w-8 place-items-center rounded-sm text-ink-soft transition-colors duration-fast hover:bg-[var(--hover-bg)] hover:text-ink"
            >
              <ChevronLeft size={17} strokeWidth={2} />
            </button>
            <div className="min-w-[168px] text-center font-display text-[15px] font-bold capitalize">
              {MONTH_LABELS[month.getMonth()]} {month.getFullYear()}
            </div>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
              className="grid h-8 w-8 place-items-center rounded-sm text-ink-soft transition-colors duration-fast hover:bg-[var(--hover-bg)] hover:text-ink"
            >
              <ChevronRight size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelectedDate(new Date());
              }}
              className="ml-1.5 rounded-sm px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors duration-fast hover:bg-[var(--hover-bg)] hover:text-ink"
            >
              Hoy
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-danger-tint px-4 py-3 text-[13.5px] text-danger"
            >
              <TriangleAlert size={15} strokeWidth={2} className="flex-shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="flex-shrink-0 font-semibold underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          )}

          <MonthGrid month={month} appointments={appointments} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <div className="w-full flex-shrink-0 lg:w-[300px]">
          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <h3 className="font-display text-[14.5px] font-bold capitalize">{formatLongDate(selectedDate)}</h3>
              <button type="button" onClick={openCreate} className="flex-shrink-0 text-brand transition-colors duration-fast hover:text-brand-hover" aria-label="Agregar cita este día">
                <Plus size={16} strokeWidth={2.25} />
              </button>
            </div>

            {dayAppointments.length === 0 ? (
              // Era una frase y un punto final. El botón de agregar existía,
              // pero como un «+» de dieciséis píxeles en la esquina de arriba,
              // lejos de donde se lee que no hay nada.
              <div className="py-4 text-center">
                <p className="mb-3 text-[13px] text-ink-disabled">Sin citas este día.</p>
                <Button size="sm" variant="ghost" onClick={openCreate}>
                  <Plus size={14} strokeWidth={2.25} /> Agendar una
                </Button>
              </div>
            ) : (
              <div ref={listRef} className="flex flex-col gap-2">
                {dayAppointments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setEditing(a);
                      setDialogOpen(true);
                    }}
                    className="flex w-full items-start gap-3 rounded-sm border border-line px-3 py-2.5 text-left transition-colors duration-fast hover:border-line-strong hover:bg-[var(--row-hover)]"
                  >
                    <div className="w-11 flex-shrink-0 pt-0.5 font-mono text-[12.5px] text-ink-soft">{formatTime(a.scheduledAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{a.title}</div>
                      <div className="truncate text-[12px] text-ink-soft">{a.contact.name || a.contact.phone}</div>
                    </div>
                    <Pill kind={STATUS_PILL[a.status]} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
