'use client';

import { cn } from '@repo/ui';
import { useFormat } from '@/lib/use-format';

/** An amount in minor units, formatted for the current locale with tabular figures. */
export function Money({
  amountMinor,
  currency,
  className,
  muteZero = false,
}: {
  amountMinor: number;
  currency?: string;
  className?: string;
  /** Render zero amounts in a subdued color (e.g. nothing outstanding). */
  muteZero?: boolean;
}) {
  const format = useFormat();
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        muteZero && amountMinor === 0 && 'text-fg-subtle',
        className,
      )}
    >
      {format.money(amountMinor, currency)}
    </span>
  );
}
