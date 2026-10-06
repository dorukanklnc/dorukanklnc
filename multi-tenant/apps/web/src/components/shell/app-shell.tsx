'use client';

import { Sheet, SheetContent, SheetTitle, cn } from '@repo/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, createContext, use, useEffect, useMemo, useState } from 'react';
import { useAccess } from '@/components/session/session-context';
import { visibleNavigation } from '@/lib/navigation';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { persistSidebarCollapsed } from './sidebar-state';
import { Topbar } from './topbar';

export type PaletteMode = 'default' | 'pick-student';
type OpenPalette = (options?: { mode?: PaletteMode }) => void;

const CommandPaletteContext = createContext<OpenPalette>(() => undefined);

/**
 * Opens the ⌘K palette from anywhere in the app, optionally straight into a mode (e.g. picking
 * the student to record a payment for).
 */
export function useOpenCommandPalette(): OpenPalette {
  return use(CommandPaletteContext);
}

export function AppShell({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const access = useAccess();
  const groups = useMemo(() => visibleNavigation(access), [access]);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('default');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteMode('default');
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarCollapsed(next);
  };

  const openPalette = useMemo<OpenPalette>(
    () =>
      (options = {}) => {
        setPaletteMode(options.mode ?? 'default');
        setPaletteOpen(true);
      },
    [],
  );

  return (
    <CommandPaletteContext value={openPalette}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('shell.skipToContent')}
      </a>
      <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
        <aside
          className={cn(
            'hidden shrink-0 border-r border-line bg-sidebar transition-[width] duration-200 lg:block print:hidden',
            collapsed ? 'w-14' : 'w-60',
          )}
        >
          <Sidebar groups={groups} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            size="sm"
            closeLabel={t('common.close')}
            className="bg-sidebar lg:hidden"
          >
            <SheetTitle className="sr-only">{t('shell.navigation')}</SheetTitle>
            <Sidebar groups={groups} collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMenu={() => setMobileNavOpen(true)} onOpenSearch={() => openPalette()} />
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 overflow-y-auto focus:outline-none print:overflow-visible"
          >
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        initialMode={paletteMode}
        onOpenChange={setPaletteOpen}
        groups={groups}
      />
    </CommandPaletteContext>
  );
}
