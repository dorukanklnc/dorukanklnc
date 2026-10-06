'use client';

import type { FinanceKpis, FinanceSummary } from '@repo/contracts';
import {
  EmptyState,
  Panel,
  PanelHeader,
  Stat,
  TBody,
  THead,
  Table,
  TableContainer,
  Td,
  Th,
  Tr,
} from '@repo/ui';
import { AlarmClock, CalendarClock, CircleCheck, Landmark, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Money } from '@/components/money';
import { useFormat } from '@/lib/use-format';
import { ReceivableStatusBadge } from './finance-badges';

function StatGrid({ children }: { children: ReactNode }) {
  return (
    <Panel className="grid grid-cols-1 divide-y divide-line-subtle sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      {children}
    </Panel>
  );
}

/** Today's collection work: due today, overdue, collected today and the month's rate. */
export function CollectionsKpis({ summary }: { summary: FinanceSummary }) {
  const t = useTranslations('dashboard.finance');
  const tk = useTranslations('finance.kpi');
  const tc = useTranslations('finance.collections');
  const format = useFormat();
  const { currency } = summary;
  return (
    <StatGrid>
      <Stat
        icon={<CalendarClock />}
        label={t('dueToday')}
        value={format.money(summary.dueTodayMinor, currency)}
        hint={tc('items', { count: summary.dueTodayCount })}
      />
      <Stat
        icon={<AlarmClock />}
        label={t('overdue')}
        value={format.money(summary.overdueMinor, currency)}
        tone={summary.overdueMinor > 0 ? 'danger' : 'default'}
        hint={t('overdueAccounts', { count: summary.overdueAccountCount })}
      />
      <Stat
        icon={<Wallet />}
        label={t('paymentsToday')}
        value={format.money(summary.paymentsTodayMinor, currency)}
        hint={t('paymentsCount', { count: summary.paymentsTodayCount })}
      />
      <Stat
        icon={<TrendingUp />}
        label={t('collectionRate')}
        value={
          summary.collectionRateThisMonth === null
            ? '—'
            : format.ratio(summary.collectionRateThisMonth)
        }
        hint={summary.collectionRateThisMonth === null ? tk('noRate') : t('collectionRateHint')}
        tone={
          summary.collectionRateThisMonth === null
            ? 'default'
            : summary.collectionRateThisMonth >= 0.9
              ? 'success'
              : summary.collectionRateThisMonth < 0.6
                ? 'warning'
                : 'default'
        }
      />
    </StatGrid>
  );
}

/** Aggregate-only figures for roles without access to individual balances (e.g. principal). */
export function FinanceKpiStrip({ kpis }: { kpis: FinanceKpis }) {
  const tk = useTranslations('finance.kpi');
  const t = useTranslations('dashboard.finance');
  const format = useFormat();
  return (
    <StatGrid>
      <Stat
        icon={<AlarmClock />}
        label={tk('overdue')}
        value={format.money(kpis.overdueMinor, kpis.currency)}
        tone={kpis.overdueMinor > 0 ? 'danger' : 'default'}
      />
      <Stat
        icon={<CircleCheck />}
        label={tk('collectedThisMonth')}
        value={format.money(kpis.collectedThisMonthMinor, kpis.currency)}
      />
      <Stat
        icon={<Landmark />}
        label={tk('expectedThisMonth')}
        value={format.money(kpis.expectedThisMonthMinor, kpis.currency)}
      />
      <Stat
        icon={<TrendingUp />}
        label={tk('collectionRate')}
        value={
          kpis.collectionRateThisMonth === null ? '—' : format.ratio(kpis.collectionRateThisMonth)
        }
        hint={kpis.collectionRateThisMonth === null ? tk('noRate') : t('collectionRateHint')}
      />
    </StatGrid>
  );
}

export function UpcomingReceivables({
  summary,
  limit = 10,
}: {
  summary: FinanceSummary;
  limit?: number;
}) {
  const t = useTranslations('finance');
  const format = useFormat();
  const items = summary.upcoming.slice(0, limit);
  return (
    <Panel>
      <PanelHeader title={t('collections.upcoming')} description={t('collections.upcomingHint')} />
      {items.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title={t('collections.noUpcoming')} className="py-8" />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>{t('receivables.columns.dueDate')}</Th>
                <Th>{t('receivables.columns.student')}</Th>
                <Th className="hidden md:table-cell">{t('receivables.columns.description')}</Th>
                <Th className="text-right">{t('receivables.columns.outstanding')}</Th>
                <Th>{t('receivables.columns.status')}</Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td className="tabular">{format.date(item.dueDate)}</Td>
                  <Td>
                    <Link
                      href={`/students/${item.student.id}?tab=finance`}
                      className="hover:text-primary hover:underline"
                    >
                      {item.student.fullName}
                    </Link>
                  </Td>
                  <Td className="hidden text-fg-muted md:table-cell">{item.description}</Td>
                  <Td className="text-right">
                    <Money
                      amountMinor={item.outstandingMinor}
                      currency={item.currency}
                      className="font-medium"
                    />
                  </Td>
                  <Td>
                    <ReceivableStatusBadge receivable={item} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Panel>
  );
}

export function TopOverdueAccounts({ summary }: { summary: FinanceSummary }) {
  const t = useTranslations('finance');
  const format = useFormat();
  return (
    <Panel>
      <PanelHeader
        title={t('collections.topOverdue')}
        actions={
          summary.topOverdue.length > 0 ? (
            <Link
              href="/finance/overdue"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('collections.viewOverdue')}
            </Link>
          ) : null
        }
      />
      {summary.topOverdue.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title={t('collections.noOverdue')} className="py-8" />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {summary.topOverdue.map((account) => (
            <li
              key={account.student.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <Link
                  href={`/students/${account.student.id}?tab=finance`}
                  className="block truncate text-sm font-medium text-fg hover:text-primary hover:underline"
                >
                  {account.student.fullName}
                </Link>
                <p className="text-xs text-fg-muted">
                  {t('collections.oldestDue', { date: format.date(account.oldestDueDate) })} ·{' '}
                  {t('collections.items', { count: account.overdueCount })}
                </p>
              </div>
              <Money
                amountMinor={account.overdueMinor}
                currency={summary.currency}
                className="text-sm font-semibold text-danger-fg"
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
