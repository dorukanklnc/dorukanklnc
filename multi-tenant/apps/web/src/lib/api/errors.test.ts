import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';

describe('ApiError.fromResponse', () => {
  it('reads RFC 9457 problem documents', () => {
    const error = ApiError.fromResponse(
      422,
      {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_FAILED',
        requestId: 'req-1',
        errors: [
          { path: 'guardians.0.phone', code: 'invalid_format', message: 'Invalid phone number' },
        ],
      },
      null,
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.requestId).toBe('req-1');
    expect(error.fieldErrors[0]?.path).toBe('guardians.0.phone');
  });

  it('falls back to the HTTP status for non-problem bodies', () => {
    expect(ApiError.fromResponse(401, null, null).code).toBe('UNAUTHENTICATED');
    expect(ApiError.fromResponse(404, '<html>', 'req-2').requestId).toBe('req-2');
    expect(ApiError.fromResponse(502, null, null).code).toBe('INTERNAL_ERROR');
  });

  it('does not treat CSRF failures as missing permissions', () => {
    const csrf = ApiError.fromResponse(
      403,
      { type: 'x', title: 'x', status: 403, code: 'CSRF_TOKEN_INVALID' },
      null,
    );
    expect(csrf.isForbidden).toBe(false);
    expect(ApiError.fromResponse(403, null, null).isForbidden).toBe(true);
  });

  it('ignores unknown codes from newer API versions', () => {
    const error = ApiError.fromResponse(
      409,
      { type: 'x', title: 'x', status: 409, code: 'SOMETHING_NEW' },
      null,
    );
    expect(error.code).toBe('CONFLICT');
  });
});
