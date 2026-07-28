import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Check, ChevronLeft, CircleCheck, MessageCircle, RotateCcw, ScrollText, StickyNote, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Pill } from '@/components/ui/Pill';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { ConversationDetail, ConversationSummaryResult, Message } from '@/lib/types';
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

/**
 * Peso visual de los botones de la cabecera.
 *
 * Eran los cinco iguales, con lo que nada distinguía «Resumir» —una utilidad,
 * sin consecuencia— de tomar la conversación, que es lo único ahí arriba que
 * cambia quién le responde al cliente. El tono va con el significado: verde
 * cuando pasa a atender una persona, índigo cuando vuelve a la IA.
 */
type TonoBoton = 'quiet' | 'brand' | 'ai';

const TONO_BOTON: Record<TonoBoton, string> = {
  quiet: 'border-line-strong text-ink-soft hover:border-brand/50 hover:text-brand',
  brand: 'border-brand/45 bg-brand-tint text-brand hover:border-brand',
  ai: 'border-ai/45 bg-ai-tint text-ai hover:border-ai',
};

const HeadBtn = ({
  onClick,
  children,
  disabled,
  tono = 'quiet',
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tono?: TonoBoton;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    // `flex-shrink-0`: sin él, al estrecharse el hilo los botones se comprimían
    // por debajo de su texto y las etiquetas se partían en dos líneas
    // desiguales. Lo que tiene que ceder es el nombre del contacto, no los
    // controles.
    className={`flex flex-shrink-0 items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px] font-semibold transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50 ${TONO_BOTON[tono]}`}
  >
    {children}
  </button>
);

type Voz = 'in' | 'ai' | 'human';

function vozDe(m: Message): Voz {
  if (m.direction === 'INBOUND') return 'in';
  return m.sender === 'AI' ? 'ai' : 'human';
}

/** Más de este hueco entre dos mensajes y dejan de ser la misma intervención. */
const AGRUPACION_MS = 10 * 60 * 1000;

function mismaTanda(a: Message, b: Message): boolean {
  return (
    vozDe(a) === vozDe(b) &&
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < AGRUPACION_MS
  );
}

/**
 * Un mensaje del hilo.
 *
 * `abre` y `cierra` dicen si es el primero y/o el último de una tanda de la
 * misma voz. Antes no existían: cada burbuja llevaba encima quién hablaba y
 * debajo la hora, así que un hilo de treinta mensajes traía sesenta líneas de
 * letra pequeña intercaladas y costaba seguir dónde acababa de contestar la IA
 * y dónde había entrado una persona. Ahora la etiqueta sale al empezar la
 * tanda, la hora al cerrarla, y el pico de la burbuja solo lo lleva la última
 * —que es lo que hace que un grupo se lea como un grupo.
 */
function Turn({
  m,
  contactName,
  index,
  abre,
  cierra,
}: {
  m: Message;
  contactName: string | null;
  index: number;
  abre: boolean;
  cierra: boolean;
}): JSX.Element {
  const voz = vozDe(m);
  const inbound = voz === 'in';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`flex max-w-[74%] flex-col ${abre ? 'mt-4' : 'mt-0.5'} ${
        inbound ? 'items-start self-start' : 'items-end self-end'
      }`}
    >
      {abre && (
        <span className="mb-1 mx-1 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-disabled">
          {voz === 'ai' && (
            <span className="grid h-3.5 w-3.5 place-items-center rounded text-ai-on" style={{ background: 'var(--ai)' }}>
              <Bot size={9} strokeWidth={2.5} />
            </span>
          )}
          {voz === 'human' && (
            <span className="grid h-3.5 w-3.5 place-items-center rounded text-brand-on" style={{ background: 'var(--brand)' }}>
              <Check size={9} strokeWidth={3} />
            </span>
          )}
          {voz === 'ai' ? 'IA' : voz === 'human' ? 'Agente' : contactName || 'Cliente'}
        </span>
      )}
      <div className={`bubble bubble--${voz} ${cierra ? '' : 'is-continua'}`}>{m.content}</div>
      {cierra && <span className="mx-1 mt-1 text-[10.5px] text-ink-disabled">{timeShort(m.createdAt)}</span>}
    </motion.div>
  );
}

