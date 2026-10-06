'use client';

import type { AgingBucket, FinanceSummary } from '@repo/contracts';
import { Tooltip, cn } from '@repo/ui';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/use-format';

const AGING_COLORS: Record<AgingBucket, string> = {
  not_due: 'bg-chart-2',
  d1_30: 'bg-warning/70',
  d31_60: 'bg-warning',
  d61_90: 'bg-danger/75',
  d90_plus: 'bg-danger',
};

/**
 * Receivables by age. Color encodes severity (never decoration): not yet due → late → very late.
 * The stacked bar gives the proportion; the list gives exact figures.
 */
export function AgingChart({
  aging,
  currency,
}: {
  aging: FinanceSummary['aging'];
  currency: string;
}) {
  const t = useTranslations('finance.aging');
  const format = useFormat();
  const total = aging.reduce((sum, bucket) => sum + bucket.amountMinor, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        {total > 0
          ? aging
              .filter((bucket) => bucket.amountMinor > 0)
              .map((bucket) => (
                <div
                  key={bucket.bucket}
                  className={cn(
                    'h-full first:rounded-l-full last:rounded-r-full',
                    AGING_COLORS[bucket.bucket],
                  )}
                  style={{ width: `${(bucket.amountMinor / total) * 100}%` }}
                />
              ))
          : null}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {aging.map((bucket) => (
            <tr key={bucket.bucket} className="border-t border-line-subtle first:border-t-0">
              <td className="py-1.5 pr-2">
                <span className="flex items-center gap-2">
                  <span
                    className={cn('size-2 rounded-full', AGING_COLORS[bucket.bucket])}
                    aria-hidden="true"
                  />
                  {t(bucket.bucket)}
                </span>
              </td>
              <td className="tabular py-1.5 pr-2 text-right text-xs text-fg-muted">
                {format.number(bucket.count)}
              </td>
              <td className="tabular py-1.5 text-right font-medium">
                {format.money(bucket.amountMinor, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Due vs. collected per month as paired columns, rendered with plain HTML so it stays crisp and
 * responsive. An equivalent data table is provided for screen readers.
 */
export function MonthlyChart({
  monthly,
  currency,
  currentMonth,
}: {
  monthly: FinanceSummary['monthly'];
  currency: string;
  currentMonth: string;
}) {
  const t = useTranslations('finance.collections');
  const format = useFormat();
  const max = Math.max(1, ...monthly.flatMap((month) => [month.dueMinor, month.collectedMinor]));
  const ticks = [1, 0.5, 0];

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-fg-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-3" />
          {t('due')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-1" />
          {t('collected')}
        </span>
      </div>
      <div className="relative flex h-48 gap-2 pl-14" aria-hidden="true">
        {ticks.map((tick) => (
          <div
            key={tick}
            className="pointer-events-none absolute inset-x-0 flex items-center"
            style={{ bottom: `calc(${tick * 100}% - 0.5px)` }}
          >
            <span className="tabular w-12 shrink-0 pr-2 text-right text-2xs text-fg-subtle">
              {tick === 0 ? '0' : format.moneyCompact(Math.round(max * tick), currency)}
            </span>
            <span className={cn('h-px flex-1', tick === 0 ? 'bg-line-strong' : 'bg-line-subtle')} />
          </div>
        ))}
        {monthly.map((month) => {
          const current = month.month === currentMonth;
          return (
            <Tooltip
              key={month.month}
              content={
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{format.month(month.month)}</span>
                  <span>
                    {t('due')}: {format.money(month.dueMinor, currency)}
                  </span>
                  <span>
                    {t('collected')}: {format.money(month.collectedMinor, currency)}
                  </span>
                </span>
              }
            >
              <div className="group relative flex min-w-0 flex-1 cursor-default items-end justify-center gap-0.5 rounded-sm hover:bg-surface-hover/60">
                <div
                  className="w-full max-w-4 rounded-t-xs bg-chart-3"
                  style={{ height: `${(month.dueMinor / max) * 100}%` }}
                />
                <div
                  className={cn(
                    'w-full max-w-4 rounded-t-xs',
                    current ? 'bg-primary' : 'bg-chart-1',
                  )}
                  style={{ height: `${(month.collectedMinor / max) * 100}%` }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 pl-14" aria-hidden="true">
        {monthly.map((month) => (
          <span
            key={month.month}
            className={cn(
              'min-w-0 flex-1 truncate text-center text-2xs',
              month.month === currentMonth ? 'font-semibold text-fg' : 'text-fg-subtle',
            )}
          >
            {format.month(month.month).split(' ')[0]}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('monthly')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('month')}</th>
            <th scope="col">{t('due')}</th>
            <th scope="col">{t('collected')}</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((month) => (
            <tr key={month.month}>
              <th scope="row">{format.month(month.month)}</th>
              <td>{format.money(month.dueMinor, currency)}</td>
              <td>{format.money(month.collectedMinor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small horizontal bar list (e.g. active students per branch). */
export function BarList({
  items,
  valueFormatter,
}: {
  items: { key: string; label: string; value: number }[];
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.key} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate text-fg">{item.label}</span>
            <span className="tabular font-medium text-fg">{valueFormatter(item.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
