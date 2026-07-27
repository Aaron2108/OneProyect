import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Download, Plus, Search, TriangleAlert, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, downloadFile, esCancelacion } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import type { Contact, Page } from '@/lib/types';
import { EditContactDialog } from './EditContactDialog';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ContactsPage(): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  // Separado del error del formulario: sirve para no enseñar "aún no tienes
  // contactos" cuando la lista está vacía porque la petición falló.
  const [errorCarga, setErrorCarga] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const loadedOnce = useRef(false);

  async function load(reset: boolean, signal?: AbortSignal): Promise<void> {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    if (!reset && cursor) qs.set('cursor', cursor);
    try {
      const res = await api<Page<Contact>>(`/contacts?${qs.toString()}`, { signal });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setErrorCarga('');
    } catch (e) {
      // Cancelada porque se siguió tecleando o se salió de la pantalla: su
      // respuesta ya no vale y no hay error que enseñar.
      if (esCancelacion(e)) return;
      const mensaje = e instanceof Error ? e.message : 'No se pudieron cargar los contactos';
      setErrorCarga(mensaje);
      toast.show(mensaje, 'error');
    }
  }

  useEffect(() => {
    clearTimeout(searchTimer.current);
    // El rebote no basta: si una búsqueda tarda más que la siguiente, su
    // respuesta llegaba después y pisaba la lista con resultados de un texto que
    // el usuario ya había cambiado. Cancelarla al salir del efecto lo impide.
    const control = new AbortController();
    const delay = loadedOnce.current ? 300 : 0;
    searchTimer.current = setTimeout(() => {
      loadedOnce.current = true;
      void load(true, control.signal);
    }, delay);
    return () => {
      clearTimeout(searchTimer.current);
      control.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function addContact(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    try {
      await api('/contacts', { method: 'POST', body: { phone: phone.trim(), name: name.trim() || undefined } });
      setPhone('');
      setName('');
      setAdding(false);
      toast.show('Contacto añadido');
      void load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo añadir el contacto');
    }
  }

  return (
    <div className="mx-auto max-w-[920px] p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Contactos</h2>
          <p className="m-0 text-sm text-ink-soft">Las personas que escriben a tu WhatsApp. Se crean solas al recibir su primer mensaje.</p>
        </div>
        <div className="flex flex-shrink-0 gap-2.5">
          <button
            onClick={() => downloadFile('/contacts/export', 'contactos.csv').catch((e) => toast.show(e.message, 'error'))}
            className="flex items-center gap-1.5 rounded-sm border border-line-strong px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors duration-fast hover:border-brand/50 hover:text-brand"
          >
            <Download size={14} strokeWidth={2} /> Exportar
          </button>
          <Button size="sm" onClick={() => setAdding((s) => !s)}>
            <Plus size={15} strokeWidth={2.25} /> Nuevo contacto
          </Button>
        </div>
      </div>

      {adding && (
        <form onSubmit={addContact} className="mb-5 flex flex-wrap items-end gap-3 kpi-card">
          {error && <div role="alert" className="w-full rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">{error}</div>}
          {/* `aria-label` y no una etiqueta visible: el placeholder desaparece al
              escribir y un lector de pantalla solo anunciaba "cuadro de edición".
              Poner un <Label> encima cambiaría el diseño del formulario. */}
          <div className="min-w-[180px] flex-1">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (5215500000000)" aria-label="Teléfono" inputMode="tel" />
          </div>
          <div className="min-w-[180px] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre (opcional)" />
          </div>
          <Button type="submit">Añadir</Button>
        </form>
      )}

      <div className="relative mb-5">
        <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-disabled" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar contactos"
          className="w-full rounded-sm border border-line-strong bg-[var(--input-bg)] py-3 pl-10 pr-4 text-[14.5px] transition-[border-color,box-shadow] duration-fast focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {items.length === 0 && errorCarga ? (
          <EmptyState
            icon={TriangleAlert}
            title="No se pudieron cargar los contactos"
            description={errorCarga}
            action={
              <Button size="sm" variant="sec" onClick={() => void load(true)}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={query ? 'Sin resultados' : 'Aún no tienes contactos'}
            description={query ? `No encontramos nada para “${query}”.` : 'Se crean solos al recibir un mensaje, o añade el primero arriba.'}
          />
        ) : (
          <>
            <div className="hidden grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-ink-disabled sm:grid">
              <span>Contacto</span>
              <span className="text-right">Notas</span>
              <span className="w-[110px] text-right">Cliente desde</span>
            </div>
            <div ref={listRef}>
              {items.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(c)}
                  // `preventDefault` en la barra espaciadora: sin él el navegador
                  // además desplaza la página al abrir la ficha con teclado.
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    setEditing(c);
                  }}
                  className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 border-b border-line px-5 py-3.5 transition-colors duration-fast last:border-0 hover:bg-[var(--row-hover)] sm:grid-cols-[1fr_auto_auto]"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Avatar name={c.name} phone={c.phone} seed={c.id} size={38} />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold">{c.name || 'Sin nombre'}</div>
                      <div className="truncate font-mono text-[12.5px] text-ink-soft">{c.phone}</div>
                    </div>
                  </div>
                  <div className="hidden max-w-[220px] truncate text-right text-[13px] text-ink-soft sm:block">{c.notes || '—'}</div>
                  <div className="hidden w-[110px] text-right text-[12.5px] text-ink-disabled sm:block">{fmtDate(c.createdAt)}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {cursor && (
          <button onClick={() => load(false)} className="block w-full border-t border-line py-3 text-[13px] font-semibold text-ink-soft transition-colors duration-fast hover:text-brand">
            Cargar más contactos
          </button>
        )}
      </div>

      <EditContactDialog contact={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => load(true)} />
    </div>
  );
}
