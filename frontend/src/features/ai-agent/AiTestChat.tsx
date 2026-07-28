import { Bot, Loader2, RotateCcw, Send, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button, Spinner } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { SimulatedTool, TestChatReply } from '@/lib/types';
import { guardarConversacion, leerConversacionGuardada, type ChatTurn } from './test-chat.util';

/** Tope de turnos que acepta la API (cada turno se paga en el prompt). */
const MAX_TURNS = 20;

/** Nombres legibles de las herramientas del agente. */
const TOOL_LABELS: Record<string, string> = {
  create_appointment: 'Agendar cita',
  create_reminder: 'Crear recordatorio',
  update_contact: 'Actualizar contacto',
};

const ARG_LABELS: Record<string, string> = {
  title: 'Motivo',
  scheduled_at: 'Fecha y hora',
  notes: 'Notas',
  message: 'Mensaje',
  remind_at: 'Fecha y hora',
  name: 'Nombre',
};

/** Muestra lo que el agente habría hecho, sin haberlo hecho. */
function SimulatedToolCard({ tool }: { tool: SimulatedTool }): JSX.Element {
  return (
    <div className="mt-2 w-full rounded-sm border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
        <Wrench size={13} strokeWidth={2.25} className="text-brand" />
        {TOOL_LABELS[tool.name] ?? tool.name}
        <span className="font-normal text-ink-faint">— simulado, no se guardó</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
        {Object.entries(tool.input).map(([clave, valor]) => (
          <div key={clave} className="contents">
            <dt className="text-ink-faint">{ARG_LABELS[clave] ?? clave}</dt>
            <dd className="font-mono text-ink-soft">{String(valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Chat de prueba con el agente, desde el panel y sin WhatsApp.
 *
 * Existe porque el agente solo responde a mensajes entrantes de WhatsApp: sin
 * esto, el dueño no tiene forma de comprobar cómo contesta antes de exponerlo a
 * sus clientes. Las herramientas se simulan, así que probar no ensucia la agenda
 * del negocio con citas que nadie pidió.
 */
export function AiTestChat({ isOwner }: { isOwner: boolean }): JSX.Element {
  const toast = useToast();
  const [turns, setTurns] = useState<ChatTurn[]>(leerConversacionGuardada);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns, sending]);

  /** Estado y almacenamiento van juntos: un solo sitio donde cambian los turnos. */
  function actualizarTurnos(siguientes: ChatTurn[]): void {
    setTurns(siguientes);
    guardarConversacion(siguientes);
  }

  async function send(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const conHistorial = [...turns, { role: 'user' as const, text }];
    actualizarTurnos(conHistorial);
    setDraft('');
    setSending(true);
    try {
      // Se reenvía el historial completo (recortado al tope): así el agente
      // mantiene el hilo, igual que en una conversación real de WhatsApp.
      const reply = await api<TestChatReply>('/ai-context/test-chat', {
        method: 'POST',
        body: {
          messages: conHistorial
            .slice(-MAX_TURNS)
            .map((t) => ({ role: t.role, text: t.text })),
        },
      });
      actualizarTurnos([
        ...conHistorial,
        { role: 'assistant', text: reply.text, simulatedTools: reply.simulatedTools },
      ]);
    } catch (e) {
      // El turno del usuario se conserva para que pueda reintentar sin reescribir.
      toast.show(e instanceof Error ? e.message : 'El agente no pudo responder', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="kpi-card">
      <div className="sec-head flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="sec-head__eyebrow">Pruebas</span>
          <h3 className="sec-head__title flex items-center gap-2 font-display">
            <Bot size={18} strokeWidth={2} className="text-ai" /> Probar el agente
          </h3>
        </div>
        {turns.length > 0 && (
          <Button size="sm" variant="sec" disabled={sending} onClick={() => actualizarTurnos([])}>
            <RotateCcw size={15} strokeWidth={2.25} /> Limpiar conversación
          </Button>
        )}
      </div>
      <p className="mb-4 max-w-[80ch] text-[13px] text-ink-soft">
        Conversa con tu agente como si fueras un cliente. Usa el mismo contexto y las mismas
        herramientas que por WhatsApp, pero <b>no agenda nada de verdad</b>: si decide crear una
        cita, te muestra cuál habría creado.
        {!isOwner && ' Solo el propietario puede usarlo.'}
      </p>

      {/* La sección ocupa todo el ancho, pero la conversación no.
          A 1440px una burbuja al 85% da líneas de más de mil píxeles, que no
          hay quien lea; el ojo pierde el renglón al volver. La columna se
          centra y se corta a 860px —igual que hace cualquier chat— y lo que
          gana de ancho la sección es aire a los lados, no texto más largo. */}
      <div className="mx-auto max-w-[860px]">
        <div className="mb-3 flex min-h-[280px] max-h-[52vh] flex-col overflow-y-auto rounded-sm border border-line bg-canvas p-4">
          {turns.length === 0 && !sending && (
            <p className="m-auto max-w-[42ch] text-center text-[13px] text-ink-faint">
              {/* «turno» es cita en el resto del panel: el ejemplo enseñaba una
                  palabra que la interfaz no usa en ningún otro sitio. */}
              Escribe un mensaje para empezar. Ej: “¿tienen cita el viernes por la mañana?”
            </p>
          )}
          {/* Misma disposición que la bandeja: el cliente a la izquierda, la IA a
              la derecha, para que el dueño reconozca lo que está viendo. */}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={`mb-3 flex flex-col ${turn.role === 'user' ? 'items-start' : 'items-end'}`}
            >
              <span className="mx-1 mb-1 text-[10.5px] text-ink-disabled">
                {turn.role === 'user' ? 'Cliente (tú)' : 'Agente IA'}
              </span>
              <div
                className={`bubble max-w-[85%] ${turn.role === 'user' ? 'bubble--in' : 'bubble--ai'}`}
              >
                {turn.text}
              </div>
              {turn.simulatedTools?.map((tool, j) => <SimulatedToolCard key={j} tool={tool} />)}
            </div>
          ))}
          {sending && (
            <p className="flex items-center gap-2 py-2 text-[12.5px] text-ink-faint">
              <Loader2 size={14} strokeWidth={2.25} className="animate-spin" /> El agente está
              pensando…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form className="flex items-center gap-2" onSubmit={send}>
          <div className="min-w-0 flex-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe como si fueras un cliente"
              aria-label="Mensaje de prueba"
              maxLength={2000}
              disabled={!isOwner || sending}
              className="!rounded-full"
            />
          </div>
          <Button
            type="submit"
            disabled={!isOwner || sending || !draft.trim()}
            className="!rounded-full !px-5"
          >
            {sending ? <Spinner /> : <Send size={15} strokeWidth={2.25} />}
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
