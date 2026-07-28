import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Download, Plus, Search, TriangleAlert, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, downloadFile } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useListaPaginada } from '@/lib/use-recurso';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import type { Contact } from '@/lib/types';
import { EditContactDialog } from './EditContactDialog';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ContactsPage(): JSX.Element {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  // La ruta lleva ya el filtro; el hook se encarga del rebote, de cancelar la
  // búsqueda anterior, del cursor y del aviso si falla.
  const ruta = query.trim() ? `/contacts?q=${encodeURIComponent(query.trim())}` : '/contacts';
  const {
    items,
    cursor,
    error: errorCarga,
    cargarMas,
    recargar,
  } = useListaPaginada<Contact>(ruta, 'No se pudieron cargar los contactos');

  async function addContact(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    try {
      await api('/contacts', { method: 'POST', body: { phone: phone.trim(), name: name.trim() || undefined } });
      setPhone('');
      setName('');
      setAdding(false);
      toast.show('Contacto añadido');
      void recargar();
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
          {/* La etiqueta sigue al estado. El botón abría y cerraba el
              formulario pero decía «Nuevo contacto» en los dos casos, así que
              con el formulario ya abierto seguía invitando a abrirlo. */}
          <Button size="sm" variant={adding ? 'sec' : 'brand'} onClick={() => setAdding((s) => !s)}>
            {adding ? (
              'Cancelar'
            ) : (
              <>
                <Plus size={15} strokeWidth={2.25} /> Nuevo contacto
              </>
            )}
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
            {/* El formulario aparecía y el foco se quedaba en el botón que lo
                abrió: había que ir a buscar el primer campo con el ratón o con
                el tabulador. */}
            <Input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono (5215500000000)"
              aria-label="Teléfono"
              inputMode="tel"
            />
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
              <Button size="sm" variant="sec" onClick={() => void recargar()}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={query ? 'Sin resultados' : 'Aún no tienes contactos'}
            description={
              query ? `No encontramos nada para “${query}”.` : 'Se crean solos al recibir un mensaje.'
            }
            // Una pantalla vacía es una invitación a hacer algo. Decía «añade el
            // primero arriba» y dejaba al lector buscando cuál de los botones de
            // arriba era; ahora el botón está donde se lee la frase.
            action={
              query ? undefined : (
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus size={15} strokeWidth={2.25} /> Añadir el primero
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-ink-disabled sm:grid">
              <span>Contacto</span>
              {/* Las notas son prosa y van alineadas a la izquierda. Iban a la
                  derecha, como la fecha, y una frase recortada por el final y
                  alineada por ese mismo lado no se puede leer en diagonal: cada
                  fila empezaba en un sitio distinto. A la derecha solo lo que
                  se compara verticalmente, que aquí es la fecha. */}
              <span className="w-[220px]">Notas</span>
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
                  <div className="hidden w-[220px] truncate text-[13px] text-ink-soft sm:block">
                    {c.notes || <span className="text-ink-disabled">Sin notas</span>}
                  </div>
                  <div className="hidden w-[110px] text-right text-[12.5px] text-ink-disabled sm:block">{fmtDate(c.createdAt)}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {cursor && (
          <button onClick={() => void cargarMas()} className="block w-full border-t border-line py-3 text-[13px] font-semibold text-ink-soft transition-colors duration-fast hover:text-brand">
            Cargar más contactos
          </button>
        )}
      </div>

      <EditContactDialog contact={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => void recargar()} />
    </div>
  );
}
