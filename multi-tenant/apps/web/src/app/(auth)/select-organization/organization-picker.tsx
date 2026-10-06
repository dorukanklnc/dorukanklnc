'use client';

import type { MembershipSummary, Session } from '@repo/contracts';
import { Badge, Button, Spinner, cn } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { Building2, ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert, AuthCard } from '@/components/form-bits';
import { api } from '@/lib/api/client';
import { clearRecentItems } from '@/lib/recent-items';
import { useErrorMessage } from '@/lib/use-error-message';
import { hardNavigate } from '@/lib/hard-navigate';

export function OrganizationPicker({
  memberships,
  activeOrganizationId,
  hasPlatformAccess,
}: {
  memberships: MembershipSummary[];
  activeOrganizationId: string | null;
  hasPlatformAccess: boolean;
}) {
  const t = useTranslations('auth.selectOrganization');
  const ts = useTranslations('shell');
  const errorMessage = useErrorMessage();

  const select = useMutation({
    mutationFn: (organizationId: string) =>
      api.post<Session>('/auth/session/organization', { organizationId }),
    onSuccess: () => hardNavigate('/dashboard'),
  });
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clearRecentItems();
      hardNavigate('/login');
    },
  });

  return (
    <AuthCard
      title={t('title')}
      description={memberships.length > 0 ? t('description') : undefined}
      footer={
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {ts('logout')}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {select.isError ? <Alert>{errorMessage(select.error)}</Alert> : null}
        {memberships.length === 0 ? <Alert tone="info">{t('empty')}</Alert> : null}
        <ul className="flex flex-col gap-2">
          {memberships.map((membership) => {
            const selectable = membership.status === 'active';
            const pending = select.isPending && select.variables === membership.organizationId;
            return (
              <li key={membership.membershipId}>
                <button
                  type="button"
                  disabled={!selectable || select.isPending || select.isSuccess}
                  onClick={() => select.mutate(membership.organizationId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border border-line px-3 py-2.5 text-left transition-colors',
                    selectable
                      ? 'hover:border-line-strong hover:bg-surface-hover'
                      : 'cursor-not-allowed opacity-70',
                    membership.organizationId === activeOrganizationId &&
                      'border-primary bg-surface-selected',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-fg-muted">
                    <Building2 className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {membership.organizationName}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {membership.organizationSlug}
                    </span>
                  </span>
                  {membership.status === 'invited' ? (
                    <Badge tone="info">{t('invited')}</Badge>
                  ) : null}
                  {membership.status === 'suspended' ? (
                    <Badge tone="warning">{t('suspended')}</Badge>
                  ) : null}
                  {selectable ? (
                    pending ? (
                      <Spinner className="text-fg-subtle" />
                    ) : (
                      <ChevronRight className="size-4 text-fg-subtle" aria-hidden="true" />
                    )
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {hasPlatformAccess ? (
          <Button asChild variant="secondary" className="w-full">
            <Link href="/platform/organizations">{ts('platformConsole')}</Link>
          </Button>
        ) : null}
      </div>
    </AuthCard>
  );
}
