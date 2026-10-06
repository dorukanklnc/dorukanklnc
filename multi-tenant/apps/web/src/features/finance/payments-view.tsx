'use client';

import type { Paginated, PaymentListItem } from '@repo/contracts';
import { paymentMethodSchema, paymentStatusSchema } from '@repo/contracts';
import { Button, EmptyState, Input, cn } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { SearchX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { ClearFiltersButton, SearchFilter, SelectFilter } from '@/components/filters';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { useOpenCommandPalette } from '@/components/shell/app-shell';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { PaymentStatusBadge } from './finance-badges';
import { ReceiptLink } from './record-payment-dialog';

const PARAM_KEYS = [
  'q',
  'method',
  'status',
  'from',
  'to',
  'branchId',
  'sort',
  'direction',
] as const;

export function PaymentsView() {
  const t = useTranslations('finance.payments');
  const tc = useTranslations('common');
  const format = useFormat();
  const session = useSession();
  const { can } = usePermissions();
  const openPalette = useOpenCommandPalette();
  const { values, page, pageSize, update, clear } = useListParams(PARAM_KEYS);

  const sort = values.sort ?? 'receivedAt';
  const direction = values.direction === 'asc' ? 'asc' : 'desc';
  const params = {
    page,
    pageSize,
    q: values.q,
    method: values.method,
    status: values.status,
    from: values.from,
    to: values.to,
    branchId: values.branchId,
    sort,
    direction,
  };
  const payments = useQuery({
    queryKey: queryKeys.finance.payments(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<PaymentListItem>>('/finance/payments', params, signal),
    placeholderData: keepPreviousData,
  });

  const showBranch = session.branches.length > 1;
  const columns = useMemo<ColumnDef<PaymentListItem>[]>(
    () => [
      {
        id: 'receipt',
        header: t('columns.receipt'),
        meta: { label: t('columns.receipt'), required: true, className: 'w-36' },
        cell: ({ row }) => <ReceiptLink payment={row.original} />,
      },
      {
        id: 'receivedAt',
        header: t('columns.receivedAt'),
        meta: { sortKey: 'receivedAt', label: t('columns.receivedAt') },
        cell: ({ row }) => (
          <span className="tabular text-fg-muted">{format.dateTime(row.original.receivedAt)}</span>
        ),
      },
      {
        id: 'student',
        header: t('columns.student'),
        meta: { label: t('columns.student'), className: 'min-w-[180px]' },
        cell: ({ row }) => (
          <Link
            href={`/students/${row.original.student.id}?tab=finance`}
            className="font-medium text-fg hover:text-primary hover:underline"
          >
            {row.original.student.fullName}
          </Link>
        ),
      },
      ...(showBranch
        ? [
            {
              id: 'branch',
              header: tc('branch'),
              meta: { label: tc('branch') },
              cell: ({ row }) => <span className="text-fg-muted">{row.original.branch.name}</span>,
            } satisfies ColumnDef<PaymentListItem>,
          ]
        : []),
      {
        id: 'method',
        header: t('columns.method'),
        meta: { label: t('columns.method') },
        cell: ({ row }) => t(`method.${row.original.method}`),
      },
      {
        id: 'amount',
        header: t('columns.amount'),
        meta: { sortKey: 'amount', label: t('columns.amount'), align: 'right', required: true },
        cell: ({ row }) => (
          <Money
            amountMinor={row.original.amountMinor}
            currency={row.original.currency}
            className={cn(
              'font-medium',
              row.original.status === 'reversed' && 'text-fg-subtle line-through',
            )}
          />
        ),
      },
      {
        id: 'unallocated',
        header: t('columns.unallocated'),
        meta: { label: t('columns.unallocated'), align: 'right' },
        cell: ({ row }) => (
          <Money
            amountMinor={row.original.unallocatedMinor}
            currency={row.original.currency}
            muteZero
          />
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        meta: { label: t('columns.status') },
        cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
      },
      {
        id: 'recordedBy',
        header: t('columns.recordedBy'),
        meta: { label: t('columns.recordedBy') },
        cell: ({ row }) => (
          <span className="text-fg-muted">
            {row.original.recordedBy ?? row.original.provider ?? '—'}
          </span>
        ),
      },
    ],
    [t, tc, format, showBranch],
  );

  const hasFilters = Boolean(
    values.q || values.method || values.status || values.from || values.to || values.branchId,
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          can('finance.payments.create') && can('students.read') ? (
            <Button
              variant="primary"
              leadingIcon={<Wallet />}
              onClick={() => openPalette({ mode: 'pick-student' })}
            >
              {t('record')}
            </Button>
          ) : null
        }
      />
      <DataTable
        tableId="payments"
        columns={columns}
        rows={payments.data?.items}
        total={payments.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => update({ page: next })}
        onPageSizeChange={(size) => update({ pageSize: size })}
        sort={{ key: sort, direction }}
        onSortChange={(next) => update({ sort: next.key, direction: next.direction })}
        isLoading={payments.isPending}
        isFetching={payments.isFetching}
        error={payments.error}
        onRetry={() => void payments.refetch()}
        getRowId={(row) => row.id}
        rowHref={(row) => `/finance/payments/${row.id}`}
        toolbar={
          <>
            <SearchFilter
              value={values.q}
              onChange={(q) => update({ q })}
              placeholder={t('searchPlaceholder')}
            />
            <SelectFilter
              label={t('filters.method')}
              value={values.method}
              onChange={(method) => update({ method })}
              options={paymentMethodSchema.options.map((method) => ({
                value: method,
                label: t(`method.${method}`),
              }))}
            />
            <SelectFilter
              label={t('filters.status')}
              value={values.status}
              onChange={(status) => update({ status })}
              options={paymentStatusSchema.options.map((status) => ({
                value: status,
                label: t(`status.${status}`),
              }))}
            />
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
              value={values.from ?? ''}
              onChange={(event) => update({ from: event.target.value || undefined })}
              aria-label={t('filters.from')}
              title={t('filters.from')}
              className="w-[150px]"
            />
            <Input
              type="date"
              value={values.to ?? ''}
              onChange={(event) => update({ to: event.target.value || undefined })}
              aria-label={t('filters.to')}
              title={t('filters.to')}
              className="w-[150px]"
            />
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
          ) : (
            <EmptyState icon={<Wallet />} title={t('emptyTitle')} />
          )
        }
      />
    </>
  );
}
