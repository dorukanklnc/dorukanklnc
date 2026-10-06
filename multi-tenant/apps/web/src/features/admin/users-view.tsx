'use client';

import type { Member, MembershipStatus, Paginated } from '@repo/contracts';
import { membershipStatusSchema } from '@repo/contracts';
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Tooltip,
} from '@repo/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  MailPlus,
  MoreHorizontal,
  RotateCcw,
  SearchX,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { ClearFiltersButton, SearchFilter, SelectFilter } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';
import { MemberAccessSheet } from './member-access-sheet';
import { useRoles } from './queries';

const PARAM_KEYS = ['q', 'status', 'roleId', 'branchId', 'invite'] as const;
const STATUS_TONES: Record<MembershipStatus, BadgeTone> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
};

export function UsersView() {
  const t = useTranslations('admin.users');
  const tc = useTranslations('common');
  const format = useFormat();
  const session = useSession();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const { can } = usePermissions();
  const canManage = can('settings.users.manage');
  const { values, page, pageSize, update, clear } = useListParams(PARAM_KEYS);
  const [editing, setEditing] = useState<Member | null>(null);
  const [suspending, setSuspending] = useState<Member | null>(null);

  const params = {
    page,
    pageSize,
    q: values.q,
    status: values.status,
    roleId: values.roleId,
    branchId: values.branchId,
  };
  const members = useQuery({
    queryKey: queryKeys.members.list(params),
    queryFn: ({ signal }) => api.get<Paginated<Member>>('/members', params, signal),
    placeholderData: keepPreviousData,
  });
  const roles = useRoles();

  const action = useMutation({
    mutationFn: ({
      member,
      kind,
    }: {
      member: Member;
      kind: 'suspend' | 'reactivate' | 'resend-invitation';
    }) => api.post<Member>(`/members/${member.id}/${kind}`),
    onSuccess: (_member, { kind }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
      toast.success(
        kind === 'suspend'
          ? t('suspended')
          : kind === 'reactivate'
            ? t('reactivated')
            : t('invitationResent'),
      );
      setSuspending(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: 'name',
        header: t('columns.name'),
        meta: { label: t('columns.name'), required: true, className: 'min-w-[220px]' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={row.original.fullName} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium text-fg">
                {row.original.fullName}
                {row.original.title ? (
                  <span className="font-normal text-fg-muted"> · {row.original.title}</span>
                ) : null}
              </span>
              <span className="truncate text-xs text-fg-muted">{row.original.email}</span>
            </span>
          </span>
        ),
      },
      {
        id: 'roles',
        header: t('columns.roles'),
        meta: { label: t('columns.roles') },
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role.id} tone="neutral">
                {role.name}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        id: 'branches',
        header: t('columns.branches'),
        meta: { label: t('columns.branches') },
        cell: ({ row }) =>
          row.original.allBranches ? (
            <span className="text-fg-muted">{t('allBranches')}</span>
          ) : (
            <span className="text-fg-muted">
              {row.original.branches.map((branch) => branch.name).join(', ')}
            </span>
          ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        meta: { label: t('columns.status') },
        cell: ({ row }) => (
          <Badge tone={STATUS_TONES[row.original.status]} dot>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'lastLogin',
        header: t('columns.lastLogin'),
        meta: { label: t('columns.lastLogin') },
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <Tooltip content={format.dateTime(row.original.lastLoginAt)}>
              <span className="text-fg-muted">{format.relative(row.original.lastLoginAt)}</span>
            </Tooltip>
          ) : (
            <span className="text-fg-subtle">{t('never')}</span>
          ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">{tc('actions')}</span>,
              meta: { required: true, className: 'w-12' },
              cell: ({ row }) => {
                const member = row.original;
                if (member.id === session.activeMembership?.id) return null;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={tc('actions')}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(member)}>
                        <ShieldCheck />
                        {t('actions.editAccess')}
                      </DropdownMenuItem>
                      {member.status === 'invited' ? (
                        <DropdownMenuItem
                          onSelect={() => action.mutate({ member, kind: 'resend-invitation' })}
                        >
                          <Send />
                          {t('actions.resendInvitation')}
                        </DropdownMenuItem>
                      ) : null}
                      {member.status === 'suspended' ? (
                        <DropdownMenuItem
                          onSelect={() => action.mutate({ member, kind: 'reactivate' })}
                        >
                          <RotateCcw />
                          {t('actions.reactivate')}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem tone="danger" onSelect={() => setSuspending(member)}>
                          <Ban />
                          {t('actions.suspend')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } satisfies ColumnDef<Member>,
          ]
        : []),
    ],
    [t, tc, format, canManage, session.activeMembership?.id, action],
  );

  const hasFilters = Boolean(values.q || values.status || values.roleId || values.branchId);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              leadingIcon={<UserPlus />}
              onClick={() => update({ invite: '1' }, { resetPage: false })}
            >
              {t('invite')}
            </Button>
          ) : null
        }
      />
      <DataTable
        tableId="members"
        columns={columns}
        rows={members.data?.items}
        total={members.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(next) => update({ page: next })}
        onPageSizeChange={(size) => update({ pageSize: size })}
        isLoading={members.isPending}
        isFetching={members.isFetching}
        error={members.error}
        onRetry={() => void members.refetch()}
        getRowId={(row) => row.id}
        toolbar={
          <>
            <SearchFilter
              value={values.q}
              onChange={(q) => update({ q })}
              placeholder={t('searchPlaceholder')}
            />
            <SelectFilter
              label={t('columns.status')}
              value={values.status}
              onChange={(status) => update({ status })}
              options={membershipStatusSchema.options.map((status) => ({
                value: status,
                label: t(`status.${status}`),
              }))}
            />
            {roles.data ? (
              <SelectFilter
                label={t('roles')}
                value={values.roleId}
                onChange={(roleId) => update({ roleId })}
                options={roles.data.map((role) => ({ value: role.id, label: role.name }))}
              />
            ) : null}
            {session.branches.length > 1 ? (
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
            {hasFilters ? <ClearFiltersButton onClick={() => clear(['pageSize'])} /> : null}
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
              icon={<Users />}
              title={t('emptyTitle')}
              action={
                canManage ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={<MailPlus />}
                    onClick={() => update({ invite: '1' }, { resetPage: false })}
                  >
                    {t('invite')}
                  </Button>
                ) : null
              }
            />
          )
        }
      />
      {canManage ? (
        <>
          <MemberAccessSheet
            mode={{ kind: 'invite' }}
            open={values.invite === '1'}
            onOpenChange={(open) => {
              if (!open) update({ invite: undefined }, { resetPage: false });
            }}
          />
          {editing ? (
            <MemberAccessSheet
              mode={{ kind: 'edit', member: editing }}
              open
              onOpenChange={(open) => {
                if (!open) setEditing(null);
              }}
            />
          ) : null}
          <ConfirmDialog
            open={suspending !== null}
            onOpenChange={(open) => {
              if (!open) setSuspending(null);
            }}
            title={t('suspendTitle', { name: suspending?.fullName ?? '' })}
            description={t('suspendDescription')}
            confirmLabel={t('actions.suspend')}
            tone="danger"
            loading={action.isPending}
            onConfirm={() => {
              if (suspending) action.mutate({ member: suspending, kind: 'suspend' });
            }}
          />
        </>
      ) : null}
    </>
  );
}
