'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** The value, updated only after it has been stable for `delay` ms (search-as-you-type). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const LOCAL_STORAGE_EVENT = 'campusos:local-storage';

function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(LOCAL_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(LOCAL_STORAGE_EVENT, callback);
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A string preference in localStorage (per-viewer conveniences such as hidden table columns).
 * Server render and first client render use null, so hydration never mismatches.
 */
export function useLocalStorageValue(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribeToStorage,
    () => readStorage(key),
    () => null,
  );
  const setValue = useCallback(
    (next: string | null) => {
      try {
        if (next === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: the preference simply is not remembered.
      }
      window.dispatchEvent(new Event(LOCAL_STORAGE_EVENT));
    },
    [key],
  );
  return [value, setValue];
}
