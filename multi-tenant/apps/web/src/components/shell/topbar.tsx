'use client';

import { Button, Kbd } from '@repo/ui';
import { Menu, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { UserMenu } from './user-menu';

const noopSubscribe = () => () => undefined;

/** ⌘ on Apple devices, Ctrl elsewhere. Server render assumes Ctrl, then corrects on hydration. */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

export function Topbar({
  onOpenMenu,
  onOpenSearch,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const t = useTranslations('shell');
  const apple = useIsApplePlatform();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label={t('openMenu')}
      >
        <Menu />
      </Button>
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 text-sm text-fg-subtle transition-colors hover:border-line-strong hover:bg-surface"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">{t('search')}</span>
        <span className="hidden items-center gap-0.5 sm:flex" aria-hidden="true">
          <Kbd>{apple ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <UserMenu />
      </div>
    </header>
  );
}
