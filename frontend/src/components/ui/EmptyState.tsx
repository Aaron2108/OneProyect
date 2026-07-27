import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="reveal mx-auto max-w-[300px] p-6 text-center text-ink-faint">
      <div className="float-y relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-lg bg-surface text-brand shadow-2">
        <span
          className="absolute inset-0 -z-10 rounded-full blur-xl"
          style={{ background: 'radial-gradient(circle, var(--brand-glow), transparent 70%)' }}
          aria-hidden="true"
        />
        <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h4 className="mb-1.5 font-display text-lg font-bold text-ink">{title}</h4>
      <p className="m-0 text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
