import { describe, expect, it } from 'vitest';
import { safeNextPath } from './paths';

describe('safeNextPath (open-redirect protection)', () => {
  it.each(['/students', '/students/123?tab=finance', '/finance/payments?from=2026-10-01'])(
    'accepts %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/login',
    '/login?next=/x',
  ])('rejects %j', (path) => {
    expect(safeNextPath(path)).toBeNull();
  });
});
