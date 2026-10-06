'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type ParamValue = string | number | boolean | null | undefined;

/**
 * List screen state (filters, sorting, pagination) kept in the URL, so views are shareable,
 * survive reloads and work with the back button. Updating any filter resets the page.
 *
 * `keys` must be a stable (module-level) array.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const result = {} as Record<K, string | undefined>;
    for (const key of keys) result[key] = searchParams.get(key) ?? undefined;
    return result;
  }, [keys, searchParams]);

  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(searchParams.get('pageSize')))
    ? Number(searchParams.get('pageSize'))
    : 25;

  const update = useCallback(
    (
      patch: Partial<Record<K | 'page' | 'pageSize', ParamValue>>,
      options: { resetPage?: boolean } = {},
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch) as [string, ParamValue][]) {
        if (value === undefined || value === null || value === '' || value === false)
          next.delete(key);
        else next.set(key, String(value));
      }
      const resetPage = options.resetPage ?? !('page' in patch);
      if (resetPage) next.delete('page');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clear = useCallback(
    (keep: readonly string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { values, page, pageSize, update, clear };
}
