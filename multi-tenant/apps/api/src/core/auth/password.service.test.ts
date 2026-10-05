import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const hashed = await service.hash('a sufficiently long passphrase');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hashed, 'a sufficiently long passphrase')).toBe(true);
    expect(await service.verify(hashed, 'wrong passphrase!!')).toBe(false);
  });

  it('never verifies when there is no hash', async () => {
    expect(await service.verify(null, 'timing-equalization-password-x')).toBe(false);
  });

  it('rejects common and e-mail-derived passwords', () => {
    expect(service.isAcceptable('password123', 'a@b.co')).toBe(false);
    expect(service.isAcceptable('mehmet.yilmaz2026', 'mehmet.yilmaz@example.com')).toBe(false);
    expect(service.isAcceptable('aaaaaaaaaaaa', 'x@y.z')).toBe(false);
    expect(service.isAcceptable('Kırmızı-Bisiklet-42', 'mehmet@example.com')).toBe(true);
  });
});
