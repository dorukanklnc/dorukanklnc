import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const tones = {
  neutral: 'border-neutral-border bg-neutral-bg text-neutral-fg',
  info: 'border-info-border bg-info-bg text-info-fg',
  success: 'border-success-border bg-success-bg text-success-fg',
  warning: 'border-warning-border bg-warning-bg text-warning-fg',
  danger: 'border-danger-border bg-danger-bg text-danger-fg',
} as const;

const dots = {
  neutral: 'bg-gray-400',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export type BadgeTone = keyof typeof tones;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

/** Status labels. Tone always carries meaning (never decoration). */
export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-2xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
