import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Popover } from '@/components/ui/Popover';
import type { QuickReply } from '@/lib/types';

export function QuickRepliesPopover({ onInsert }: { onInsert: (body: string) => void }): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<QuickReply[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 180 });

  async function load(): Promise<void> {
    setItems(await api<QuickReply[]>('/quick-replies'));
  }
  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api('/quick-replies', { method: 'POST', body: { title: title.trim(), body: body.trim() } });
      setTitle('');
      setBody('');
      await load();
      toast.show('Respuesta guardada');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<void> {
    await api(`/quick-replies/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <Popover
      trigger={
        <button
          type="button"
          title="Respuestas rápidas"
          aria-label="Respuestas rápidas"
          className="flex-shrink-0 rounded-full border border-line-strong bg-surface px-4 text-[17px] transition-colors hover:border-ai hover:bg-ai-tint"
        >
          ⚡
        </button>
      }
    >
      <p className="mb-2 px-1 text-[13px] text-ink-soft">Toca una para insertarla. Son compartidas por tu equipo.</p>
      <div ref={listRef} className="mb-3 max-h-[220px] space-y-2 overflow-y-auto">
        {items.length === 0 && <p className="px-1 py-2 text-center text-[13px] text-ink-faint">Aún no tienes respuestas rápidas.</p>}
        {items.map((q) => (
          <div key={q.id} className="flex items-start gap-2 rounded-lg border border-line bg-[var(--row-hover)] px-3 py-2">
            <button onClick={() => onInsert(q.body)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13.5px] font-semibold">{q.title}</div>
              <div className="truncate text-[13px] text-ink-soft">{q.body}</div>
            </button>
            <button
              onClick={() => remove(q.id)}
              aria-label="Eliminar"
              title="Eliminar"
              className="flex-shrink-0 px-1 text-[17px] leading-none text-ink-faint hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <Field>
          <Input placeholder="Título (ej. Saludo)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field>
          <Textarea rows={2} placeholder="Texto de la respuesta…" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Button type="submit" variant="brand" fullWidth loading={saving}>
          Guardar respuesta
        </Button>
      </form>
    </Popover>
  );
}
