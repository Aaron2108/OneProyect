import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import type { GoogleCalendarStatus } from '@/lib/types';

/**
 * Conexión de Google Calendar del negocio (Fase 3, ver docs/ROADMAP.md).
 * Sincronización de una sola vía: las citas creadas/editadas en WhatsFlow se
 * reflejan como eventos en el calendario conectado. Solo el OWNER conecta o
 * desconecta la cuenta (una por tenant).
 */
export function GoogleCalendarCard({ active }: { active: boolean }): JSX.Element | null {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setStatus(await api<GoogleCalendarStatus>('/integrations/google-calendar/status'));
  }

  useEffect(() => {
    if (active) void load();
  }, [active]);

  // El backend redirige aquí tras el consentimiento en Google con ?googleCalendar=connected|error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('googleCalendar');
    if (!result) return;
    if (result === 'connected') {
      toast.show('Google Calendar conectado');
      void load();
    } else {
      toast.show('No se pudo conectar Google Calendar', 'error');
    }
    params.delete('googleCalendar');
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user?.role !== 'OWNER') return null;

  async function connect(): Promise<void> {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>('/integrations/google-calendar/connect-url');
      window.location.href = url;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo iniciar la conexión', 'error');
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true);
    try {
      await api('/integrations/google-calendar/disconnect', { method: 'POST' });
      toast.show('Google Calendar desconectado');
      await load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo desconectar', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded bg-surface p-3.5 shadow-1">
      <div className="flex-1">
        <div className="text-[14.5px] font-semibold">Google Calendar</div>
        <p className="text-[13px] text-ink-soft">
          {status?.connected
            ? `Conectado como ${status.googleAccountEmail}. Las citas se reflejan como eventos.`
            : 'Conecta el calendario del negocio para reflejar las citas automáticamente.'}
        </p>
      </div>
      {status?.connected ? (
        <Button variant="danger" disabled={busy} onClick={disconnect}>
          Desconectar
        </Button>
      ) : (
        <Button variant="sec" disabled={busy} onClick={connect}>
          Conectar
        </Button>
      )}
    </div>
  );
}
