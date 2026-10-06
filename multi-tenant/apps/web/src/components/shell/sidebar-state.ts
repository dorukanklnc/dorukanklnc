export const SIDEBAR_COOKIE = 'sidebar_collapsed';

/** Remembers the sidebar state across visits (read on the server to avoid a layout jump). */
export function persistSidebarCollapsed(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
