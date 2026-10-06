'use client';

import type { Dashboard } from '@repo/contracts';
import { Badge, Button, EmptyState, Panel, PanelBody, PanelHeader, Skeleton, Stat } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  MailPlus,
  School,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { AuditFeed } from '@/features/audit/audit-feed';
import { AgingChart, BarList, MonthlyChart } from '@/features/finance/charts';
import {
  CollectionsKpis,
  FinanceKpiStrip,
  TopOverdueAccounts,
  UpcomingReceivables,
} from '@/features/finance/collections-widgets';
import { ROUTE_ACCESS } from '@/lib/access';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';

/**
 * One dashboard, many roles: the API returns only the sections the member is entitled to and
 * the client renders whatever arrives. A teacher never receives finance data at all.
 */
export function DashboardView() {
  const t = useTranslations('dashboard');
  const session = useSession();
  const format = useFormat();
  const dashboard = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: ({ signal }) => api.get<Dashboard>('/dashboard', undefined, signal),
    refetchInterval: 5 * 60_000,
  });

  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
  const header = (
    <PageHeader
      title={t('greeting', { name: firstName })}
      description={t('subtitle', {
        organization: session.activeOrganization?.name ?? '',
        date: format.date(format.today(), 'long'),
      })}
    />
  );

  if (dashboard.isPending) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-24" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </>
    );
  }
  if (dashboard.isError) {
    return (
      <>
        {header}
        <Panel>
          <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Panel>
      </>
    );
  }

  const data = dashboard.data;
  const empty =
    !data.finance && !data.financeKpis && !data.students && !data.teaching && !data.administration;

  return (
    <>
      {header}
      <div className="flex flex-col gap-4">
        {empty ? (
          <Panel>
            <EmptyState
              icon={<LayoutDashboard />}
              title={t('emptyTitle')}
              description={t('emptyHint')}
            />
          </Panel>
        ) : null}

        {data.finance ? (
          <FinanceSection data={data} />
        ) : data.financeKpis ? (
          <FinanceKpiStrip kpis={data.financeKpis} />
        ) : null}

        {data.teaching ? <TeachingSection teaching={data.teaching} /> : null}

        {data.students || data.administration ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {data.students ? <StudentsSection students={data.students} /> : null}
            {data.administration ? (
              <AdministrationSection administration={data.administration} />
            ) : null}
          </div>
        ) : null}

        {data.recentActivity ? (
          <Panel>
            <PanelHeader
              title={t('activity.title')}
              actions={
                <Link
                  href="/admin/audit"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('activity.viewAll')}
                </Link>
              }
            />
            {data.recentActivity.length === 0 ? (
              <EmptyState icon={<ClipboardList />} title={t('activity.empty')} className="py-8" />
            ) : (
              <AuditFeed items={data.recentActivity} showResource />
            )}
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function FinanceSection({ data }: { data: Dashboard }) {
  const t = useTranslations('dashboard.finance');
  const tc = useTranslations('finance.collections');
  const summary = data.finance;
  if (!summary) return null;
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{t('title')}</h2>
        <Button asChild variant="link" size="sm">
          <Link href="/finance">
            {t('openCollections')}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
      <CollectionsKpis summary={summary} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title={tc('monthly')} description={tc('monthlyHint')} />
          <PanelBody>
            <MonthlyChart
              monthly={summary.monthly}
              currency={summary.currency}
              currentMonth={summary.asOf.slice(0, 7)}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title={tc('aging')} description={tc('agingHint')} />
          <PanelBody>
            <AgingChart aging={summary.aging} currency={summary.currency} />
          </PanelBody>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UpcomingReceivables summary={summary} limit={6} />
        </div>
        <TopOverdueAccounts summary={summary} />
      </div>
    </>
  );
}

