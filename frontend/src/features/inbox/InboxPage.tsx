import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile, esCancelacion } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { ConversationDetail, ConversationStatus, ConversationHandler, Page, ConversationSummary } from '@/lib/types';
import { ContactPanel } from './ContactPanel';
import { Roster } from './Roster';
import { Thread } from './Thread';

export function InboxPage(): JSX.Element {
  const toast = useToast();
  // La conversación abierta vive en la URL, no en un estado aparte: así se
  // puede enlazar una conversación concreta, el botón "atrás" cierra el hilo y
  // recargar la página no te devuelve a la lista vacía.
  const { conversationId: selectedId = null } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // '' es "sin filtrar". Tipados así, el compilador no deja pasar un valor que
  // el backend no entienda: antes eran `string` y `setStatus('OPENN')` habría
  // compilado y devuelto una lista vacía sin explicación.
  const [status, setStatus] = useState<ConversationStatus | ''>('');
  const [handledBy, setHandledBy] = useState<ConversationHandler | ''>('');
  const [query, setQuery] = useState('');
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [mobileViewingThread, setMobileViewingThread] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const loadedOnce = useRef(false);

  // Función normal y no `useCallback`: memorizarla con los filtros como
  // dependencias congelaba el `cursor` del primer render, así que "Cargar más"
  // volvía a pedir la primera página y la añadía repetida al final de la lista.
  // Recreada en cada render siempre lee el cursor vigente — igual que en
  // ContactsPage.
  async function load(reset: boolean, signal?: AbortSignal): Promise<void> {
    setLoading(reset && items.length === 0);
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (handledBy) qs.set('handledBy', handledBy);
    if (query.trim()) qs.set('q', query.trim());
    if (!reset && cursor) qs.set('cursor', cursor);
    try {
      const res = await api<Page<ConversationSummary>>(`/conversations?${qs.toString()}`, { signal });
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (e) {
      // Cancelada porque cambió el filtro o se salió de la pantalla: no hay nada
      // que contar, y su respuesta ya no debe tocar la lista.
      if (esCancelacion(e)) return;
      // Sin esto la lista se quedaba como estaba, sin decir nada: parecía que
      // el negocio no tenía conversaciones nuevas cuando lo que había caído era
      // la petición.
      toast.show(e instanceof Error ? e.message : 'No se pudieron cargar las conversaciones', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Carga inicial + recarga al cambiar filtros (con debounce en la búsqueda).
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
  }, [status, handledBy, query]);

  function openConversation(id: string): void {
    setMobileViewingThread(true);
    navigate(`/bandeja/${id}`);
  }

  // Trae el hilo de la conversación que indique la URL. Vale tanto al hacer
  // clic como al entrar directamente por el enlace o darle a "atrás".
  useEffect(() => {
    if (!selectedId) {
      setConversation(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const c = await api<ConversationDetail>(`/conversations/${selectedId}`);
        if (cancelado) return;
        setConversation(c);
        if (c.unreadCount > 0) {
          await api(`/conversations/${selectedId}/read`, { method: 'POST' });
          if (cancelado) return;
          setItems((prev) => prev.map((x) => (x.id === selectedId ? { ...x, unreadCount: 0 } : x)));
        }
      } catch (e) {
        if (!cancelado) toast.show(e instanceof Error ? e.message : 'No se pudo abrir la conversación', 'error');
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function refreshConversation(): Promise<void> {
    if (!selectedId) return;
    try {
      setConversation(await api<ConversationDetail>(`/conversations/${selectedId}`));
    } catch (e) {
      // No se relanza: quien llama ya hizo su trabajo (enviar, cerrar, anotar) y
      // que falle el refresco no significa que aquello fallara.
      toast.show(e instanceof Error ? e.message : 'No se pudo actualizar la conversación', 'error');
      return;
    }
    void load(true);
  }

  async function sendMessage(text: string): Promise<void> {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/messages`, { method: 'POST', body: { text } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo enviar el mensaje', 'error');
      // Se relanza para que el Composer conserve el texto y se pueda reintentar.
      throw e;
    }
    toast.show('Mensaje enviado');
    await refreshConversation();
  }

  async function act(path: string, message: string, kind?: 'ai'): Promise<void> {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}${path}`, { method: 'POST' });
    } catch (e) {
      // Antes el botón no daba señal alguna: la conversación seguía como estaba
      // y parecía que el clic no había llegado a registrarse.
      toast.show(e instanceof Error ? e.message : 'No se pudo completar la acción', 'error');
      return;
    }
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
        onBack={() => {
          setMobileViewingThread(false);
          navigate('/bandeja');
        }}
        onSend={sendMessage}
        onHandoff={() => act('/handoff', 'Tomaste la conversación')}
        onHandback={() => act('/handback', 'Devuelto a la IA', 'ai')}
        onClose={() => act('/close', 'Conversación cerrada')}
        onReopen={() => act('/reopen', 'Conversación reabierta')}
        onNotesChanged={refreshConversation}
      />
      <ContactPanel conversation={conversation} onChanged={refreshConversation} />
    </div>
  );
}

export type { ConversationStatus, ConversationHandler };
