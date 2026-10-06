'use client';

import type { StudentDetail, StudentFinance } from '@repo/contracts';
import { Badge, Button, Panel, PanelBody, PanelHeader, Skeleton } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DescriptionList } from '@/components/description-list';
import { Money } from '@/components/money';
import { usePermissions } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';

export function useStudentFinance(studentId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.studentFinance(studentId),
    queryFn: ({ signal }) =>
      api.get<StudentFinance>(`/finance/students/${studentId}`, undefined, signal),
    enabled,
  });
}

export function StudentOverview({
  student,
  onOpenTab,
}: {
  student: StudentDetail;
  onOpenTab: (tab: 'guardians' | 'finance') => void;
}) {
  const t = useTranslations('students');
  const format = useFormat();
  const { can, moduleEnabled } = usePermissions();
  const canSeeFinance = can('finance.collections.read') && moduleEnabled('finance');
  const primaryGuardian =
    student.guardians?.find((guardian) => guardian.isPrimaryContact) ?? student.guardians?.[0];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Panel>
          <PanelHeader title={t('profile.enrollment')} />
          <PanelBody>
            <DescriptionList
              items={[
                { label: t('profile.academicYear'), value: student.enrollment?.academicYear.name },
                {
                  label: t('profile.gradeLevel'),
                  value: student.enrollment?.gradeLevel?.name ?? student.gradeLevelName,
                },
                {
                  label: t('profile.classes'),
                  value: student.classes.length
                    ? student.classes.map((klass) => klass.name).join(', ')
                    : null,
                },
                {
                  label: t('profile.enrolledOn'),
                  value: student.enrollment
                    ? format.date(student.enrollment.enrolledOn, 'medium')
                    : null,
                },
                { label: t('form.branch'), value: student.branch.name },
              ]}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title={t('profile.contact')} />
          <PanelBody>
            <DescriptionList
              items={[
                { label: t('form.phone'), value: student.phone },
                { label: t('form.email'), value: student.email },
                { label: t('form.address'), value: student.address, wide: true },
              ]}
            />
          </PanelBody>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        {canSeeFinance ? (
          <FinanceSnapshot studentId={student.id} onOpen={() => onOpenTab('finance')} />
        ) : null}
        {student.guardians !== undefined ? (
          <Panel>
            <PanelHeader
              title={t('form.guardianSection')}
              actions={
                <Button variant="link" size="sm" onClick={() => onOpenTab('guardians')}>
                  {t('profile.allGuardians')}
                </Button>
              }
            />
            <PanelBody>
              {primaryGuardian ? (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-fg">{primaryGuardian.fullName}</p>
                  <p className="text-xs text-fg-muted">
                    {t(`relationship.${primaryGuardian.relationship}`)}
                  </p>
                  {primaryGuardian.phone ? (
                    <a
                      href={`tel:${primaryGuardian.phone.replace(/[^0-9+]/g, '')}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Phone className="size-3.5" aria-hidden="true" />
                      {primaryGuardian.phone}
                    </a>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {primaryGuardian.isPrimaryContact ? (
                      <Badge tone="info">{t('form.primaryContact')}</Badge>
                    ) : null}
                    {primaryGuardian.isFinanciallyResponsible ? (
                      <Badge tone="neutral">{t('form.financiallyResponsible')}</Badge>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">{t('profile.noGuardians')}</p>
              )}
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function FinanceSnapshot({ studentId, onOpen }: { studentId: string; onOpen: () => void }) {
  const t = useTranslations('finance.student');
  const ts = useTranslations('students.profile');
  const format = useFormat();
  const finance = useStudentFinance(studentId);

  return (
    <Panel>
      <PanelHeader
        title={t('balance')}
        actions={
          <Button variant="link" size="sm" onClick={onOpen}>
            {ts('openFinance')}
            <ArrowRight className="size-3.5" />
          </Button>
        }
      />
      <PanelBody>
        {finance.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : finance.isError ? (
          <QueryError
            error={finance.error}
            onRetry={() => void finance.refetch()}
            className="py-4"
          />
        ) : finance.data.accounts.length === 0 ? (
          <div>
            <p className="text-sm font-medium text-fg">{t('noAgreement')}</p>
            <p className="mt-1 text-xs text-fg-muted">{t('noAgreementHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {finance.data.accounts.map((account) => (
              <div key={account.accountId} className="flex flex-col gap-2">
                <div>
                  <p className="text-xs text-fg-muted">{t('outstanding')}</p>
                  <p className="text-xl font-semibold tracking-tight text-fg">
                    <Money amountMinor={account.outstandingMinor} currency={account.currency} />
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-fg-muted">{t('overdue')}</p>
                    <Money
                      amountMinor={account.overdueMinor}
                      currency={account.currency}
                      muteZero
                      className={
                        account.overdueMinor > 0 ? 'font-medium text-danger-fg' : undefined
                      }
                    />
                  </div>
                  <div>
                    <p className="text-xs text-fg-muted">{t('nextDue')}</p>
                    {account.nextDue ? (
                      <p className="tabular">
                        {t('nextDueValue', {
                          amount: format.money(account.nextDue.amountMinor, account.currency),
                          date: format.date(account.nextDue.dueDate),
                        })}
                      </p>
                    ) : (
                      <p className="text-fg-subtle">—</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
