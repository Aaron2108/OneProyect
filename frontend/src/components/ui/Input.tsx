import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

const fieldCls =
  'w-full rounded-sm border border-line-strong bg-[var(--input-bg)] px-4 py-3 text-[14.5px] text-ink placeholder:text-ink-disabled ' +
  'transition-[border-color,box-shadow] duration-fast ease-spring focus:outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)]';

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
  return <label className={clsx('mb-2 block text-[12.5px] font-semibold text-ink-soft', className)} {...rest} />;
}

export function Field({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  return <div className={clsx('mb-4', className)}>{children}</div>;
}

/** Select nativo con el mismo lenguaje visual que Input/Textarea. */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx(fieldCls, 'cursor-pointer', className)} {...rest}>
        {children}
      </select>
    );
  },
);
