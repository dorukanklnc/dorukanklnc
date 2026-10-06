import type { QueryParams } from './api/client';

/**
 * Query keys in one place so mutations invalidate exactly what they change. Every key starts with
 * its resource so `invalidateQueries({ queryKey: queryKeys.students.all })` covers lists and details.
 */
export const queryKeys = {
  session: ['session'] as const,
  dashboard: ['dashboard'] as const,
  search: (q: string) => ['search', q] as const,
  branches: {
    all: ['branches'] as const,
  },
  organization: ['organization'] as const,
  academics: {
    years: ['academics', 'years'] as const,
    gradeLevels: ['academics', 'grade-levels'] as const,
    classes: (params: QueryParams = {}) => ['academics', 'classes', params] as const,
  },
  students: {
    all: ['students'] as const,
    list: (params: QueryParams) => ['students', 'list', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
  guardians: {
    all: ['guardians'] as const,
    list: (params: QueryParams) => ['guardians', 'list', params] as const,
  },
  finance: {
    all: ['finance'] as const,
    summary: (params: QueryParams = {}) => ['finance', 'summary', params] as const,
    studentFinance: (studentId: string) => ['finance', 'student', studentId] as const,
    receivables: (params: QueryParams) => ['finance', 'receivables', params] as const,
    payments: (params: QueryParams) => ['finance', 'payments', params] as const,
    payment: (id: string) => ['finance', 'payment', id] as const,
    paymentLink: (id: string) => ['finance', 'payment-link', id] as const,
  },
  members: {
    all: ['members'] as const,
    list: (params: QueryParams) => ['members', 'list', params] as const,
  },
  roles: {
    all: ['roles'] as const,
    permissions: ['roles', 'permissions'] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (params: QueryParams) => ['audit', 'list', params] as const,
  },
  platform: {
    organizations: ['platform', 'organizations'] as const,
  },
  sessions: ['auth', 'sessions'] as const,
};
