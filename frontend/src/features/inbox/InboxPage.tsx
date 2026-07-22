import { useCallback, useEffect, useRef, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { ConversationDetail, ConversationStatus, ConversationHandler, Page, ConversationSummary } from '@/lib/types';
import { Roster } from './Roster';
import { Thread } from './Thread';

export function InboxPage({ active }: { active: boolean }): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [handledBy, setHandledBy] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [mobileViewingThread, setMobileViewingThread] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(reset && items.length === 0);
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (handledBy) qs.set('handledBy', handledBy);
      if (query.trim()) qs.set('q', query.trim());
      if (!reset && cursor) qs.set('cursor', cursor);
      try {
        const res = await api<Page<ConversationSummary>>(`/conversations?${qs.toString()}`);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, handledBy, query],
  );

  // Carga inicial + recarga al cambiar filtros (con debounce en la búsqueda).
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
  }, [active, status, handledBy, query]);

  async function openConversation(id: string): Promise<void> {
    setSelectedId(id);
    setMobileViewingThread(true);
    const c = await api<ConversationDetail>(`/conversations/${id}`);
    setConversation(c);
    if (c.unreadCount > 0) {
      api(`/conversations/${id}/read`, { method: 'POST' })
        .then(() => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, unreadCount: 0 } : x))))
        .catch(() => {});
    }
  }

  async function refreshConversation(): Promise<void> {
    if (!selectedId) return;
    setConversation(await api<ConversationDetail>(`/conversations/${selectedId}`));
    void load(true);
  }

  async function sendMessage(text: string): Promise<void> {
    if (!selectedId) return;
    await api(`/conversations/${selectedId}/messages`, { method: 'POST', body: { text } });
    toast.show('Mensaje enviado');
    await refreshConversation();
  }

  async function act(path: string, message: string, kind?: 'ai'): Promise<void> {
    if (!selectedId) return;
    await api(`/conversations/${selectedId}${path}`, { method: 'POST' });
    toast.show(message, kind);
    await refreshConversation();
  }

  return (
    <div className={`inbox-layout ${mobileViewingThread ? 'is-viewing-thread' : ''}`}>
      <Roster
        items={items}
        loading={loading}
        selectedId={selectedId}
        hasMore={!!cursor}
        status={status}
        handledBy={handledBy}
        query={query}
        onStatusChange={setStatus}
        onHandledByChange={setHandledBy}
        onQueryChange={setQuery}
        onSelect={openConversation}
        onLoadMore={() => load(false)}
        onExport={() => downloadFile('/conversations/export', 'conversaciones.csv').catch((e) => toast.show(e.message, 'error'))}
      />
      <Thread
        conversation={conversation}
        onBack={() => setMobileViewingThread(false)}
        onSend={sendMessage}
        onHandoff={() => act('/handoff', 'Tomaste la conversación')}
        onHandback={() => act('/handback', 'Devuelto a la IA', 'ai')}
        onClose={() => act('/close', 'Conversación cerrada')}
        onReopen={() => act('/reopen', 'Conversación reabierta')}
        onNotesChanged={refreshConversation}
      />
    </div>
  );
}

export type { ConversationStatus, ConversationHandler };
