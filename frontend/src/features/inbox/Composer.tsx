import { useRef, useState } from 'react';
import { Button, Spinner } from '@/components/ui/Button';
import { QuickRepliesPopover } from './QuickRepliesPopover';

export function Composer({ onSend }: { onSend: (text: string) => Promise<void> }): JSX.Element {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(): Promise<void> {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText('');
    try {
      await onSend(value);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="composer-bar flex flex-shrink-0 gap-2 px-4 py-3 sm:px-10">
      <QuickRepliesPopover onInsert={(body) => setText((t) => (t.trim() ? `${t.trim()} ${body}` : body))} />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        placeholder="Escribe tu respuesta..."
        aria-label="Mensaje"
        autoComplete="off"
        className="flex-1 rounded-full border border-line-strong bg-[var(--input-bg)] px-4 py-3 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
      />
      <Button variant="brand" onClick={send} disabled={sending} className="!rounded-full !px-6" style={{ minWidth: 108 }}>
        {sending ? <Spinner /> : 'Enviar'}
      </Button>
    </div>
  );
}
