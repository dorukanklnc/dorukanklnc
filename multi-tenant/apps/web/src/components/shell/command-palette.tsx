'use client';

import type { SearchResponse, SearchResult, SearchResultType } from '@repo/contracts';
import {
  Badge,
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogPrimitiveContent,
  DialogTitle,
  Kbd,
  Spinner,
  cn,
} from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  AlarmClock,
  ArrowLeft,
  Building2,
  CalendarCheck,
  CornerDownLeft,
  GraduationCap,
  History,
  type LucideIcon,
  School,
  Search,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { usePermissions, useSession } from '@/components/session/session-context';
import { ROUTE_ACCESS } from '@/lib/access';
import { api } from '@/lib/api/client';
import { todayIn } from '@/lib/dates';
import { useDebouncedValue } from '@/lib/hooks';
import type { NavGroup } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';
import { type RecentItem, readRecentItems } from '@/lib/recent-items';
import { matchesSearch } from '@/lib/search-text';
import { useFormat } from '@/lib/use-format';

const RESULT_ICONS: Record<SearchResultType, LucideIcon> = {
  student: GraduationCap,
  guardian: Users,
  class: School,
  payment: Wallet,
  personnel: UserRound,
};

type ActionKey =
  | 'addStudent'
  | 'recordPayment'
  | 'overdue'
  | 'todayPayments'
  | 'inviteUser'
  | 'createOrganization';

interface PaletteAction {
  key: ActionKey;
  icon: LucideIcon;
  /** Navigate directly, or ask for a student first. */
  run: { href: string } | { pickStudent: true };
}

type Mode = 'default' | 'pick-student';

const itemClass =
  'flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2 text-sm text-fg outline-none ' +
  'data-[selected=true]:bg-surface-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle';
const groupClass =
  'px-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 ' +
  '[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle';

/**
 * ⌘K / Ctrl+K: jump to any screen, run a quick action or find a record. Every entry respects the
 * member's permissions: pages come from the filtered navigation, actions check their permission,
 * and record search runs server-side within the member's scope.
 */
