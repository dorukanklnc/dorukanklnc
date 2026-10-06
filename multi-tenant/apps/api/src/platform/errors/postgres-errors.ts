import type { ErrorCode } from '@repo/contracts';
import { AppError } from './app-error.js';

interface PostgresError {
  code: string;
  constraint?: string;
  message: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/.test((error as { code: string }).code)
  );
}

/** Drizzle wraps driver errors; the original PostgreSQL error is in `cause`. */
export function unwrapPostgresError(error: unknown): PostgresError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (isPostgresError(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Constraint name → stable API error. Anything unmapped stays a 500 (and is logged). */
const CONSTRAINT_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
  organizations_slug_uq: { code: 'ORGANIZATION_SLUG_TAKEN', status: 409 },
  branches_org_code_uq: { code: 'BRANCH_CODE_TAKEN', status: 409 },
  students_org_number_uq: { code: 'STUDENT_NUMBER_TAKEN', status: 409 },
  students_org_national_id_uq: { code: 'NATIONAL_ID_TAKEN', status: 409 },
  guardians_org_national_id_uq: { code: 'NATIONAL_ID_TAKEN', status: 409 },
  memberships_org_user_uq: { code: 'MEMBER_ALREADY_EXISTS', status: 409 },
  payments_allocation_ck: { code: 'FINANCE_ALLOCATION_EXCEEDS_PAYMENT', status: 422 },
  receivables_allocated_ck: { code: 'FINANCE_ALLOCATION_EXCEEDS_OUTSTANDING', status: 422 },
  receivables_status_consistency_ck: { code: 'FINANCE_RECEIVABLE_NOT_OPEN', status: 422 },
  payment_allocations_receivable_status: { code: 'FINANCE_RECEIVABLE_NOT_OPEN', status: 422 },
  payment_allocations_payment_status: { code: 'FINANCE_PAYMENT_ALREADY_REVERSED', status: 422 },
  payment_allocations_account_match: { code: 'FINANCE_CURRENCY_MISMATCH', status: 422 },
  finance_account_consistency: { code: 'FINANCE_CURRENCY_MISMATCH', status: 422 },
  payments_reversal_final: { code: 'FINANCE_PAYMENT_ALREADY_REVERSED', status: 409 },
};

export function mapPostgresError(error: unknown): AppError | undefined {
  const pg = unwrapPostgresError(error);
  if (!pg) return undefined;
  const mapping = pg.constraint ? CONSTRAINT_ERRORS[pg.constraint] : undefined;
  if (mapping)
    return new AppError(mapping.code, mapping.status, `Constraint ${pg.constraint} violated`);
  // 42501 insufficient_privilege: RLS WITH CHECK or missing grant — treat as forbidden.
  if (pg.code === '42501') return new AppError('FORBIDDEN', 403, 'Operation not permitted');
  // 22P02 invalid_text_representation (e.g. malformed uuid that slipped past validation)
  if (pg.code === '22P02') return new AppError('NOT_FOUND', 404, 'Resource not found');
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = unwrapPostgresError(error);
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}
