import type { SearchResultType } from '@repo/contracts';

export interface RecentItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const PREFIX = 'campusos.recent.v1';
const LIMIT = 6;

/**
 * Recently opened records for the command palette. Kept in sessionStorage (cleared when the tab
 * closes and on sign-out) and keyed by user and organization, because titles are personal data.
 */
function storageKey(userId: string, organizationId: string): string {
  return `${PREFIX}:${userId}:${organizationId}`;
}

export function readRecentItems(userId: string, organizationId: string): RecentItem[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId, organizationId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentItem[]).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRecentItem(userId: string, organizationId: string, item: RecentItem): void {
  try {
    const items = readRecentItems(userId, organizationId).filter(
      (existing) => !(existing.type === item.type && existing.id === item.id),
    );
    window.sessionStorage.setItem(
      storageKey(userId, organizationId),
      JSON.stringify([item, ...items].slice(0, LIMIT)),
    );
  } catch {
    // Storage unavailable (private mode, quota): recents are a convenience only.
  }
}

export function clearRecentItems(): void {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore: nothing to clear.
  }
}
