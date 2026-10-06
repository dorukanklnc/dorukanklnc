'use client';

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, LogOut, MonitorSmartphone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setLocaleCookie } from '@/components/locale-switcher';
import { useSession } from '@/components/session/session-context';
import { LOCALES, type Locale } from '@/i18n/config';
import { api } from '@/lib/api/client';
import { clearRecentItems } from '@/lib/recent-items';
import { useErrorMessage } from '@/lib/use-error-message';
import { hardNavigate } from '@/lib/hard-navigate';

export function UserMenu() {
  const t = useTranslations('shell');
  const session = useSession();
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [, startTransition] = useTransition();
  const [confirmAll, setConfirmAll] = useState(false);

  // Leaving with a full navigation drops all cached data of this session.
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clearRecentItems();
      hardNavigate('/login');
    },
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      clearRecentItems();
      hardNavigate('/login');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changeLocale = (next: Locale) => {
    if (next === locale) return;
    setLocaleCookie(next);
    startTransition(() => router.refresh());
  };

  const role = session.activeMembership?.roles.map((r) => r.name).join(', ');

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left transition-colors hover:bg-surface-hover"
          aria-label={t('userMenu')}
        >
          <Avatar name={session.user.fullName} />
          <span className="hidden min-w-0 md:block">
            <span className="block max-w-[180px] truncate text-sm font-medium leading-4 text-fg">
              {session.user.fullName}
            </span>
            {role ? (
              <span className="block max-w-[180px] truncate text-2xs text-fg-subtle">{role}</span>
            ) : null}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium text-fg">{session.user.fullName}</p>
            <p className="truncate text-xs text-fg-muted">{session.user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserRound />
              {t('account')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
            {LOCALES.map((option) => (
              <DropdownMenuItem key={option} onSelect={() => changeLocale(option)}>
                <span className="w-4" aria-hidden="true">
                  {option === locale ? <Check className="!text-primary" /> : null}
                </span>
                {t(`languages.${option}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut />
            {t('logout')}
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={() => setConfirmAll(true)}>
            <MonitorSmartphone />
            {t('logoutAll')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('logoutAll')}
        description={t('logoutAllConfirm')}
        confirmLabel={t('logoutAll')}
        tone="danger"
        loading={logoutAll.isPending || logoutAll.isSuccess}
        onConfirm={() => logoutAll.mutate()}
      />
    </>
  );
}
