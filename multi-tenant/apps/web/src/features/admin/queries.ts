'use client';

import type { Branch, PermissionCatalogItem, Role } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: ({ signal }) => api.get<Role[]>('/roles', undefined, signal),
    enabled,
    staleTime: 60_000,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: queryKeys.roles.permissions,
    queryFn: ({ signal }) => api.get<PermissionCatalogItem[]>('/permissions', undefined, signal),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useBranches(enabled = true) {
  return useQuery({
    queryKey: queryKeys.branches.all,
    queryFn: ({ signal }) => api.get<Branch[]>('/branches', undefined, signal),
    enabled,
    staleTime: 60_000,
  });
}
