'use client';

import type { AuditLogItem, Paginated } from '@repo/contracts';
import { EmptyState, Panel, PanelHeader } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PanelSkeleton, QueryError } from '@/components/states';
import { AuditFeed } from '@/features/audit/audit-feed';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';

export function StudentHistory({ studentId }: { studentId: string }) {
  const t = useTranslations('students.profile');
  const params = { resourceType: 'student', resourceId: studentId, pageSize: 50 };
  const history = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: ({ signal }) => api.get<Paginated<AuditLogItem>>('/audit-logs', params, signal),
  });

  if (history.isPending) return <PanelSkeleton rows={5} />;
  return (
    <Panel>
      <PanelHeader title={t('tabs.history')} />
      {history.isError ? (
        <QueryError error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data.items.length === 0 ? (
        <EmptyState icon={<History />} title={t('historyEmpty')} />
      ) : (
        <AuditFeed items={history.data.items} />
      )}
    </Panel>
  );
}
