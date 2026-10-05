import type { ErrorCode, FieldError } from '@repo/contracts';

/**
 * A domain or application error with a stable code. Rendered as RFC 9457 problem details.
 * `message` is an English, developer-oriented detail; clients localize by `code`.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message?: string,
    readonly errors?: FieldError[],
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (errors: FieldError[], message = 'Request validation failed') =>
    new AppError('VALIDATION_FAILED', 400, message, errors),
  unauthenticated: (message = 'Authentication required') =>
    new AppError('UNAUTHENTICATED', 401, message),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError('FORBIDDEN', 403, message),
  /** Also used for records outside the caller's scope or tenant — never confirm existence. */
  notFound: (resource = 'Resource') => new AppError('NOT_FOUND', 404, `${resource} not found`),
  conflict: (code: ErrorCode, message?: string) => new AppError(code, 409, message),
  unprocessable: (code: ErrorCode, message?: string, errors?: FieldError[]) =>
    new AppError(code, 422, message, errors),
  rateLimited: () => new AppError('RATE_LIMITED', 429, 'Too many requests'),
};
