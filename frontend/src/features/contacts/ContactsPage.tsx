import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, downloadFile } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Contact, Page } from '@/lib/types';
import { EditContactDialog } from './EditContactDialog';

export function ContactsPage({ active }: { active: boolean }): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const loadedOnce = useRef(false);

  async function load(reset: boolean): Promise<void> {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    if (!reset && cursor) qs.set('cursor', cursor);
    const res = await api<Page<Contact>>(`/contacts?${qs.toString()}`);
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.nextCursor);
  }

  useEffect(() => {
    if (!active) return;
    clearTimeout(searchTimer.current);
    const delay = loadedOnce.current ? 300 : 0;
    searchTimer.current = setTimeout(() => {
      loadedOnce.current = true;
      void load(true);
    }, delay);
    return () => clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, query]);

  async function addContact(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    try {
      await api('/contacts', { method: 'POST', body: { phone: phone.trim(), name: name.trim() || undefined } });
      setPhone('');
      setName('');
      toast.show('Contacto añadido');
      void load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo añadir el contacto');
    }
  }

  return (
    <div className="mx-auto max-w-[780px] p-5 sm:p-10">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3.5">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Contactos</h2>
          <p className="m-0 text-sm text-ink-soft">Las personas que escriben a tu WhatsApp. Se crean solas al recibir su primer mensaje; también puedes añadirlas a mano.</p>
        </div>
        <button
          onClick={() => downloadFile('/contacts/export', 'contactos.csv').catch((e) => toast.show(e.message, 'error'))}
          className="flex-shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </div>
      )}

      <form onSubmit={addContact} className="mb-5 flex flex-wrap gap-2.5 rounded bg-surface p-3.5 shadow-1">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono (5215500000000)"
          inputMode="tel"
          className="min-w-[150px] flex-1 rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="min-w-[150px] flex-1 rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
        />
        <Button type="submit" variant="brand">
          Añadir contacto
        </Button>
      </form>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o teléfono"
        aria-label="Buscar contactos"
        className="mb-4 w-full rounded-lg border border-line-strong bg-[var(--input-bg)] px-3.5 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
      />

      <div className="overflow-hidden rounded bg-surface shadow-1">
        {items.length === 0 ? (
          <EmptyState icon="👤" title={query ? 'Sin resultados' : 'Aún no tienes contactos'} description={query ? `No encontramos nada para “${query}”.` : 'Añade el primero arriba.'} />
        ) : (
          <div ref={listRef}>
            {items.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(c)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEditing(c)}
                className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-[var(--row-hover)]"
              >
                <Avatar name={c.name} phone={c.phone} seed={c.id} size={36} />
                <div>
                  <div className="text-[14.5px] font-semibold">{c.name || 'Sin nombre'}</div>
                  <div className="font-mono text-[13px] text-ink-soft">{c.phone}</div>
                </div>
                {c.notes && <div className="ml-auto max-w-[45%] truncate text-right text-[13px] italic text-ink-soft">{c.notes}</div>}
              </div>
            ))}
          </div>
        )}
        {cursor && (
          <button onClick={() => load(false)} className="block w-full border-t border-line py-2.5 text-[13px] font-semibold text-ink-soft hover:text-brand">
            Cargar más contactos
          </button>
        )}
      </div>

      <EditContactDialog contact={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => load(true)} />
    </div>
  );
}
