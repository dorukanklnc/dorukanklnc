import { parseConfig } from '../config/env.js';
import { FieldEncryptionService } from './field-encryption.service.js';
import { hashPayload, hashToken, safeEqual } from './tokens.js';

const config = parseConfig({
  DATABASE_URL: 'postgres://x',
  DATABASE_SYSTEM_URL: 'postgres://y',
});

describe('FieldEncryptionService', () => {
  const service = new FieldEncryptionService(config);

  it('round-trips values with authenticated encryption', () => {
    const protectedValue = service.protect('10000000146');
    expect(protectedValue.ciphertext.startsWith('v1:')).toBe(true);
    expect(protectedValue.ciphertext).not.toContain('10000000146');
    expect(service.decrypt(protectedValue.ciphertext)).toBe('10000000146');
    expect(protectedValue.last4).toBe('0146');
  });

  it('uses a random IV but a deterministic blind index', () => {
    const a = service.protect('10000000146');
    const b = service.protect('10000000146');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.hash).toBe(b.hash);
  });

  it('rejects tampered ciphertexts', () => {
    const { ciphertext } = service.protect('10000000146');
    const tampered = `${ciphertext.slice(0, -4)}AAAA`;
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('masks values for display', () => {
    expect(FieldEncryptionService.mask('0146')).toBe('•••••••0146');
    expect(FieldEncryptionService.mask(null)).toBeNull();
  });
});

describe('tokens', () => {
  it('hashes tokens irreversibly and compares in constant time', () => {
    expect(hashToken('abc')).toHaveLength(64);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('hashes payloads independent of key order', () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      hashPayload({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});
