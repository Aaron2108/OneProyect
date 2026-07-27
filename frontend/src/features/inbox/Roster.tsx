import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Download, MessageCircle, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { RosterSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Input';
import type { ConversationHandler, ConversationStatus, ConversationSummary } from '@/lib/types';

function fmt(d: string): string {
  return new Date(d).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface RosterProps {
  items: ConversationSummary[];
  loading: boolean;
  selectedId: string | null;
  hasMore: boolean;
  /** '' = sin filtrar. Tipado para que no llegue un estado que la API no conoce. */
  status: ConversationStatus | '';
  handledBy: ConversationHandler | '';
  query: string;
  onStatusChange: (v: ConversationStatus | '') => void;
  onHandledByChange: (v: ConversationHandler | '') => void;
  onQueryChange: (v: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onExport: () => void;
}

export function Roster(props: RosterProps): JSX.Element {
  const { items, loading, selectedId, hasMore, status, handledBy, query } = props;
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' });

  return (
    <div className="roster-panel">
      <div className="p-4 pb-3.5">
        <h3 className="mb-3 font-display text-[16px] font-bold tracking-tight">Conversaciones</h3>
        <div className="flex gap-2">
          <Select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => props.onStatusChange(e.target.value as ConversationStatus | '')}
            className="flex-1 !py-2 !text-[12.5px]"
          >
            <option value="">Todas</option>
            <option value="OPEN">Abiertas</option>
            <option value="CLOSED">Cerradas</option>
          </Select>
          <Select
            aria-label="Filtrar por quién atiende"
            value={handledBy}
            onChange={(e) => props.onHandledByChange(e.target.value as ConversationHandler | '')}
            className="flex-1 !py-2 !text-[12.5px]"
          >
            <option value="">IA y humano</option>
            <option value="AI">Atiende la IA</option>
            <option value="HUMAN">Atiende un humano</option>
          </Select>
        </div>
        <div className="relative mt-2.5">
          <Search size={15} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-disabled" />
          <input
            type="search"
            value={query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar conversaciones"
            className="w-full rounded-sm border border-line-strong bg-[var(--input-bg)] py-2.5 pl-9 pr-3 text-[13.5px] transition-[border-color,box-shadow] duration-fast focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
          />
        </div>
        <button
          onClick={props.onExport}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-sm border border-line-strong px-3 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors duration-fast hover:border-brand/50 hover:text-brand"
        >
          <Download size={13} strokeWidth={2} /> Exportar CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-line" aria-live="polite">
        {loading ? (
          <RosterSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={query ? 'Sin resultados' : 'Aún no hay conversaciones'}
            description={
              query
                ? `No encontramos nada para “${query}”.`
                : 'Cuando un cliente escriba a tu WhatsApp, aparecerá aquí.'
            }
          />
        ) : (
          <div ref={listRef}>
            {items.map((c) => {
              const nm = c.contact.name || c.contact.phone;
              const isUnread = c.unreadCount > 0;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => props.onSelect(c.id)}
                  // `preventDefault` en la barra espaciadora: sin él el navegador
                  // además desplaza la lista, y al abrir la conversación con
                  // teclado el listado saltaba una pantalla hacia abajo.
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    props.onSelect(c.id);
                  }}
                  className={`relative flex cursor-pointer gap-3 border-b border-line px-4 py-3.5 transition-colors duration-fast hover:bg-[var(--row-hover)] ${
                    selectedId === c.id ? 'bg-brand-tint' : ''
                  }`}
                >
                  {selectedId === c.id && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-brand" />}
                  <Avatar name={c.contact.name} phone={c.contact.phone} seed={c.contact.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[14.5px] ${isUnread ? 'font-bold' : 'font-semibold'}`}>{nm}</span>
                      <span className={`flex-shrink-0 text-[11px] ${isUnread ? 'font-semibold text-brand' : 'text-ink-disabled'}`}>
                        {c.lastMessageAt ? fmt(c.lastMessageAt) : ''}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono text-[12px] text-ink-disabled">{c.contact.phone}</span>
                      {c.status === 'CLOSED' ? <Pill kind="closed" /> : <Pill kind={c.handledBy === 'AI' ? 'ai' : 'human'} />}
                      {isUnread && (
                        <span
                          aria-label={`${c.unreadCount} sin leer`}
                          className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-on"
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {hasMore && !loading && (
          <button
            onClick={props.onLoadMore}
            className="m-3 block w-[calc(100%-24px)] rounded-sm border border-line-strong py-2.5 text-[13px] font-semibold text-ink-soft transition-colors duration-fast hover:border-brand/50 hover:text-brand"
          >
            Cargar más conversaciones
          </button>
        )}
      </div>
    </div>
  );
}
