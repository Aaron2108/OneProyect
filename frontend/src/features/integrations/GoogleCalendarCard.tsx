import { CalendarCheck2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import type { GoogleCalendarCheck, GoogleCalendarStatus } from '@/lib/types';

/** "hace 3 minutos", "ayer" — una fecha completa aquí es ruido. */
function haceCuanto(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

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

  /**
   * Pregunta a Google si la conexión sirve y sube lo que quedara pendiente.
   *
   * Es lo que convierte "conectado" en algo comprobado: hasta ahora la tarjeta
   * solo sabía que había una cuenta guardada, y si alguien retiraba el permiso
   * desde Google seguía diciendo que todo iba bien.
   */
  async function comprobar(): Promise<void> {
    setBusy(true);
    try {
      const r = await api<GoogleCalendarCheck>('/integrations/google-calendar/check', {
        method: 'POST',
      });
      setStatus(r.status);
      if (!r.ok) {
        toast.show('Google rechazó la conexión guardada', 'error');
      } else if (r.sincronizadas > 0) {
        toast.show(
          r.sincronizadas === 1
            ? 'Conexión correcta. Se envió 1 cita pendiente.'
            : `Conexión correcta. Se enviaron ${r.sincronizadas} citas pendientes.`,
        );
      } else {
        toast.show('Conexión correcta. No había nada pendiente.');
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo comprobar la conexión', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Conectado pero sin credenciales utilizables: la cuenta sigue guardada y el
  // panel decía "conectado", mientras las citas no llegaban a Google. Se avisa
  // aparte de "no conectado" porque la acción es distinta — reconectar, no
  // conectar de cero — y porque hay citas ya agendadas que no se reflejaron.
  const caducado = status?.connected === true && status.needsReconnect;
  const fallosPendientes = status?.pendingSyncCount ?? 0;

  return (
    <div className="mb-6 kpi-card">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-sm ${
            caducado ? 'bg-danger-tint text-danger' : 'bg-brand-tint text-brand'
          }`}
        >
          {caducado ? (
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <CalendarCheck2 size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="text-[14.5px] font-semibold">Google Calendar</div>
          <p className="text-[13px] text-ink-soft">
            {caducado
              ? `${status?.lastCheckError ?? 'La conexión con Google caducó.'} Las citas no se están enviando: vuelve a conectar la cuenta ${status?.googleAccountEmail}.`
              : status?.connected
                ? `Conectado como ${status.googleAccountEmail}. Las citas se reflejan como eventos.`
                : 'Conecta el calendario del negocio para reflejar las citas automáticamente.'}
          </p>
          {/* Que haya una cuenta guardada no prueba que Google la siga
              aceptando. Se dice cuándo se comprobó de verdad —o que no se ha
              comprobado nunca— en vez de dejar "conectado" a secas, que es lo
              que hacía creer que todo iba bien mientras no llegaba nada. */}
          {status?.connected && !caducado && (
            <p className="mt-1 text-[12px] text-ink-faint">
              {status.lastCheckedAt
                ? `Conexión comprobada ${haceCuanto(status.lastCheckedAt)}.`
                : 'Todavía sin comprobar desde que se conectó.'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {status?.connected && (
            <Button variant="sec" disabled={busy} onClick={comprobar}>
              <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
              Sincronizar ahora
            </Button>
          )}
          {caducado ? (
            <Button variant="brand" disabled={busy} onClick={connect}>
              Reconectar
            </Button>
          ) : status?.connected ? (
            <Button variant="danger" disabled={busy} onClick={disconnect}>
              Desconectar
            </Button>
          ) : (
            <Button variant="sec" disabled={busy} onClick={connect}>
              Conectar
            </Button>
          )}
        </div>
      </div>

      {fallosPendientes > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-faint">
          {fallosPendientes === 1
            ? '1 cita no se ha podido enviar a Google y se sigue reintentando.'
            : `${fallosPendientes} citas no se han podido enviar a Google y se siguen reintentando.`}
          {status?.lastSyncError ? ` Último error: ${status.lastSyncError}` : ''}
        </p>
      )}
    </div>
  );
}
