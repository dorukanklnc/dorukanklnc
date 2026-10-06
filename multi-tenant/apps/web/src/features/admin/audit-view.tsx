'use client';

import type { AuditLogItem, Paginated } from '@repo/contracts';
import { Button, EmptyState, Input, Panel } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardList, SearchX } from 'lucide-react';
import { useMessages, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ClearFiltersButton, SelectFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { PanelSkeleton, QueryError } from '@/components/states';
import { AuditFeed } from '@/features/audit/audit-feed';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';

const PARAM_KEYS = ['action', 'from', 'to'] as const;
const PAGE_SIZE = 30;

/** Append-only audit trail of the organization (who did what, when, from which request). */
export function AuditView() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const messages = useMessages();
  const { values, page, update, clear } = useListParams(PARAM_KEYS);
  const params = {
    page,
    pageSize: PAGE_SIZE,
    action: values.action,
    from: values.from,
    to: values.to,
  };
  const audit = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: ({ signal }) => api.get<Paginated<AuditLogItem>>('/audit-logs', params, signal),
    placeholderData: keepPreviousData,
  });

  // Every action the catalog knows, e.g. "payment.reversed" → "Tahsilat ters kaydedildi".
  const actionOptions = useMemo(
    () =>
      Object.entries(messages.admin.audit.actions).flatMap(([resource, actions]) =>
        Object.entries(actions).map(([action, label]) => ({
          value: `${resource}.${action}`,
          label: String(label),
        })),
      ),
    [messages],
  );

  const hasFilters = Boolean(values.action || values.from || values.to);
  const pageCount = audit.data ? Math.max(1, Math.ceil(audit.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2.5">
          <SelectFilter
            label={t('filters.action')}
            value={values.action}
            onChange={(action) => update({ action })}
            options={actionOptions}
            className="min-w-[220px]"
          />
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
          {hasFilters ? <ClearFiltersButton onClick={() => clear()} /> : null}
        </div>
        {audit.isPending ? (
          <div className="p-4">
            <PanelSkeleton rows={8} />
          </div>
        ) : audit.isError ? (
          <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.data.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<SearchX />}
              title={tc('noResults')}
              description={tc('noResultsHint')}
            />
          ) : (
            <EmptyState icon={<ClipboardList />} title={t('emptyTitle')} />
          )
        ) : (
          <AuditFeed items={audit.data.items} showResource />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-3 py-2.5 text-xs text-fg-muted">
          <span className="tabular">
            {audit.data ? tc('rowsTotal', { total: audit.data.total }) : ' '}
          </span>
          <div className="flex items-center gap-3">
            <span className="tabular">{tc('page', { page, pages: pageCount })}</span>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => update({ page: page - 1 })}
              disabled={page <= 1}
              aria-label={tc('previousPage')}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => update({ page: page + 1 })}
              disabled={page >= pageCount}
              aria-label={tc('nextPage')}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
