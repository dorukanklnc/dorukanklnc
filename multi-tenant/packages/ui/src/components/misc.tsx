import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-sm bg-gray-100', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-surface-muted px-1 font-mono text-2xs text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Separator({
  className,
  vertical = false,
}: {
  className?: string;
  vertical?: boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn(vertical ? 'mx-1 h-5 w-px' : 'my-1 h-px w-full', 'bg-line', className)}
    />
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase('tr-TR');
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700',
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-fg-subtle [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  icon?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    default: 'text-fg',
    danger: 'text-danger-fg',
    warning: 'text-warning-fg',
    success: 'text-success-fg',
  }[tone];
  return (
    <div className={cn('flex flex-col gap-1 p-4', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className={cn('tabular text-2xl font-semibold tracking-tight', toneClass)}>{value}</div>
      {hint ? <div className="text-xs text-fg-muted">{hint}</div> : null}
    </div>
  );
}
