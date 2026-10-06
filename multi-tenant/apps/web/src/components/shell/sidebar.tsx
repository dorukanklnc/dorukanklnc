'use client';

import { Tooltip, cn } from '@repo/ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/brand';
import { type NavGroup, activeNavHref } from '@/lib/navigation';
import { OrganizationSwitcher } from './organization-switcher';

export function Sidebar({
  groups,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  groups: readonly NavGroup[];
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname, groups);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-12 shrink-0 items-center gap-2 border-b border-line px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2" onClick={onNavigate}>
          <BrandMark className="size-6" />
          {collapsed ? null : (
            <span className="truncate text-sm font-semibold tracking-tight text-fg">
              {t('app.name')}
            </span>
          )}
        </Link>
      </div>

      <div className={cn('shrink-0 border-b border-line p-2', collapsed && 'flex justify-center')}>
        <OrganizationSwitcher collapsed={collapsed} />
      </div>

      <nav aria-label={t('shell.navigation')} className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.key} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line first:hidden" aria-hidden="true" />
            ) : (
              <p className="mb-1 px-2 text-2xs font-medium text-fg-subtle">
                {t(`nav.groups.${group.key}`)}
              </p>
            )}
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const label = t(`nav.items.${item.key}`);
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors',
                      collapsed ? 'justify-center' : 'px-2',
                      active
                        ? 'bg-surface-selected font-medium text-fg'
                        : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                    )}
                  >
                    <item.icon
                      className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-fg-subtle')}
                      aria-hidden="true"
                    />
                    {collapsed ? (
                      <span className="sr-only">{label}</span>
                    ) : (
                      <span className="truncate">{label}</span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.key}>
                    {collapsed ? (
                      <Tooltip content={label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {onToggleCollapsed ? (
        <div
          className={cn('shrink-0 border-t border-line p-2', collapsed && 'flex justify-center')}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg',
              collapsed ? 'w-8 justify-center' : 'w-full px-2',
            )}
            aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
            {collapsed ? null : <span>{t('shell.collapseSidebar')}</span>}
          </button>
        </div>
      ) : null}
    </div>
  );
}
