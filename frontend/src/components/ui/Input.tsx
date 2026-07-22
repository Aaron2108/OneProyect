import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

const fieldCls =
  'w-full rounded-sm border border-line-strong bg-[var(--input-bg)] px-3.5 py-2.5 text-ink placeholder:text-ink-faint ' +
  'transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(fieldCls, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(fieldCls, 'resize-y', className)} {...rest} />;
  },
);

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>): JSX.Element {
  return <label className={clsx('mb-1.5 block text-[12.5px] font-semibold text-ink-soft', className)} {...rest} />;
}

export function Field({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  return <div className={clsx('mb-3.5', className)}>{children}</div>;
}
