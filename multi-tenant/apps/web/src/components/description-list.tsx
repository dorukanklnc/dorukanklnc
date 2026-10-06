import { cn } from '@repo/ui';
import type { ReactNode } from 'react';

export interface DescriptionItem {
  label: ReactNode;
  value: ReactNode;
  /** Span both columns (long values such as addresses). */
  wide?: boolean;
}

/** Read-only label/value pairs for detail screens. Empty values render an em dash. */
export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: DescriptionItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={index} className={cn('min-w-0', item.wide && columns > 1 && 'sm:col-span-full')}>
          <dt className="text-xs text-fg-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-fg">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-fg-subtle">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
