'use client';

import type { Paginated, Receivable } from '@repo/contracts';
import { receivableKindSchema, receivableStatusSchema } from '@repo/contracts';
import { Checkbox, EmptyState, Input, cn } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, ReceiptText, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { ClearFiltersButton, SearchFilter, SelectFilter } from '@/components/filters';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { ReceivableStatusBadge } from './finance-badges';

const PARAM_KEYS = [
  'q',
  'kind',
  'status',
  'overdue',
  'dueFrom',
  'dueTo',
  'branchId',
  'sort',
  'direction',
] as const;

/**
 * Installments and charges across students. With `overdueOnly` it becomes the collections
 * work list: every receivable past its due date, oldest first.
 */
export function ReceivablesView({ overdueOnly = false }: { overdueOnly?: boolean }) {
  const t = useTranslations('finance.receivables');
  const tc = useTranslations('common');
  const format = useFormat();
  const session = useSession();
  const { values, page, pageSize, update, clear } = useListParams(PARAM_KEYS);

  const sort = values.sort ?? 'dueDate';
  const direction = values.direction === 'desc' ? 'desc' : 'asc';
  const overdue = overdueOnly || values.overdue === 'true';
  const params = {
    page,
    pageSize,
    q: values.q,
    kind: values.kind,
    status: overdueOnly ? undefined : values.status,
    overdue: overdue ? true : undefined,
    dueFrom: values.dueFrom,
    dueTo: values.dueTo,
    branchId: values.branchId,
    sort,
    direction,
  };
  const receivables = useQuery({
    queryKey: queryKeys.finance.receivables(params),
    queryFn: ({ signal }) => api.get<Paginated<Receivable>>('/finance/receivables', params, signal),
    placeholderData: keepPreviousData,
  });

  const showBranch = session.branches.length > 1;
  const columns = useMemo<ColumnDef<Receivable>[]>(
    () => [
      {
        id: 'dueDate',
        header: t('columns.dueDate'),
        meta: { sortKey: 'dueDate', label: t('columns.dueDate'), className: 'w-28' },
        cell: ({ row }) => (
          <span className={cn('tabular', row.original.isOverdue && 'font-medium text-danger-fg')}>
            {format.date(row.original.dueDate)}
          </span>
        ),
      },
      {
        id: 'student',
        header: t('columns.student'),
        meta: {
          sortKey: 'student',
          label: t('columns.student'),
          required: true,
          className: 'min-w-[180px]',
        },
        cell: ({ row }) => (
          <span className="flex flex-col leading-tight">
            <Link
              href={`/students/${row.original.student.id}?tab=finance`}
              className="font-medium text-fg hover:text-primary hover:underline"
            >
              {row.original.student.fullName}
            </Link>
            <span className="font-mono text-2xs text-fg-subtle">
              {row.original.student.studentNumber}
            </span>
          </span>
        ),
      },
      {
        id: 'description',
        header: t('columns.description'),
        meta: { label: t('columns.description') },
        cell: ({ row }) => <span className="text-fg-muted">{row.original.description}</span>,
      },
      {
        id: 'kind',
        header: t('columns.kind'),
        meta: { label: t('columns.kind') },
        cell: ({ row }) => t(`kind.${row.original.kind}`),
      },
      ...(showBranch
        ? [
            {
              id: 'branch',
              header: t('columns.branch'),
              meta: { label: t('columns.branch') },
              cell: ({ row }) => <span className="text-fg-muted">{row.original.branch.name}</span>,
            } satisfies ColumnDef<Receivable>,
          ]
        : []),
      {
        id: 'amount',
        header: t('columns.amount'),
        meta: { sortKey: 'amount', label: t('columns.amount'), align: 'right' },
        cell: ({ row }) => (
          <Money amountMinor={row.original.amountMinor} currency={row.original.currency} />
        ),
      },
      {
        id: 'paid',
        header: t('columns.paid'),
        meta: { label: t('columns.paid'), align: 'right' },
        cell: ({ row }) => (
          <Money
            amountMinor={row.original.allocatedMinor}
            currency={row.original.currency}
            muteZero
          />
        ),
      },
      {
        id: 'outstanding',
        header: t('columns.outstanding'),
        meta: { label: t('columns.outstanding'), align: 'right', required: true },
        cell: ({ row }) => (
          <Money
            amountMinor={row.original.outstandingMinor}
            currency={row.original.currency}
            muteZero
            className="font-medium"
          />
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        meta: { label: t('columns.status') },
        cell: ({ row }) => <ReceivableStatusBadge receivable={row.original} />,
      },
    ],
    [t, format, showBranch],
  );

  const hasFilters = Boolean(
    values.q ||
    values.kind ||
    values.status ||
    values.overdue ||
    values.dueFrom ||
    values.dueTo ||
    values.branchId,
  );

  return (
    <>
      <PageHeader
        title={overdueOnly ? t('overdueTitle') : t('title')}
        description={overdueOnly ? t('overdueDescription') : t('description')}
      />
      <DataTable
        tableId={overdueOnly ? 'overdue' : 'receivables'}
        columns={columns}
        rows={receivables.data?.items}
        total={receivables.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => update({ page: next })}
        onPageSizeChange={(size) => update({ pageSize: size })}
        sort={{ key: sort, direction }}
        onSortChange={(next) => update({ sort: next.key, direction: next.direction })}
        isLoading={receivables.isPending}
        isFetching={receivables.isFetching}
        error={receivables.error}
        onRetry={() => void receivables.refetch()}
        getRowId={(row) => row.id}
        rowHref={(row) => `/students/${row.student.id}?tab=finance`}
        toolbar={
          <>
            <SearchFilter
              value={values.q}
              onChange={(q) => update({ q })}
              placeholder={t('searchPlaceholder')}
            />
            <SelectFilter
              label={t('filters.kind')}
              value={values.kind}
              onChange={(kind) => update({ kind })}
              options={receivableKindSchema.options.map((kind) => ({
                value: kind,
                label: t(`kind.${kind}`),
              }))}
            />
            {overdueOnly ? null : (
              <SelectFilter
                label={t('filters.status')}
                value={values.status}
                onChange={(status) => update({ status })}
                options={receivableStatusSchema.options.map((status) => ({
                  value: status,
                  label: t(`status.${status}`),
                }))}
              />
            )}
            {showBranch ? (
              <SelectFilter
                label={tc('branch')}
                value={values.branchId}
                onChange={(branchId) => update({ branchId })}
                options={session.branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
              />
            ) : null}
            <Input
              type="date"
              value={values.dueFrom ?? ''}
              onChange={(event) => update({ dueFrom: event.target.value || undefined })}
              aria-label={t('filters.dueFrom')}
              title={t('filters.dueFrom')}
              className="w-[150px]"
            />
            <Input
              type="date"
              value={values.dueTo ?? ''}
              onChange={(event) => update({ dueTo: event.target.value || undefined })}
              aria-label={t('filters.dueTo')}
              title={t('filters.dueTo')}
              className="w-[150px]"
            />
            {overdueOnly ? null : (
              <label className="flex h-8 items-center gap-2 px-1 text-sm text-fg-muted">
                <Checkbox
                  checked={values.overdue === 'true'}
                  onCheckedChange={(checked) =>
                    update({ overdue: checked === true ? 'true' : undefined })
                  }
                />
                {t('filters.onlyOverdue')}
              </label>
            )}
            {hasFilters ? (
              <ClearFiltersButton onClick={() => clear(['pageSize', 'sort', 'direction'])} />
            ) : null}
          </>
        }
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={<SearchX />}
              title={tc('noResults')}
              description={tc('noResultsHint')}
            />
          ) : overdueOnly ? (
            <EmptyState
              icon={<CircleCheck />}
              title={t('noOverdueTitle')}
              description={t('noOverdueHint')}
            />
          ) : (
            <EmptyState icon={<ReceiptText />} title={t('emptyTitle')} />
          )
        }
      />
    </>
  );
}
