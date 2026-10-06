'use client';

import { EmptyState, Panel, TBody, THead, Table, TableContainer, Td, Th, Tr, cn } from '@repo/ui';
import { School } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SelectFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { useSession } from '@/components/session/session-context';
import { PanelSkeleton, QueryError } from '@/components/states';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { useClasses } from './queries';

const PARAM_KEYS = ['branchId'] as const;

export function ClassesView() {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const format = useFormat();
  const session = useSession();
  const { values, update } = useListParams(PARAM_KEYS);
  const classes = useClasses({ branchId: values.branchId });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          session.branches.length > 1 ? (
            <SelectFilter
              label={tc('branch')}
              value={values.branchId}
              onChange={(branchId) => update({ branchId })}
              options={session.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
          ) : null
        }
      />
      {classes.isPending ? (
        <PanelSkeleton rows={6} />
      ) : classes.isError ? (
        <Panel>
          <QueryError error={classes.error} onRetry={() => void classes.refetch()} />
        </Panel>
      ) : classes.data.length === 0 ? (
        <Panel>
          <EmptyState icon={<School />} title={t('emptyTitle')} />
        </Panel>
      ) : (
        <Panel>
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>{t('columns.name')}</Th>
                  <Th>{t('columns.gradeLevel')}</Th>
                  {session.branches.length > 1 ? <Th>{t('columns.branch')}</Th> : null}
                  <Th>{t('columns.homeroom')}</Th>
                  <Th className="w-56">{t('columns.capacity')}</Th>
                  <Th className="text-right">{t('columns.students')}</Th>
                </Tr>
              </THead>
              <TBody>
                {classes.data.map((klass) => {
                  const ratio = klass.capacity ? klass.studentCount / klass.capacity : null;
                  return (
                    <Tr key={klass.id}>
                      <Td className="font-medium">{klass.name}</Td>
                      <Td className="text-fg-muted">{klass.gradeLevel?.name ?? '—'}</Td>
                      {session.branches.length > 1 ? (
                        <Td className="text-fg-muted">{klass.branch.name}</Td>
                      ) : null}
                      <Td>
                        {klass.homeroomTeacher?.name ?? <span className="text-fg-subtle">—</span>}
                      </Td>
                      <Td>
                        {ratio === null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted"
                              aria-hidden="true"
                            >
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  ratio > 1
                                    ? 'bg-danger'
                                    : ratio > 0.9
                                      ? 'bg-warning'
                                      : 'bg-chart-1',
                                )}
                                style={{ width: `${Math.min(100, ratio * 100)}%` }}
                              />
                            </span>
                            <span className="tabular text-xs text-fg-muted">
                              {format.number(klass.studentCount)}/
                              {format.number(klass.capacity ?? 0)}
                            </span>
                          </span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={`/students?classId=${klass.id}`}
                          className="tabular text-primary hover:underline"
                        >
                          {t('viewStudents')} ({format.number(klass.studentCount)})
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        </Panel>
      )}
    </>
  );
}
