'use client';

import type { GuardianListItem, Paginated } from '@repo/contracts';
import { EmptyState } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { SearchX, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { SearchFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';

const PARAM_KEYS = ['q'] as const;

export function GuardiansView() {
  const t = useTranslations('guardians');
  const tc = useTranslations('common');
  const { values, page, pageSize, update } = useListParams(PARAM_KEYS);
  const params = { page, pageSize, q: values.q };
  const guardians = useQuery({
    queryKey: queryKeys.guardians.list(params),
    queryFn: ({ signal }) => api.get<Paginated<GuardianListItem>>('/guardians', params, signal),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<GuardianListItem>[]>(
    () => [
      {
        id: 'name',
        header: t('columns.name'),
        meta: { label: t('columns.name'), required: true, className: 'min-w-[180px]' },
        cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
      },
      {
        id: 'phone',
        header: t('columns.phone'),
        meta: { label: t('columns.phone') },
        cell: ({ row }) =>
          row.original.phone ? (
            <a
              href={`tel:${row.original.phone.replace(/[^0-9+]/g, '')}`}
              className="hover:text-primary hover:underline"
            >
              {row.original.phone}
            </a>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        id: 'email',
        header: t('columns.email'),
        meta: { label: t('columns.email') },
        cell: ({ row }) =>
          row.original.email ? (
            <a href={`mailto:${row.original.email}`} className="hover:text-primary hover:underline">
              {row.original.email}
            </a>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        id: 'students',
        header: t('columns.students'),
        meta: { label: t('columns.students') },
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {row.original.students.map((student) => (
              <Link
                key={student.id}
                href={`/students/${student.id}?tab=guardians`}
                className="text-primary hover:underline"
              >
                {student.name}
              </Link>
            ))}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <DataTable
        tableId="guardians"
        columns={columns}
        rows={guardians.data?.items}
        total={guardians.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => update({ page: next })}
        onPageSizeChange={(size) => update({ pageSize: size })}
        isLoading={guardians.isPending}
        isFetching={guardians.isFetching}
        error={guardians.error}
        onRetry={() => void guardians.refetch()}
        getRowId={(row) => row.id}
        toolbar={
          <SearchFilter
            value={values.q}
            onChange={(q) => update({ q })}
            placeholder={t('searchPlaceholder')}
          />
        }
        emptyState={
          values.q ? (
            <EmptyState
              icon={<SearchX />}
              title={tc('noResults')}
              description={tc('noResultsHint')}
            />
          ) : (
            <EmptyState icon={<Users />} title={t('emptyTitle')} />
          )
        }
      />
    </>
  );
}
