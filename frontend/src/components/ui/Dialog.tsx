import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Modal accesible (foco atrapado, Esc, clic fuera) — construido sobre Radix Dialog. */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps): JSX.Element {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="wf-overlay" />
        <RadixDialog.Content className="wf-dialog">
          <RadixDialog.Title className="mb-1 font-display text-lg font-bold text-ink">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mb-4 text-[13px] text-ink-soft">{description}</RadixDialog.Description>
          )}
          {children}
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