function TeachingSection({ teaching }: { teaching: NonNullable<Dashboard['teaching']> }) {
  const t = useTranslations('dashboard.teaching');
  const format = useFormat();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <PanelHeader title={t('title')} description={t('description')} />
        {teaching.classes.length === 0 ? (
          <EmptyState icon={<School />} title={t('empty')} className="py-8" />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {teaching.classes.map((klass) => (
              <li key={klass.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{klass.name}</p>
                  <p className="text-xs text-fg-muted">
                    {[klass.gradeLevel, klass.branch.name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {klass.role === 'homeroom' ? (
                    <Badge tone="info">{t('homeroom')}</Badge>
                  ) : klass.subject ? (
                    <Badge tone="neutral">{t('subject', { subject: klass.subject })}</Badge>
                  ) : null}
                  <Link
                    href={`/students?classId=${klass.id}`}
                    className="tabular whitespace-nowrap text-sm text-primary hover:underline"
                  >
                    {t('students', { count: klass.studentCount })}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <Stat
          icon={<GraduationCap />}
          label={t('assignedStudents')}
          value={format.number(teaching.assignedStudentCount)}
        />
        <p className="border-t border-line-subtle px-4 py-3 text-xs text-fg-muted">
          {t('attendancePlanned')}
        </p>
      </Panel>
    </div>
  );
}

function StudentsSection({ students }: { students: NonNullable<Dashboard['students']> }) {
  const t = useTranslations('dashboard.students');
  const format = useFormat();
  return (
    <Panel className="lg:col-span-2">
      <PanelHeader
        title={t('title')}
        actions={
          <Link href="/students" className="text-xs font-medium text-primary hover:underline">
            {t('viewAll')}
          </Link>
        }
      />
      <div className="grid grid-cols-1 divide-y divide-line-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          icon={<GraduationCap />}
          label={t('active')}
          value={format.number(students.activeCount)}
        />
        <Stat
          icon={<UserPlus />}
          label={t('newThisMonth')}
          value={format.number(students.newThisMonth)}
        />
        <Stat
          icon={<ClipboardList />}
          label={t('incomplete')}
          value={format.number(students.incompleteRecords)}
          hint={t('incompleteHint')}
          tone={students.incompleteRecords > 0 ? 'warning' : 'default'}
        />
      </div>
      {students.byBranch.length > 1 ? (
        <div className="border-t border-line-subtle px-4 py-4">
          <p className="mb-3 text-xs font-medium text-fg-muted">{t('byBranch')}</p>
          <BarList
            items={students.byBranch.map((branch) => ({
              key: branch.id,
              label: branch.name,
              value: branch.activeCount,
            }))}
            valueFormatter={format.number}
          />
        </div>
      ) : null}
    </Panel>
  );
}

function AdministrationSection({
  administration,
}: {
  administration: NonNullable<Dashboard['administration']>;
}) {
  const t = useTranslations('dashboard.administration');
  const format = useFormat();
  const { allows } = usePermissions();
  const canUsers = allows(ROUTE_ACCESS.users);
  const rows = [
    {
      icon: Users,
      label: t('activeMembers'),
      value: administration.activeMembers,
      href: canUsers ? '/admin/users' : null,
    },
    {
      icon: MailPlus,
      label: t('pendingInvitations'),
      value: administration.pendingInvitations,
      href: canUsers ? '/admin/users?status=invited' : null,
    },
    {
      icon: Building2,
      label: t('branches'),
      value: administration.branchCount,
      href: allows(ROUTE_ACCESS.branches) ? '/admin/branches' : null,
    },
  ];
  return (
    <Panel>
      <PanelHeader title={t('title')} />
      <ul className="divide-y divide-line-subtle">
        {rows.map((row) => {
          const content = (
            <>
              <row.icon className="size-4 text-fg-subtle" aria-hidden="true" />
              <span className="flex-1 text-sm text-fg">{row.label}</span>
              <span className="tabular text-sm font-semibold text-fg">
                {format.number(row.value)}
              </span>
            </>
          );
          return (
            <li key={row.label}>
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
