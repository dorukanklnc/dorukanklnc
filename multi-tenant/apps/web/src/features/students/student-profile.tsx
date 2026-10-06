'use client';

import type { StudentDetail } from '@repo/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Panel,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, MoreHorizontal, Pencil, Wallet } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { RecordPaymentDialog } from '@/features/finance/record-payment-dialog';
import { StudentFinanceTab } from '@/features/finance/student-finance-tab';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { rememberRecentItem } from '@/lib/recent-items';
import { useErrorMessage } from '@/lib/use-error-message';
import { EditStudentSheet } from './edit-student-sheet';
import { StudentStatusBadge } from './student-badges';
import { StudentGuardians } from './student-guardians';
import { StudentHistory } from './student-history';
import { StudentOverview } from './student-overview';
import { StudentPersonal } from './student-personal';

type TabKey = 'overview' | 'personal' | 'guardians' | 'finance' | 'history';

export function StudentProfile({ studentId }: { studentId: string }) {
  const t = useTranslations('students');
  const tn = useTranslations('nav.items');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const session = useSession();
  const { can, moduleEnabled } = usePermissions();
  const errorMessage = useErrorMessage();

  const student = useQuery({
    queryKey: queryKeys.students.detail(studentId),
    queryFn: ({ signal }) => api.get<StudentDetail>(`/students/${studentId}`, undefined, signal),
  });

  const canSeeFinance = can('finance.collections.read') && moduleEnabled('finance');
  const canRecordPayment = canSeeFinance && can('finance.payments.create');
  const tabs: TabKey[] = [
    'overview',
    'personal',
    ...(can('guardians.read') ? (['guardians'] as const) : []),
    ...(canSeeFinance ? (['finance'] as const) : []),
    ...(can('audit.read') ? (['history'] as const) : []),
  ];
  const requestedTab = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = requestedTab && tabs.includes(requestedTab) ? requestedTab : 'overview';

  // `?action=record-payment` (from the command palette) opens the payment dialog directly.
  const action = searchParams.get('action');
  const [paymentOpen, setPaymentOpen] = useState(action === 'record-payment' && canRecordPayment);
  const [seenAction, setSeenAction] = useState(action);
  if (action !== seenAction) {
    setSeenAction(action);
    if (action === 'record-payment' && canRecordPayment) setPaymentOpen(true);
  }
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const data = student.data;
  const organizationId = session.activeOrganization?.id;
  useEffect(() => {
    if (!data || !organizationId) return;
    rememberRecentItem(session.user.id, organizationId, {
      type: 'student',
      id: data.id,
      title: data.fullName,
      subtitle: [data.studentNumber, data.className].filter(Boolean).join(' · '),
      href: `/students/${data.id}`,
    });
  }, [data, organizationId, session.user.id]);

  const archive = useMutation({
    mutationFn: () => api.delete(`/students/${studentId}`),
    onSuccess: () => {
      setArchiveOpen(false);
      toast.success(t('profile.archived'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (student.isPending) return <ProfileSkeleton />;
  if (student.isError || !data) {
    return (
      <Panel>
        <QueryError error={student.error} onRetry={() => void student.refetch()} />
      </Panel>
    );
  }

  const archived = data.archivedAt !== null;
  const openPayment = () => {
    setPaymentOpen(true);
    if (tab !== 'finance') setParams({ tab: 'finance' });
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: tn('students'), href: '/students' }, { label: data.fullName }]}
        title={data.fullName}
        meta={
          <>
            <StudentStatusBadge status={data.status} archived={archived} />
            <span className="text-sm text-fg-muted">
              {t('profile.studentNumber', { number: data.studentNumber })}
            </span>
            <span className="text-fg-subtle" aria-hidden="true">
              ·
            </span>
            <span className="text-sm text-fg-muted">{data.branch.name}</span>
            {data.className ? (
              <>
                <span className="text-fg-subtle" aria-hidden="true">
                  ·
                </span>
                <span className="text-sm text-fg-muted">{data.className}</span>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {canRecordPayment && !archived ? (
              <Button variant="primary" leadingIcon={<Wallet />} onClick={openPayment}>
                {t('profile.recordPayment')}
              </Button>
            ) : null}
            {can('students.update') && !archived ? (
              <Button
                variant="secondary"
                leadingIcon={<Pencil />}
                onClick={() => setEditOpen(true)}
              >
                {t('profile.edit')}
              </Button>
            ) : null}
            {can('students.archive') && !archived ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label={t('profile.moreActions')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem tone="danger" onSelect={() => setArchiveOpen(true)}>
                    <Archive />
                    {t('profile.archive')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams({ tab: value === 'overview' ? null : value, action: null })
        }
      >
        <TabsList>
          {tabs.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`profile.tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <StudentOverview student={data} onOpenTab={(key) => setParams({ tab: key })} />
        </TabsContent>
        <TabsContent value="personal">
          <StudentPersonal student={data} />
        </TabsContent>
        {tabs.includes('guardians') ? (
          <TabsContent value="guardians">
            <StudentGuardians student={data} />
          </TabsContent>
        ) : null}
        {tabs.includes('finance') ? (
          <TabsContent value="finance">
            <StudentFinanceTab
              student={data}
              onRecordPayment={canRecordPayment && !archived ? openPayment : undefined}
            />
          </TabsContent>
        ) : null}
        {tabs.includes('history') ? (
          <TabsContent value="history">
            <StudentHistory studentId={data.id} />
          </TabsContent>
        ) : null}
      </Tabs>

      {canRecordPayment ? (
        <RecordPaymentDialog
          student={data}
          open={paymentOpen}
          onOpenChange={(open) => {
            setPaymentOpen(open);
            if (!open && action) setParams({ action: null });
          }}
        />
      ) : null}
      {can('students.update') ? (
        <EditStudentSheet student={data} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('profile.archiveTitle')}
        description={t('profile.archiveDescription')}
        confirmLabel={t('profile.archive')}
        tone="danger"
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="mb-3 h-7 w-64" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="mb-5 flex gap-5 border-b border-line pb-3">
        {[80, 110, 70, 60].map((width) => (
          <Skeleton key={width} className="h-4" style={{ width }} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
