import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned in `application/problem+json` responses.
 * The web app maps them to localized messages; never change the meaning of an existing code.
 */
export const ERROR_CODES = [
  // Generic
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'CSRF_TOKEN_INVALID',
  'MODULE_DISABLED',
  'INTERNAL_ERROR',
  // Authentication
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_ACCOUNT_DISABLED',
  'AUTH_NO_ACTIVE_MEMBERSHIP',
  'AUTH_ORGANIZATION_REQUIRED',
  'AUTH_INVALID_TOKEN',
  'AUTH_PASSWORD_INCORRECT',
  // Invitations & members
  'INVITATION_INVALID',
  'MEMBER_ALREADY_EXISTS',
  'MEMBER_SELF_ACTION',
  'LAST_OWNER',
  // Roles
  'ROLE_ESCALATION',
  'ROLE_DEPENDENCY_MISSING',
  'ROLE_SYSTEM_READONLY',
  'ROLE_IN_USE',
  // Organization & branches
  'ORGANIZATION_SLUG_TAKEN',
  'BRANCH_CODE_TAKEN',
  'BRANCH_NOT_ALLOWED',
  // Students
  'STUDENT_NUMBER_TAKEN',
  'NATIONAL_ID_TAKEN',
  // Finance
  'FINANCE_CURRENCY_MISMATCH',
  'FINANCE_DISCOUNT_EXCEEDS_AMOUNT',
  'FINANCE_INVALID_PLAN',
  'FINANCE_ALLOCATION_EXCEEDS_PAYMENT',
  'FINANCE_ALLOCATION_EXCEEDS_OUTSTANDING',
  'FINANCE_RECEIVABLE_NOT_OPEN',
  'FINANCE_PAYMENT_ALREADY_REVERSED',
  'FINANCE_PAYMENT_HAS_REFUNDS',
  'FINANCE_ACCOUNT_NOT_FOUND',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  // Integrations
  'WEBHOOK_SIGNATURE_INVALID',
  'PAYMENT_PROVIDER_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const fieldErrorSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** RFC 9457 problem details, extended with a stable `code` and the request id. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: errorCodeSchema,
  detail: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
});
export type Problem = z.infer<typeof problemSchema>;
