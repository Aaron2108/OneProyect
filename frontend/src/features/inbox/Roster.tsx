import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { RosterSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ConversationSummary } from '@/lib/types';

function fmt(d: string): string {
  return new Date(d).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface RosterProps {
  items: ConversationSummary[];
  loading: boolean;
  selectedId: string | null;
  hasMore: boolean;
  status: string;
  handledBy: string;
  query: string;
  onStatusChange: (v: string) => void;
  onHandledByChange: (v: string) => void;
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
      <div className="p-4 pb-3">
        <h3 className="mb-2.5 font-display text-[17px] font-bold tracking-tight">Conversaciones</h3>
        <div className="flex gap-1.5">
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => props.onStatusChange(e.target.value)}
            className="flex-1 rounded-lg border border-line-strong bg-[var(--input-bg)] px-2.5 py-1.5 text-[13px] text-ink-soft"
          >
            <option value="">Todas</option>
            <option value="OPEN">Abiertas</option>
            <option value="CLOSED">Cerradas</option>
          </select>
          <select
            aria-label="Filtrar por quién atiende"
            value={handledBy}
            onChange={(e) => props.onHandledByChange(e.target.value)}
            className="flex-1 rounded-lg border border-line-strong bg-[var(--input-bg)] px-2.5 py-1.5 text-[13px] text-ink-soft"
          >
            <option value="">IA y humano</option>
            <option value="AI">Atiende la IA</option>
            <option value="HUMAN">Atiende un humano</option>
          </select>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar conversaciones"
          className="mt-2.5 w-full rounded-lg border border-line-strong bg-[var(--input-bg)] bg-no-repeat px-3 py-2 pl-8 text-[13.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%23606c64' stroke-width='2.2'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E\")",
            backgroundPosition: '10px center',
          }}
        />
        <button
          onClick={props.onExport}
          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" aria-live="polite">
        {loading ? (
          <RosterSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon="💬"
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
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && props.onSelect(c.id)}
                  className={`relative flex cursor-pointer gap-2.5 border-b border-line px-4 py-3 transition-colors hover:bg-[var(--row-hover)] ${
                    selectedId === c.id ? 'bg-brand-tint' : ''
                  }`}
                >
                  {selectedId === c.id && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
                  <Avatar name={c.contact.name} phone={c.contact.phone} seed={c.contact.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[14.5px] ${isUnread ? 'font-bold' : 'font-semibold'}`}>{nm}</span>
                      <span className={`flex-shrink-0 text-[11px] ${isUnread ? 'font-semibold text-brand' : 'text-ink-faint'}`}>
                        {c.lastMessageAt ? fmt(c.lastMessageAt) : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono text-[12px] text-ink-faint">{c.contact.phone}</span>
                      {c.status === 'CLOSED' ? <Pill kind="closed" /> : <Pill kind={c.handledBy === 'AI' ? 'ai' : 'human'} />}
                      {isUnread && (
                        <span
                          aria-label={`${c.unreadCount} sin leer`}
                          className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white shadow-[0_1px_3px_rgba(15,107,82,.4)]"
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
            className="m-3 block w-[calc(100%-24px)] rounded-lg border border-line-strong bg-surface py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            Cargar más conversaciones
          </button>
        )}
      </div>
    </div>
  );
}
