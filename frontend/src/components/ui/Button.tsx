import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'brand' | 'ai' | 'ghost' | 'danger' | 'sec';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLS: Record<Variant, string> = {
  brand:
    'bg-brand text-brand-on shadow-[0_8px_20px_-8px_var(--brand-glow)] hover:bg-brand-hover hover:shadow-[0_12px_28px_-8px_var(--brand-glow)]',
  ai: 'bg-ai text-white shadow-[0_8px_20px_-8px_var(--ai-glow)] hover:bg-ai-hover',
  ghost: 'bg-transparent border border-line-strong text-ink hover:border-brand/60 hover:text-brand hover:bg-brand-tint',
  danger: 'bg-transparent border border-line-strong text-danger hover:border-danger hover:bg-danger-tint',
  sec: 'bg-[var(--muted-bg)] text-ink border border-line hover:border-line-strong hover:brightness-110',
};

const SIZE_CLS: Record<Size, string> = {
  md: 'px-5 py-2.5 text-[14.5px] rounded-sm',
  sm: 'px-3.5 py-1.5 text-[13px] rounded-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'brand', size = 'md', loading, fullWidth, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold tracking-tight',
        'transition-[background-color,box-shadow,border-color,transform,filter] duration-fast ease-spring active:translate-y-px active:scale-[.99]',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        SIZE_CLS[size],
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
      style={{ border: '2px solid rgba(255,255,255,.35)', borderTopColor: 'currentColor' }}
      aria-hidden="true"
    />
  );
}
