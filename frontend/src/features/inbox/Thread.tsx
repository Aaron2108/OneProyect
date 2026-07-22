import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Pill } from '@/components/ui/Pill';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ConversationDetail, Message } from '@/lib/types';
import { Composer } from './Composer';
import { NotesDialog } from './NotesDialog';

function timeShort(d: string): string {
  return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

interface ThreadProps {
  conversation: ConversationDetail | null;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onHandoff: () => Promise<void>;
  onHandback: () => Promise<void>;
  onClose: () => Promise<void>;
  onReopen: () => Promise<void>;
  onNotesChanged: () => void;
}

function Turn({ m, contactName, index }: { m: Message; contactName: string | null; index: number }): JSX.Element {
  const inbound = m.direction === 'INBOUND';
  const kind = inbound ? 'inbound' : m.sender === 'AI' ? 'ai' : 'human';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`mt-2.5 flex max-w-[74%] flex-col ${inbound ? 'items-start self-start' : 'items-end self-end'}`}
    >
      <span className="mb-1 mx-1 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
        {kind === 'ai' && (
          <span className="grid h-3.5 w-3.5 place-items-center rounded text-[8px] font-extrabold text-white" style={{ background: 'var(--ai)' }}>
            ◆
          </span>
        )}
        {kind === 'human' && (
          <span className="grid h-3.5 w-3.5 place-items-center rounded text-[8px] font-extrabold text-white" style={{ background: 'var(--brand)' }}>
            ✓
          </span>
        )}
        {kind === 'ai' ? 'IA' : kind === 'human' ? 'Agente' : contactName || 'Cliente'}
      </span>
      <div className={`bubble bubble--${kind === 'inbound' ? 'in' : kind} ${kind === 'ai' && index === -1 ? 'is-new' : ''}`}>
        {m.content}
      </div>
      <span className="mx-1 mt-1 text-[10.5px] text-ink-faint">{timeShort(m.createdAt)}</span>
    </motion.div>
  );
}

export function Thread(props: ThreadProps): JSX.Element {
  const { conversation: c } = props;
  const [notesOpen, setNotesOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [c?.messages.length]);

  if (!c) {
    return (
      <div className="thread-panel thread-canvas">
        <div className="m-auto">
          <EmptyState icon="💬" title="Elige una conversación" description="Selecciona un chat de la izquierda para ver el hilo y responder." />
        </div>
      </div>
    );
  }

  const closed = c.status === 'CLOSED';
  const isHuman = c.handledBy === 'HUMAN';

  return (
    <div className="thread-panel thread-canvas">
      <div className="thread-head flex flex-shrink-0 items-center gap-3 px-4 py-2.5">
        <button className="back-btn" onClick={props.onBack} aria-label="Volver a la lista">
          ‹
        </button>
        <div>
          <div className="text-[15.5px] font-bold">{c.contact.name || c.contact.phone}</div>
          <div className="font-mono text-xs text-ink-faint">{c.contact.phone}</div>
        </div>
        <div className="flex-1" />
        <AnimatePresence mode="wait">
          <motion.span
            key={closed ? 'closed' : c.handledBy}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            <Pill kind={closed ? 'closed' : c.handledBy === 'AI' ? 'ai' : 'human'} />
          </motion.span>
        </AnimatePresence>
        <button
          onClick={() => setNotesOpen(true)}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-brand hover:text-brand"
        >
          Notas{c._count.notes ? ` (${c._count.notes})` : ''}
        </button>
        {isHuman ? (
          <button onClick={props.onHandback} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-ai hover:text-ai">
            Devolver a la IA
          </button>
        ) : (
          <button onClick={props.onHandoff} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-brand hover:text-brand">
            Tomar la conversación
          </button>
        )}
        {closed ? (
          <button onClick={props.onReopen} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-brand hover:text-brand">
            Reabrir
          </button>
        ) : (
          <button onClick={props.onClose} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-brand hover:text-brand">
            Cerrar
          </button>
        )}
      </div>

      <div ref={streamRef} className="flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-10" aria-live="polite">
        {c.messages.map((m, i) => (
          <Turn key={m.id} m={m} contactName={c.contact.name} index={i} />
        ))}
      </div>

      {closed ? (
        <div className="composer-bar flex-shrink-0 px-4 py-4 text-center text-[13.5px] text-ink-faint">
          Esta conversación está cerrada. Reábrela para responder.
        </div>
      ) : (
        <Composer onSend={props.onSend} />
      )}

      <NotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        conversationId={c.id}
        onChanged={props.onNotesChanged}
      />
    </div>
  );
}