export function CommandPalette({
  open,
  initialMode = 'default',
  onOpenChange,
  groups,
}: {
  open: boolean;
  initialMode?: Mode;
  onOpenChange: (open: boolean) => void;
  groups: readonly NavGroup[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const session = useSession();
  const permissions = usePermissions();
  const format = useFormat();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode);
  // Opening the palette (again) starts in the requested mode.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setMode(initialMode);
  }
  const term = useDebouncedValue(query.trim(), 200);
  const searching = term.length >= 2;

  const search = useQuery({
    queryKey: queryKeys.search(term),
    queryFn: ({ signal }) => api.get<SearchResponse>('/search', { q: term, limit: 5 }, signal),
    enabled: open && searching && session.activeOrganization !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const recents = useMemo<RecentItem[]>(
    () =>
      open && session.activeOrganization
        ? readRecentItems(session.user.id, session.activeOrganization.id)
        : [],
    [open, session.user.id, session.activeOrganization],
  );

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];
    const today = todayIn(session.activeOrganization?.timezone ?? 'Europe/Istanbul');
    if (permissions.allows({ ...ROUTE_ACCESS.students, all: ['students.create'] })) {
      list.push({ key: 'addStudent', icon: UserPlus, run: { href: '/students?new=1' } });
    }
    if (
      permissions.allows({
        ...ROUTE_ACCESS.payments,
        all: ['finance.payments.create', 'students.read'],
      })
    ) {
      list.push({ key: 'recordPayment', icon: Wallet, run: { pickStudent: true } });
    }
    if (permissions.allows(ROUTE_ACCESS.receivables)) {
      list.push({ key: 'overdue', icon: AlarmClock, run: { href: '/finance/overdue' } });
    }
    if (permissions.allows(ROUTE_ACCESS.payments)) {
      list.push({
        key: 'todayPayments',
        icon: CalendarCheck,
        run: { href: `/finance/payments?from=${today}&to=${today}` },
      });
    }
    if (permissions.allows({ ...ROUTE_ACCESS.users, all: ['settings.users.manage'] })) {
      list.push({ key: 'inviteUser', icon: UserPlus, run: { href: '/admin/users?invite=1' } });
    }
    if (permissions.allows(ROUTE_ACCESS.platformOrganizations)) {
      list.push({
        key: 'createOrganization',
        icon: Building2,
        run: { href: '/platform/organizations?new=1' },
      });
    }
    return list;
  }, [permissions, session.activeOrganization]);

  const reset = () => {
    setQuery('');
    setMode('default');
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const go = (href: string) => {
    close(false);
    router.push(href);
  };

  const pickStudentMode = mode === 'pick-student';
  const resultGroups = (search.data?.groups ?? []).filter(
    (group) => group.items.length > 0 && (!pickStudentMode || group.type === 'student'),
  );
  const pages = pickStudentMode
    ? []
    : groups.flatMap((group) =>
        group.items
          .map((item) => ({
            ...item,
            label: t(`nav.items.${item.key}`),
            groupLabel: t(`nav.groups.${group.key}`),
          }))
          .filter((item) => matchesSearch(`${item.label} ${item.groupLabel}`, query)),
      );
  const visibleActions = pickStudentMode
    ? []
    : actions.filter((action) =>
        matchesSearch(
          `${t(`command.actionItems.${action.key}`)} ${t(`command.keywords.${action.key}`)}`,
          query,
        ),
      );
  const visibleRecents = pickStudentMode || query.trim() ? [] : recents;
  const nothingStatic =
    pages.length === 0 && visibleActions.length === 0 && visibleRecents.length === 0;
  const waiting = searching && (search.isFetching || term !== query.trim());

  const openResult = (result: SearchResult | RecentItem) => {
    if (pickStudentMode) go(`/students/${result.id}?tab=finance&action=record-payment`);
    else go(result.href);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <DialogPrimitiveContent
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-lg outline-none data-[state=open]:animate-pop-in"
          onEscapeKeyDown={(event) => {
            if (pickStudentMode) {
              event.preventDefault();
              reset();
            }
          }}
        >
          <DialogTitle className="sr-only">{t('command.title')}</DialogTitle>
          <Command shouldFilter={false} loop label={t('command.title')}>
            {pickStudentMode ? (
              <div className="flex items-center gap-2 border-b border-line-subtle bg-surface-muted px-3 py-1.5 text-xs text-fg-muted">
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-surface-hover hover:text-fg"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  {t('common.back')}
                </button>
                <span>{t('command.pickStudent')}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2.5 border-b border-line px-3">
              <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && query === '' && pickStudentMode) reset();
                }}
                placeholder={
                  pickStudentMode ? t('command.pickStudentPlaceholder') : t('command.placeholder')
                }
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              {waiting ? (
                <Spinner className="size-4 text-fg-subtle" label={t('command.searching')} />
              ) : null}
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain py-1">
              {visibleRecents.length > 0 ? (
                <Command.Group heading={t('command.recent')} className={groupClass}>
                  {visibleRecents.map((item) => {
                    const Icon = RESULT_ICONS[item.type];
                    return (
                      <Command.Item
                        key={`recent:${item.type}:${item.id}`}
                        value={`recent:${item.type}:${item.id}`}
                        onSelect={() => openResult(item)}
                        className={itemClass}
                      >
                        <History />
                        <ResultLabel title={item.title} subtitle={item.subtitle} icon={<Icon />} />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ) : null}

              {visibleActions.length > 0 ? (
                <Command.Group heading={t('command.actions')} className={groupClass}>
                  {visibleActions.map((action) => (
                    <Command.Item
                      key={action.key}
                      value={`action:${action.key}`}
                      onSelect={() => {
                        if ('href' in action.run) go(action.run.href);
                        else {
                          setMode('pick-student');
                          setQuery('');
                        }
                      }}
                      className={itemClass}
                    >
                      <action.icon />
                      <span className="flex-1 truncate">
                        {t(`command.actionItems.${action.key}`)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {resultGroups.map((group) => {
                const Icon = RESULT_ICONS[group.type];
                return (
                  <Command.Group
                    key={group.type}
                    heading={t(`command.types.${group.type}`)}
                    className={groupClass}
                  >
                    {group.items.map((result) => (
                      <Command.Item
                        key={`${result.type}:${result.id}`}
                        value={`result:${result.type}:${result.id}`}
                        onSelect={() => openResult(result)}
                        className={itemClass}
                      >
                        <Icon />
                        <ResultLabel title={result.title} subtitle={result.subtitle} />
                        {result.meta?.amountMinor !== undefined && result.meta.currency ? (
                          <span className="flex shrink-0 items-center gap-2">
                            {result.meta.reversed ? (
                              <Badge tone="danger">{t('finance.payments.status.reversed')}</Badge>
                            ) : null}
                            <span
                              className={cn(
                                'tabular text-xs text-fg-muted',
                                result.meta.reversed && 'line-through',
                              )}
                            >
                              {format.money(result.meta.amountMinor, result.meta.currency)}
                            </span>
                          </span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {pages.length > 0 ? (
                <Command.Group heading={t('command.navigation')} className={groupClass}>
                  {pages.map((page) => (
                    <Command.Item
                      key={page.href}
                      value={`page:${page.href}`}
                      onSelect={() => go(page.href)}
                      className={itemClass}
                    >
                      <page.icon />
                      <span className="flex-1 truncate">{page.label}</span>
                      <span className="text-xs text-fg-subtle">{page.groupLabel}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {!waiting && resultGroups.length === 0 && (pickStudentMode || nothingStatic) ? (
                <div className="px-4 py-8 text-center text-sm text-fg-muted">
                  {searching ? t('command.noResults') : t('command.typeMore')}
                </div>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line-subtle bg-surface-muted px-3 py-2 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {t('command.footer.navigate')}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
                {t('command.footer.open')}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd>
                {t('command.footer.close')}
              </span>
            </div>
          </Command>
        </DialogPrimitiveContent>
      </DialogPortal>
    </Dialog>
  );
}

function ResultLabel({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string | null;
  icon?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate">{title}</span>
      {subtitle ? <span className="truncate text-xs text-fg-subtle">{subtitle}</span> : null}
      {icon ? <span className="ml-auto flex">{icon}</span> : null}
    </span>
  );
}
