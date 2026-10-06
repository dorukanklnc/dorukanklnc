'use client';

import type { Paginated, StudentListItem } from '@repo/contracts';
import { Button, Checkbox, EmptyState } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, Plus, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { ClearFiltersButton, SearchFilter, SelectFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { useClasses } from '@/features/academics/queries';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { STUDENT_STATUSES } from './constants';
import { CreateStudentSheet } from './create-student-sheet';
import { StudentStatusBadge } from './student-badges';

const PARAM_KEYS = [
  'q',
  'status',
  'branchId',
  'classId',
  'includeArchived',
  'sort',
  'direction',
  'new',
] as const;

export function StudentsView() {
  const t = useTranslations('students');
  const tc = useTranslations('common');
  const format = useFormat();
  const session = useSession();
  const { can } = usePermissions();
  const { values, page, pageSize, update, clear } = useListParams(PARAM_KEYS);

  const sort = values.sort ?? 'name';
  const direction = values.direction === 'desc' ? 'desc' : 'asc';
  const params = {
    page,
    pageSize,
    q: values.q,
    status: values.status,
    branchId: values.branchId,
    classId: values.classId,
    includeArchived: values.includeArchived === 'true' ? true : undefined,
    sort,
    direction,
  };

  const students = useQuery({
    queryKey: queryKeys.students.list(params),
    queryFn: ({ signal }) => api.get<Paginated<StudentListItem>>('/students', params, signal),
    placeholderData: keepPreviousData,
  });
  const classes = useClasses({ branchId: values.branchId });

  const showGuardian = can('guardians.read');
  const columns = useMemo<ColumnDef<StudentListItem>[]>(
    () => [
      {
        id: 'studentNumber',
        header: t('columns.studentNumber'),
        meta: { sortKey: 'studentNumber', label: t('columns.studentNumber'), className: 'w-28' },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-fg-muted">{row.original.studentNumber}</span>
        ),
      },
      {
        id: 'name',
        header: t('columns.name'),
        meta: {
          sortKey: 'name',
          label: t('columns.name'),
          required: true,
          className: 'min-w-[200px]',
        },
        cell: ({ row }) => (
          <Link
            href={`/students/${row.original.id}`}
            className="font-medium text-fg hover:text-primary hover:underline"
          >
            {row.original.fullName}
          </Link>
        ),
      },
      {
        id: 'className',
        header: t('columns.className'),
        meta: { label: t('columns.className') },
        cell: ({ row }) => row.original.className ?? <span className="text-fg-subtle">—</span>,
      },
      {
        id: 'gradeLevel',
        header: t('columns.gradeLevel'),
        meta: { label: t('columns.gradeLevel') },
        cell: ({ row }) => row.original.gradeLevelName ?? <span className="text-fg-subtle">—</span>,
      },
      {
        id: 'branch',
        header: t('columns.branch'),
        meta: { label: t('columns.branch') },
        cell: ({ row }) => <span className="text-fg-muted">{row.original.branch.name}</span>,
      },
      ...(showGuardian
        ? [
            {
              id: 'guardian',
              header: t('columns.guardian'),
              meta: { label: t('columns.guardian') },
              cell: ({ row }) =>
                row.original.primaryGuardian ? (
                  <span className="flex flex-col leading-tight">
                    <span>{row.original.primaryGuardian.fullName}</span>
                    {row.original.primaryGuardian.phone ? (
                      <span className="text-xs text-fg-subtle">
                        {row.original.primaryGuardian.phone}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-fg-subtle">—</span>
                ),
            } satisfies ColumnDef<StudentListItem>,
          ]
        : []),
      {
        id: 'status',
        header: t('columns.status'),
        meta: { sortKey: 'status', label: t('columns.status') },
        cell: ({ row }) => (
          <StudentStatusBadge
            status={row.original.status}
            archived={row.original.archivedAt !== null}
          />
        ),
      },
      {
        id: 'enrolledOn',
        header: t('columns.enrolledOn'),
        meta: { label: t('columns.enrolledOn') },
        cell: ({ row }) => (
          <span className="tabular text-fg-muted">{format.date(row.original.enrolledOn)}</span>
        ),
      },
    ],
    [t, format, showGuardian],
  );

  const hasFilters = Boolean(
    values.q || values.status || values.branchId || values.classId || values.includeArchived,
  );
  const branchOptions = session.branches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          can('students.create') ? (
            <Button
              variant="primary"
              leadingIcon={<Plus />}
              onClick={() => update({ new: '1' }, { resetPage: false })}
            >
              {t('add')}
            </Button>
          ) : null
        }
      />
      <DataTable
        tableId="students"
        columns={columns}
        rows={students.data?.items}
        total={students.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => update({ page: next })}
        onPageSizeChange={(size) => update({ pageSize: size })}
        sort={{ key: sort, direction }}
        onSortChange={(next) => update({ sort: next.key, direction: next.direction })}
        isLoading={students.isPending}
        isFetching={students.isFetching}
        error={students.error}
        onRetry={() => void students.refetch()}
        getRowId={(row) => row.id}
        rowHref={(row) => `/students/${row.id}`}
        toolbar={
          <>
            <SearchFilter
              value={values.q}
              onChange={(q) => update({ q })}
              placeholder={t('searchPlaceholder')}
            />
            <SelectFilter
              label={t('filters.status')}
              value={values.status}
              onChange={(status) => update({ status })}
              options={STUDENT_STATUSES.map((status) => ({
                value: status,
                label: t(`status.${status}`),
              }))}
            />
            {branchOptions.length > 1 ? (
              <SelectFilter
                label={t('filters.branch')}
                value={values.branchId}
                onChange={(branchId) => update({ branchId, classId: undefined })}
                options={branchOptions}
              />
            ) : null}
            {classes.data && classes.data.length > 0 ? (
              <SelectFilter
                label={t('filters.class')}
                value={values.classId}
                onChange={(classId) => update({ classId })}
                options={classes.data.map((klass) => ({ value: klass.id, label: klass.name }))}
              />
            ) : null}
            <label className="flex h-8 items-center gap-2 px-1 text-sm text-fg-muted">
              <Checkbox
                checked={values.includeArchived === 'true'}
                onCheckedChange={(checked) =>
                  update({ includeArchived: checked === true ? 'true' : undefined })
                }
              />
              {t('includeArchived')}
            </label>
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
            <EmptyState
              icon={<GraduationCap />}
              title={t('emptyTitle')}
              description={t('emptyHint')}
              action={
                can('students.create') ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={<Plus />}
                    onClick={() => update({ new: '1' }, { resetPage: false })}
                  >
                    {t('add')}
                  </Button>
                ) : null
              }
            />
          )
        }
      />
      {can('students.create') ? (
        <CreateStudentSheet
          open={values.new === '1'}
          onOpenChange={(open) => {
            if (!open) update({ new: undefined }, { resetPage: false });
          }}
        />
      ) : null}
    </>
  );
}