export function Thread(props: ThreadProps): JSX.Element {
  const { conversation: c } = props;
  const toast = useToast();
  const [notesOpen, setNotesOpen] = useState(false);
  // Guarda SOLO el resumen recién generado; el resto sale de la conversación.
  // Antes se copiaba el de props a estado en un efecto, y bastaba con que el
  // padre recargara el hilo para que el resumen que acabas de pedir
  // desapareciera de la pantalla.
  const [generado, setGenerado] = useState<ConversationSummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Al cambiar de conversación se descarta: dejarlo puesto mostraría el resumen
  // de un cliente sobre el hilo de otro.
  useEffect(() => {
    setGenerado(null);
  }, [c?.id]);

  const summary: ConversationSummaryResult | null =
    generado ??
    (c ? { summary: c.summary, summaryAt: c.summaryAt, summaryStale: c.summaryStale } : null);

  async function generarResumen(force: boolean): Promise<void> {
    if (!c) return;
    setSummarizing(true);
    try {
      setGenerado(
        await api<ConversationSummaryResult>(
          `/conversations/${c.id}/summary${force ? '?force=true' : ''}`,
          { method: 'POST' },
        ),
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo generar el resumen', 'error');
    } finally {
      setSummarizing(false);
    }
  }
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [c?.messages.length]);

  if (!c) {
    return (
      <div className="thread-panel thread-canvas">
        <div className="m-auto">
          <EmptyState icon={MessageCircle} title="Elige una conversación" description="Selecciona un chat de la izquierda para ver el hilo y responder." />
        </div>
      </div>
    );
  }

  const closed = c.status === 'CLOSED';
  const isHuman = c.handledBy === 'HUMAN';

  return (
    <div className="thread-panel thread-canvas">
      {/* Quién es y cómo está, juntos a la izquierda; lo que se puede hacer,
          agrupado a la derecha. Antes la etiqueta de estado iba pegada a los
          botones, entre el sujeto y sus verbos, y a media anchura no había
          forma de saber si «IA» describía la conversación o el botón de al
          lado. `flex-wrap` es la salida cuando el hilo se estrecha: las
          acciones bajan a una segunda línea enteras, en vez de deformarse. */}
      <div className="thread-head flex flex-shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-3">
        <button className="back-btn" onClick={props.onBack} aria-label="Volver a la lista">
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <div className="truncate text-[15.5px] font-bold">{c.contact.name || c.contact.phone}</div>
            <div className="font-mono text-xs text-ink-disabled">{c.contact.phone}</div>
          </div>
          <AnimatePresence mode="wait">
            <motion.span
              key={closed ? 'closed' : c.handledBy}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="flex-shrink-0"
            >
              <Pill kind={closed ? 'closed' : c.handledBy === 'AI' ? 'ai' : 'human'} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <HeadBtn onClick={() => void generarResumen(!!summary?.summary)} disabled={summarizing}>
            <ScrollText size={14} strokeWidth={2} />
            {summarizing ? 'Resumiendo…' : summary?.summary ? 'Rehacer resumen' : 'Resumir'}
          </HeadBtn>
          <HeadBtn onClick={() => setNotesOpen(true)}>
            <StickyNote size={14} strokeWidth={2} /> Notas{c._count.notes ? ` (${c._count.notes})` : ''}
          </HeadBtn>
          {isHuman ? (
            <HeadBtn onClick={props.onHandback} tono="ai">
              <Bot size={14} strokeWidth={2} /> Devolver a la IA
            </HeadBtn>
          ) : (
            <HeadBtn onClick={props.onHandoff} tono="brand">
              <UserRound size={14} strokeWidth={2} /> Tomar la conversación
            </HeadBtn>
          )}
          {closed ? (
            <HeadBtn onClick={props.onReopen}>
              <RotateCcw size={14} strokeWidth={2} /> Reabrir
            </HeadBtn>
          ) : (
            <HeadBtn onClick={props.onClose}>
              <CircleCheck size={14} strokeWidth={2} /> Cerrar
            </HeadBtn>
          )}
        </div>
      </div>

      {summary?.summary && (
        <div className="flex-shrink-0 border-b border-line px-4 py-3 sm:px-10">
          <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-ink-soft">
            <ScrollText size={13} strokeWidth={2} className="text-ai" />
            Resumen
            {/* Sin este aviso, el equipo actuaría sobre lo que decía la
                conversación antes de los últimos mensajes. */}
            {summary.summaryStale && (
              <span className="font-normal text-warn">· hay mensajes nuevos sin incluir</span>
            )}
          </div>
          <p className="m-0 text-[13.5px] leading-relaxed text-ink-soft">{summary.summary}</p>
        </div>
      )}

      <div ref={streamRef} className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-10" aria-live="polite">
        {c.messages.map((m, i) => {
          const anterior = c.messages[i - 1];
          const siguiente = c.messages[i + 1];
          return (
            <Turn
              key={m.id}
              m={m}
              contactName={c.contact.name}
              index={i}
              abre={!anterior || !mismaTanda(anterior, m)}
              cierra={!siguiente || !mismaTanda(m, siguiente)}
            />
          );
        })}
      </div>

      {closed ? (
        <div className="composer-bar flex-shrink-0 px-4 py-4 text-center text-[13.5px] text-ink-disabled">
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
