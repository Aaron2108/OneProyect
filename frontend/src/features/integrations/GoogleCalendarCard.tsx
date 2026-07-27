import { CalendarCheck2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
export function GoogleCalendarCard(): JSX.Element | null {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      setStatus(await api<GoogleCalendarStatus>('/integrations/google-calendar/status'));
    } catch (e) {
      // Si no se sabe el estado, la tarjeta se queda con el texto de "no
      // conectado": sin aviso, el dueño creería que se le desconectó el
      // calendario cuando lo que falló fue la consulta.
      toast.show(e instanceof Error ? e.message : 'No se pudo consultar Google Calendar', 'error');
    }
  }

  // Solo al montar: `load` se recrea en cada render, así que declararla como
  // dependencia volvería a consultar el estado sin parar.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El backend redirige aquí tras el consentimiento en Google con
  // ?googleCalendar=connected|error.
  //
  // Se lee con `useSearchParams` en vez de `window.location` + `replaceState`:
  // escribir la URL por debajo del router lo deja con una `location` que ya no
  // es la real, y cualquier componente que dependa de ella se queda con la
  // anterior.
  useEffect(() => {
    const result = searchParams.get('googleCalendar');
    if (!result) return;
    if (result === 'connected') {
      toast.show('Google Calendar conectado');
      void load();
    } else {
      toast.show('No se pudo conectar Google Calendar', 'error');
    }
    const restantes = new URLSearchParams(searchParams);
    restantes.delete('googleCalendar');
    // `replace` para que el parámetro consumido no quede en el historial y
    // volver atrás no repita el aviso.
    setSearchParams(restantes, { replace: true });
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
    <div className="mb-6 flex flex-wrap items-center gap-4 kpi-card">
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-sm bg-brand-tint text-brand">
        <CalendarCheck2 size={18} strokeWidth={2} />
      </div>
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
