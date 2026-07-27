import * as RadixToast from '@radix-ui/react-toast';
import { Bot, Check, TriangleAlert } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  kind?: 'default' | 'ai' | 'error';
}

interface ToastContextValue {
  show: (message: string, kind?: ToastItem['kind']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);

  function show(message: string, kind: ToastItem['kind'] = 'default'): void {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, kind }]);
  }
  function remove(id: number): void {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ show }}>
      <RadixToast.Provider swipeDirection="right" duration={2800}>
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            onOpenChange={(open) => !open && remove(t.id)}
            className="wf-toast data-[state=open]:animate-toast-in data-[swipe=end]:animate-toast-out"
          >
            <span
              className="tick"
              style={{
                background: t.kind === 'ai' ? 'var(--ai)' : t.kind === 'error' ? 'var(--danger)' : 'var(--brand)',
                color: t.kind === 'ai' ? '#fff' : t.kind === 'error' ? '#fff' : 'var(--on-brand)',
              }}
            >
              {t.kind === 'error' ? (
                <TriangleAlert size={11} strokeWidth={2.5} />
              ) : t.kind === 'ai' ? (
                <Bot size={11} strokeWidth={2.5} />
              ) : (
                <Check size={11} strokeWidth={3} />
              )}
            </span>
            <RadixToast.Description>{t.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="wf-toast-viewport" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

// El hook vive junto a su proveedor a proposito: separarlos obligaria a
// importar de dos sitios para usar un unico contexto. Solo cuesta que Fast
// Refresh recargue el modulo entero al editarlo, en desarrollo.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
