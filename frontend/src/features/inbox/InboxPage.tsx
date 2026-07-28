import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '@/lib/api';
import { esConversationDetail } from '@/lib/guards';
import { useToast } from '@/lib/toast-context';
import { useListaPaginada } from '@/lib/use-recurso';
import type { ConversationDetail, ConversationStatus, ConversationHandler, ConversationSummary } from '@/lib/types';
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
  // '' es "sin filtrar". Tipados así, el compilador no deja pasar un valor que
  // el backend no entienda: antes eran `string` y `setStatus('OPENN')` habría
  // compilado y devuelto una lista vacía sin explicación.
  const [status, setStatus] = useState<ConversationStatus | ''>('');
  const [handledBy, setHandledBy] = useState<ConversationHandler | ''>('');
  const [query, setQuery] = useState('');
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [mobileViewingThread, setMobileViewingThread] = useState(false);

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (handledBy) qs.set('handledBy', handledBy);
  if (query.trim()) qs.set('q', query.trim());

  // La ruta lleva los filtros; del rebote, la cancelación, el cursor y el aviso
  // de error se encarga el hook, que es donde vive ahora ese mecanismo.
  const ruta = `/conversations?${qs.toString()}`;
  const {
    items,
    setItems,
    cursor,
    cargando,
    error,
    cargarMas,
    recargar,
  } = useListaPaginada<ConversationSummary>(ruta, 'No se pudieron cargar las conversaciones');

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
        const c = await api<unknown>(`/conversations/${selectedId}`);
        if (cancelado) return;
        // Se comprueba la forma antes de pintarla: sin esto, una respuesta
        // inesperada reventaba dentro del render del hilo.
        if (!esConversationDetail(c)) throw new Error('La conversación llegó incompleta');
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
      const c = await api<unknown>(`/conversations/${selectedId}`);
      if (!esConversationDetail(c)) throw new Error('La conversación llegó incompleta');
      setConversation(c);
    } catch (e) {
      // No se relanza: quien llama ya hizo su trabajo (enviar, cerrar, anotar) y
      // que falle el refresco no significa que aquello fallara.
      toast.show(e instanceof Error ? e.message : 'No se pudo actualizar la conversación', 'error');
      return;
    }
    void recargar();
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
        loading={cargando && items.length === 0}
        selectedId={selectedId}
        hasMore={!!cursor}
        status={status}
        handledBy={handledBy}
        query={query}
        error={error}
        onRetry={() => void recargar()}
        onStatusChange={setStatus}
        onHandledByChange={setHandledBy}
        onQueryChange={setQuery}
        onSelect={openConversation}
        onLoadMore={() => void cargarMas()}
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
