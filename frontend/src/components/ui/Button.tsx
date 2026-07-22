import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'brand' | 'ai' | 'ghost' | 'danger' | 'sec';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLS: Record<Variant, string> = {
  brand:
    'bg-brand text-white shadow-[0_6px_18px_-8px_var(--brand-glow)] hover:bg-brand-700 hover:shadow-[0_10px_24px_-8px_var(--brand-glow)]',
  ai: 'bg-ai text-white shadow-[0_6px_18px_-8px_var(--ai-glow)] hover:bg-ai-700',
  ghost:
    'bg-transparent border border-line-strong text-ink hover:border-brand hover:text-brand',
  danger: 'bg-transparent border border-line-strong text-danger hover:border-danger',
  sec: 'bg-[var(--sec-btn-bg,var(--muted-bg))] text-ink hover:brightness-95',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'brand', loading, fullWidth, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-[14.5px] font-semibold tracking-tight',
        'transition-[background,box-shadow,transform] duration-200 ease-spring active:translate-y-px',
        'disabled:opacity-65 disabled:cursor-default',
        fullWidth && 'w-full',
        VARIANT_CLS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={clsx('inline-block h-[15px] w-[15px] rounded-full animate-spin', className)}
      style={{ border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff' }}
      aria-hidden="true"
    />
  );
}
