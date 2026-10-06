'use client';

import type { AcademicYear, ClassSummary } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';

/** Classes the member can see (optionally for one branch). Disabled without `academics.read`. */
export function useClasses(params: { branchId?: string | undefined } = {}, enabled = true) {
  const { can, moduleEnabled } = usePermissions();
  const allowed = can('academics.read') && moduleEnabled('academics');
  const query = { branchId: params.branchId };
  return useQuery({
    queryKey: queryKeys.academics.classes(query),
    queryFn: ({ signal }) => api.get<ClassSummary[]>('/academics/classes', query, signal),
    enabled: enabled && allowed,
    staleTime: 5 * 60_000,
  });
}

export function useAcademicYears(enabled = true) {
  return useQuery({
    queryKey: queryKeys.academics.years,
    queryFn: ({ signal }) => api.get<AcademicYear[]>('/academics/years', undefined, signal),
    enabled,
    staleTime: 10 * 60_000,
  });
}
