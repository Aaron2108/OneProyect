import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/Input';
import type { Appointment, AppointmentStatus, Contact, Page } from '@/lib/types';
import { toDateKey, toTimeInputValue } from './calendar.util';

interface ContactPick {
  id: string;
  label: string;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear una cita nueva. */
  appointment: Appointment | null;
  /** Fecha sugerida (el día seleccionado en la grilla) para una cita nueva. */
  defaultDate: Date;
  onSaved: () => void;
}): JSX.Element {
  const toast = useToast();
  const isEdit = !!appointment;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('SCHEDULED');
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactPick | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setContactQuery('');
    setContactResults([]);
    if (appointment) {
      const d = new Date(appointment.scheduledAt);
      setTitle(appointment.title);
      setDate(toDateKey(d));
      setTime(toTimeInputValue(d));
      setNotes(appointment.notes ?? '');
      setStatus(appointment.status);
      setSelectedContact({ id: appointment.contact.id, label: appointment.contact.name || appointment.contact.phone });
    } else {
      setTitle('');
      setDate(toDateKey(defaultDate));
      setTime('09:00');
      setNotes('');
      setStatus('SCHEDULED');
      setSelectedContact(null);
    }
  }, [open, appointment, defaultDate]);

  useEffect(() => {
    if (!open || isEdit || selectedContact) return;
    const q = contactQuery.trim();
    if (!q) {
      setContactResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api<Page<Contact>>(`/contacts?q=${encodeURIComponent(q)}&limit=8`);
        setContactResults(res.items);
      } catch {
        // búsqueda best-effort: si falla, simplemente no se muestran resultados
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [contactQuery, open, isEdit, selectedContact]);

  async function save(): Promise<void> {
    setError('');
    if (!isEdit && !selectedContact) {
      setError('Elige un contacto');
      return;
    }
    if (!title.trim() || !date || !time) {
      setError('Completa el título, la fecha y la hora');
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      if (isEdit && appointment) {
        await api(`/appointments/${appointment.id}`, {
          method: 'PATCH',
          body: { title: title.trim(), scheduledAt, notes: notes.trim() || undefined, status },
        });
        toast.show('Cita actualizada');
      } else {
        await api('/appointments', {
          method: 'POST',
          body: { contactId: selectedContact!.id, title: title.trim(), scheduledAt, notes: notes.trim() || undefined },
        });
        toast.show('Cita creada');
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la cita');
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment(): Promise<void> {
    if (!appointment) return;
    setSaving(true);
    setError('');
    try {
      await api(`/appointments/${appointment.id}`, { method: 'PATCH', body: { status: 'CANCELLED' } });
      toast.show('Cita cancelada');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cancelar la cita');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Editar cita' : 'Nueva cita'}
      description={isEdit ? undefined : 'Agenda una cita con un contacto — se refleja en Google Calendar si lo tienes conectado.'}
      footer={
        <>
          {isEdit && appointment?.status !== 'CANCELLED' && (
            <Button variant="danger" onClick={cancelAppointment} disabled={saving}>
              Cancelar cita
            </Button>
          )}
          <Button variant="sec" onClick={() => onOpenChange(false)} disabled={saving}>
            Cerrar
          </Button>
          <Button variant="brand" onClick={save} loading={saving} disabled={saving}>
            {isEdit ? 'Guardar cambios' : 'Crear cita'}
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-3.5 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </div>
      )}

      {!isEdit && (
        <Field>
          <Label htmlFor="ap_contact">Contacto</Label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5">
              <span className="text-[14px] font-semibold">{selectedContact.label}</span>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="text-[12.5px] font-semibold text-ink-soft hover:text-danger"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <Input
                id="ap_contact"
                placeholder="Busca por nombre o teléfono"
                autoComplete="off"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
              {contactResults.length > 0 && (
                <div className="mt-1 max-h-[160px] overflow-y-auto rounded-sm border border-line-strong bg-surface shadow-2">
                  {contactResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedContact({ id: c.id, label: c.name || c.phone });
                        setContactResults([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-[13.5px] hover:bg-[var(--row-hover)]"
                    >
                      <b>{c.name || 'Sin nombre'}</b> <span className="font-mono text-ink-soft">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
      )}

      <Field>
        <Label htmlFor="ap_title">Título</Label>
        <Input id="ap_title" placeholder="Ej. Consulta inicial" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="mb-3.5 flex gap-2.5">
        <Field className="mb-0 flex-1">
          <Label htmlFor="ap_date">Fecha</Label>
          <Input id="ap_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field className="mb-0 flex-1">
          <Label htmlFor="ap_time">Hora</Label>
          <Input id="ap_time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      {isEdit && (
        <Field>
          <Label htmlFor="ap_status">Estado</Label>
          <select
            id="ap_status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            className="w-full rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 text-ink focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
          >
            <option value="SCHEDULED">Agendada</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </Field>
      )}

      <Field>
        <Label htmlFor="ap_notes">Notas</Label>
        <Textarea id="ap_notes" rows={3} placeholder="Notas opcionales…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
