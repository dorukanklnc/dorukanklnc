import { diffChanges } from './audit.service.js';

describe('diffChanges', () => {
  it('records only changed fields', () => {
    expect(diffChanges({ a: 1, b: 'x', c: null }, { a: 2, b: 'x', c: null })).toEqual({
      a: { before: 1, after: 2 },
    });
  });

  it('returns null when nothing changed', () => {
    expect(diffChanges({ a: [1, 2] }, { a: [1, 2] })).toBeNull();
  });

  it('never stores values of sensitive fields', () => {
    const changes = diffChanges({ nationalId: '10000000146' }, { nationalId: '12345678950' });
    expect(changes).toEqual({ nationalId: { before: '[redacted]', after: '[redacted]' } });
    expect(JSON.stringify(changes)).not.toContain('10000000146');
  });
});
