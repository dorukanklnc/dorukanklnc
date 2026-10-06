import { type ErrorCode, type FieldError, problemSchema } from '@repo/contracts';

/** Error codes the web app can surface: every API code plus client-side transport failures. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

interface ApiErrorInit {
  status: number;
  code: ClientErrorCode;
  message?: string | undefined;
  fieldErrors?: readonly FieldError[] | undefined;
  requestId?: string | undefined;
}

/**
 * A failed API call, normalized from an RFC 9457 problem document. UI code branches on the
 * stable `code`, never on `message` (which is English and meant for logs).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly fieldErrors: readonly FieldError[];
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message ?? init.code);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors ?? [];
    this.requestId = init.requestId;
  }

  static fromResponse(status: number, payload: unknown, requestIdHeader: string | null): ApiError {
    const problem = problemSchema.safeParse(payload);
    if (problem.success) {
      return new ApiError({
        status,
        code: problem.data.code,
        message: problem.data.detail ?? problem.data.title,
        fieldErrors: problem.data.errors,
        requestId: problem.data.requestId ?? requestIdHeader ?? undefined,
      });
    }
    // Not a problem document (e.g. the API is unreachable behind the proxy): derive from status.
    return new ApiError({
      status,
      code: codeForStatus(status),
      requestId: requestIdHeader ?? undefined,
    });
  }

  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code !== 'CSRF_TOKEN_INVALID';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}
