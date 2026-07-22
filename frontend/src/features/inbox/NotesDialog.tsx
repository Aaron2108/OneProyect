import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Input';
import type { ConversationNote } from '@/lib/types';

function fmt(d: string): string {
  return new Date(d).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function NotesDialog({
  open,
  onOpenChange,
  conversationId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onChanged: () => void;
}): JSX.Element {
  const toast = useToast();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });
  const listEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  async function load(): Promise<void> {
    const data = await api<ConversationNote[]>(`/conversations/${conversationId}/notes`);
    setNotes(data);
    requestAnimationFrame(() => {
      if (listEl.current) listEl.current.scrollTop = listEl.current.scrollHeight;
    });
  }

  async function add(): Promise<void> {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api(`/conversations/${conversationId}/notes`, { method: 'POST', body: { body: body.trim() } });
      setBody('');
      await load();
      onChanged();
      toast.show('Nota añadida');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Notas internas"
      description="Privadas para tu equipo — el cliente nunca las ve."
      footer={
        <>
          <Button variant="sec" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button variant="brand" onClick={add} loading={saving}>
            Añadir nota
          </Button>
        </>
      }
    >
      <div ref={listEl} className="mb-3.5 max-h-[240px] space-y-2.5 overflow-y-auto">
        {notes.length === 0 && <p className="py-2 text-center text-[13.5px] text-ink-faint">Aún no hay notas. Deja la primera para tu equipo.</p>}
        <div ref={listRef} className="space-y-2.5">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-line bg-[var(--row-hover)] px-3 py-2.5">
              <div className="mb-1 flex justify-between gap-2 text-[11.5px] text-ink-faint">
                <b className="font-semibold text-ink">{n.authorName}</b>
                <span>{fmt(n.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm">{n.body}</div>
            </div>
          ))}
        </div>
      </div>
      <Field>
        <Textarea rows={2} placeholder="Escribe una nota para tu equipo…" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
    </Dialog>
  );
}
