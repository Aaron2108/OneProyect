import { useAutoAnimate } from '@formkit/auto-animate/react';
import { X, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRecurso } from '@/lib/use-recurso';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Popover } from '@/components/ui/Popover';
import type { QuickReply } from '@/lib/types';

export function QuickRepliesPopover({ onInsert }: { onInsert: (body: string) => void }): JSX.Element {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 180 });

  // Si falla, el aviso lo da el hook: antes el popover se abría vacío y parecía
  // que el equipo no tenía respuestas guardadas.
  const { datos, recargar } = useRecurso<QuickReply[]>(
    '/quick-replies',
    'No se pudieron cargar las respuestas rápidas',
  );
  const items = datos ?? [];

  async function onSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api('/quick-replies', { method: 'POST', body: { title: title.trim(), body: body.trim() } });
      // Los campos se vacían solo si la respuesta llegó a guardarse.
      setTitle('');
      setBody('');
      await recargar();
      toast.show('Respuesta guardada');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar la respuesta', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await api(`/quick-replies/${id}`, { method: 'DELETE' });
    } catch (e) {
      // Sin aviso, la respuesta seguía en la lista y parecía que el botón de
      // borrar no funcionaba.
      toast.show(e instanceof Error ? e.message : 'No se pudo eliminar la respuesta', 'error');
      return;
    }
    await recargar();
  }

  return (
    <Popover
      trigger={
        <button
          type="button"
          title="Respuestas rápidas"
          aria-label="Respuestas rápidas"
          className="grid flex-shrink-0 place-items-center rounded-full border border-line-strong bg-surface px-4 text-ai transition-colors duration-fast hover:border-ai/60 hover:bg-ai-tint"
        >
          <Zap size={16} strokeWidth={2} />
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
              className="flex-shrink-0 px-1 text-ink-faint transition-colors duration-fast hover:text-danger"
            >
              <X size={14} strokeWidth={2} />
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
