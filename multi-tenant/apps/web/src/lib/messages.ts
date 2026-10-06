'use client';

import { useMessages } from 'next-intl';
import { useCallback } from 'react';

/** Reads a plain (argument-free) message by path, or null when the catalog has no such entry. */
export function lookupMessage(messages: unknown, path: readonly string[]): string | null {
  let node: unknown = messages;
  for (const segment of path) {
    if (typeof node !== 'object' || node === null || !(segment in node)) return null;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : null;
}

/**
 * Labels for open-ended keys coming from the API (audit actions, permission keys). Unknown keys
 * fall back to the raw key instead of failing, so a newer API never breaks an older client.
 * `namespace` must be a stable (module-level) array.
 */
export function useDynamicLabel(namespace: readonly string[]) {
  const messages = useMessages();
  return useCallback(
    (key: string) => lookupMessage(messages, [...namespace, ...key.split('.')]) ?? key,
    [messages, namespace],
  );
}

const AUDIT_ACTIONS = ['admin', 'audit', 'actions'] as const;
const AUDIT_RESOURCES = ['admin', 'audit', 'resources'] as const;
const PERMISSIONS = ['permissions'] as const;

export function useAuditActionLabel() {
  return useDynamicLabel(AUDIT_ACTIONS);
}

export function useAuditResourceLabel() {
  return useDynamicLabel(AUDIT_RESOURCES);
}

export function usePermissionLabel() {
  return useDynamicLabel(PERMISSIONS);
}
