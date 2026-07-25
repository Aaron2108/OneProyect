import { CalendarDays, NotebookPen, PencilLine, Radio } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { EditContactDialog } from '@/features/contacts/EditContactDialog';
import type { ConversationDetail } from '@/lib/types';
import { NotesDialog } from './NotesDialog';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ContactPanel({
  conversation,
  onChanged,
}: {
  conversation: ConversationDetail | null;
  onChanged: () => void;
}): JSX.Element | null {
  const [editOpen, setEditOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  if (!conversation) return null;
  const { contact } = conversation;
  const lastActivity = conversation.lastMessageAt ?? conversation.lastInboundAt;

  return (
    <div className="contact-panel">
      <div className="flex flex-col items-center gap-3 border-b border-line px-5 py-7 text-center">
        <Avatar name={contact.name} phone={contact.phone} seed={contact.id} size={64} />
        <div>
          <div className="text-[15px] font-bold">{contact.name || 'Sin nombre'}</div>
          <div className="mt-0.5 font-mono text-[13px] text-ink-soft">{contact.phone}</div>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors duration-fast hover:border-brand/50 hover:text-brand"
        >
          <PencilLine size={12.5} strokeWidth={2} /> Editar contacto
        </button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">Detalles</div>
          <div className="flex flex-col gap-2.5 text-[13.5px]">
            <div className="flex items-center gap-2.5 text-ink-soft">
              <CalendarDays size={15} strokeWidth={2} className="flex-shrink-0 text-ink-disabled" />
              Cliente desde {fmtDate(contact.createdAt)}
            </div>
            {lastActivity && (
              <div className="flex items-center gap-2.5 text-ink-soft">
                <Radio size={15} strokeWidth={2} className="flex-shrink-0 text-ink-disabled" />
                Última actividad {fmtDateTime(lastActivity)}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-disabled">Notas del contacto</span>
          </div>
          {contact.notes ? (
            <p className="whitespace-pre-wrap rounded-sm border border-line bg-[var(--row-hover)] px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
              {contact.notes}
            </p>
          ) : (
            <p className="text-[13px] text-ink-disabled">Sin notas todavía.</p>
          )}
        </div>

        <button
          onClick={() => setNotesOpen(true)}
          className="flex items-center justify-center gap-2 rounded-sm border border-line-strong py-2.5 text-[13px] font-semibold text-ink-soft transition-colors duration-fast hover:border-brand/50 hover:text-brand"
        >
          <NotebookPen size={14} strokeWidth={2} />
          Notas de la conversación{conversation._count.notes ? ` (${conversation._count.notes})` : ''}
        </button>
      </div>

      <EditContactDialog contact={editOpen ? contact : null} onOpenChange={(o) => !o && setEditOpen(false)} onSaved={onChanged} />
      <NotesDialog open={notesOpen} onOpenChange={setNotesOpen} conversationId={conversation.id} onChanged={onChanged} />
    </div>
  );
}
