import { Bot, Loader2, RotateCcw, Send, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { SimulatedTool, TestChatReply } from '@/lib/types';

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

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  simulatedTools?: SimulatedTool[];
}

/**
 * La conversación de prueba se guarda en `sessionStorage`.
 *
 * Hace falta porque cada sección es una ruta y salir de "Agente IA" desmonta
 * esta pantalla: sin esto, ir a Productos y volver borraba lo conversado.
 * `sessionStorage` y no `localStorage` a propósito — es una prueba, no algo que
 * deba seguir ahí mañana: vive mientras la pestaña esté abierta.
 *
 * La clave lleva versión: si algún día cambia la forma de un turno, lo viejo se
 * descarta solo en vez de reventar al leerlo.
 */
const CLAVE_CHAT = 'whatsflow:test-chat:v1';

function leerConversacionGuardada(): ChatTurn[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE_CHAT);
    if (!crudo) return [];
    const turnos: unknown = JSON.parse(crudo);
    if (!Array.isArray(turnos)) return [];
    // Se valida la forma antes de confiar: lo que hay en el almacenamiento lo
    // pudo escribir una versión anterior de la aplicación.
    return turnos.filter(
      (t): t is ChatTurn =>
        !!t && typeof t === 'object' && typeof (t as ChatTurn).text === 'string',
    );
  } catch {
    return [];
  }
}

function guardarConversacion(turnos: ChatTurn[]): void {
  try {
    if (turnos.length === 0) sessionStorage.removeItem(CLAVE_CHAT);
    else sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(turnos));
  } catch {
    // Sin espacio o con el almacenamiento bloqueado: el chat sigue funcionando
    // en memoria, solo que no sobrevive al cambio de sección. No vale romper la
    // pantalla por esto.
  }
}

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
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-[15.5px] font-bold tracking-tight">
          <Bot size={17} strokeWidth={2} className="text-ai" /> Probar el agente
        </h3>
        {turns.length > 0 && (
          <Button size="sm" variant="sec" disabled={sending} onClick={() => actualizarTurnos([])}>
            <RotateCcw size={15} strokeWidth={2.25} /> Empezar de nuevo
          </Button>
        )}
      </div>
      <p className="mb-4 text-[13px] text-ink-soft">
        Conversá con tu agente como si fueras un cliente. Usa el mismo contexto y las mismas
        herramientas que por WhatsApp, pero <b>no agenda nada de verdad</b>: si decide crear una
        cita, te muestra cuál habría creado.
        {!isOwner && ' Solo el propietario puede usarlo.'}
      </p>

      <div className="mb-3 max-h-[420px] overflow-y-auto rounded-sm bg-canvas p-3">
        {turns.length === 0 && !sending && (
          <p className="py-8 text-center text-[13px] text-ink-faint">
            Escribí un mensaje para empezar. Ej: “¿tienen turno el viernes a la mañana?”
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
              {turn.role === 'user' ? 'Cliente (vos)' : 'Agente IA'}
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

      <form className="flex flex-wrap gap-2" onSubmit={send}>
        <div className="min-w-[220px] flex-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribí como si fueras un cliente…"
            maxLength={2000}
            disabled={!isOwner || sending}
          />
        </div>
        <Button size="sm" type="submit" disabled={!isOwner || sending || !draft.trim()}>
          <Send size={15} strokeWidth={2.25} /> Enviar
        </Button>
      </form>
    </div>
  );
}
