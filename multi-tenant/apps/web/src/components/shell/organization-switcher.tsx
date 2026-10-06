'use client';

import type { Session } from '@repo/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
  Tooltip,
  cn,
  initials,
} from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Globe } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAccess, useSession } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { useErrorMessage } from '@/lib/use-error-message';
import { hardNavigate } from '@/lib/hard-navigate';

/** Shows the active organization and switches between the member's organizations. */
export function OrganizationSwitcher({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('shell');
  const tc = useTranslations('common');
  const session = useSession();
  const access = useAccess();
  const errorMessage = useErrorMessage();
  const organization = session.activeOrganization;
  const memberships = session.memberships.filter((membership) => membership.status === 'active');
  const hasPlatform = access.platformPermissions.has('platform.organizations.manage');

  const switchOrganization = useMutation({
    mutationFn: (organizationId: string) =>
      api.post<Session>('/auth/session/organization', { organizationId }),
    // Full reload: nothing cached for the previous organization survives the switch.
    onSuccess: () => hardNavigate('/dashboard'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const name = organization?.name ?? t('platformConsole');
  const scope = session.activeMembership
    ? session.activeMembership.allBranches
      ? tc('allBranches')
      : t('branchScope', { count: session.activeMembership.branchIds.length })
    : null;
  const canOpen = memberships.length > 1 || hasPlatform;

  const trigger = (
    <button
      type="button"
      disabled={!canOpen}
      className={cn(
        'flex w-full min-w-0 items-center gap-2.5 rounded-md border border-transparent text-left transition-colors',
        collapsed ? 'justify-center p-1' : 'px-2 py-1.5',
        canOpen && 'hover:border-line hover:bg-surface',
        'disabled:cursor-default',
      )}
      aria-label={t('switchOrganization')}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gray-800 text-2xs font-semibold text-white">
        {organization ? (
          initials(organization.name)
        ) : (
          <Globe className="size-3.5" aria-hidden="true" />
        )}
      </span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{name}</span>
            {scope ? <span className="block truncate text-2xs text-fg-subtle">{scope}</span> : null}
          </span>
          {switchOrganization.isPending ? (
            <Spinner className="size-3.5 text-fg-subtle" />
          ) : canOpen ? (
            <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          ) : null}
        </>
      )}
    </button>
  );

  if (!canOpen)
    return collapsed ? (
      <Tooltip content={name} side="right">
        {trigger}
      </Tooltip>
    ) : (
      trigger
    );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip content={name} side="right">
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align="start"
        side={collapsed ? 'right' : 'bottom'}
        className="min-w-[240px]"
      >
        <DropdownMenuLabel>{t('organizations')}</DropdownMenuLabel>
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.membershipId}
            disabled={switchOrganization.isPending}
            onSelect={() => {
              if (membership.organizationId !== organization?.id) {
                switchOrganization.mutate(membership.organizationId);
              }
            }}
          >
            <span className="flex size-5 items-center justify-center rounded-sm bg-gray-100 text-2xs font-semibold text-fg-muted">
              {initials(membership.organizationName)}
            </span>
            <span className="flex-1 truncate">{membership.organizationName}</span>
            {membership.organizationId === organization?.id ? (
              <Check className="!text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {hasPlatform ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/platform/organizations">
                <Globe />
                {t('platformConsole')}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
