'use client';

import type { FinanceSummary } from '@repo/contracts';
import { Button, Panel, PanelBody, PanelHeader, Skeleton } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SelectFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { useOpenCommandPalette } from '@/components/shell/app-shell';
import { QueryError } from '@/components/states';
import { ROUTE_ACCESS } from '@/lib/access';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { AgingChart, MonthlyChart } from './charts';
import { CollectionsKpis, TopOverdueAccounts, UpcomingReceivables } from './collections-widgets';

const PARAM_KEYS = ['branchId'] as const;

/** The accountant's home: what is due, what is late, what came in. */
export function CollectionsView() {
  const t = useTranslations('finance.collections');
  const tk = useTranslations('finance.kpi');
  const tn = useTranslations('nav.items');
  const tcommon = useTranslations('common');
  const session = useSession();
  const format = useFormat();
  const { can, allows } = usePermissions();
  const openPalette = useOpenCommandPalette();
  const { values, update } = useListParams(PARAM_KEYS);
  const params = { branchId: values.branchId };

  const summary = useQuery({
    queryKey: queryKeys.finance.summary(params),
    queryFn: ({ signal }) => api.get<FinanceSummary>('/finance/summary', params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 2 * 60_000,
  });

  const branchOptions = session.branches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        meta={
          summary.data ? (
            <span className="text-xs text-fg-muted">{format.date(summary.data.asOf, 'long')}</span>
          ) : null
        }
        actions={
          <>
            {branchOptions.length > 1 ? (
              <SelectFilter
                label={tcommon('branch')}
                value={values.branchId}
                onChange={(branchId) => update({ branchId })}
                options={branchOptions}
              />
            ) : null}
            {allows(ROUTE_ACCESS.receivables) ? (
              <Button asChild variant="secondary" leadingIcon={<AlarmClock />}>
                <Link href="/finance/overdue">{tn('overdue')}</Link>
              </Button>
            ) : null}
            {can('finance.payments.create') && can('students.read') ? (
              <Button
                variant="primary"
                leadingIcon={<Wallet />}
                onClick={() => openPalette({ mode: 'pick-student' })}
              >
                {t('recordPayment')}
              </Button>
            ) : null}
          </>
        }
      />

      {summary.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-24" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : summary.isError ? (
        <Panel>
          <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <CollectionsKpis summary={summary.data} />
          <Panel className="grid grid-cols-1 divide-y divide-line-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <MiniStat
              label={tk('dueThisMonth')}
              value={format.money(summary.data.dueThisMonthMinor, summary.data.currency)}
            />
            <MiniStat
              label={tk('collectedThisMonth')}
              value={format.money(summary.data.collectedThisMonthMinor, summary.data.currency)}
            />
            <MiniStat
              label={tk('expectedThisMonth')}
              value={format.money(summary.data.expectedThisMonthMinor, summary.data.currency)}
            />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader title={t('monthly')} description={t('monthlyHint')} />
              <PanelBody>
                <MonthlyChart
                  monthly={summary.data.monthly}
                  currency={summary.data.currency}
                  currentMonth={summary.data.asOf.slice(0, 7)}
                />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title={t('aging')} description={t('agingHint')} />
              <PanelBody>
                <AgingChart aging={summary.data.aging} currency={summary.data.currency} />
              </PanelBody>
            </Panel>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <UpcomingReceivables summary={summary.data} />
            </div>
            <TopOverdueAccounts summary={summary.data} />
          </div>
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="tabular text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}
