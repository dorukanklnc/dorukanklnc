import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations, 1 lane).
 * The algorithm defaults to argon2id in @node-rs/argon2; a unit test pins it.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'password123',
  'sifre12345',
  'şifre12345',
  'parola1234',
  'admin12345',
]);

@Injectable()
export class PasswordService {
  /** Hash of a random string, verified when the user does not exist to equalize timing. */
  private readonly dummyHash = hash('timing-equalization-password', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }

  /** Burns comparable CPU time when there is no account, so timing does not reveal existence. */
  async verifyDummy(password: string): Promise<void> {
    await this.verify(null, password);
  }

  /** Minimal policy on top of the length rule enforced by the contract schema. */
  isAcceptable(password: string, email: string): boolean {
    const lower = password.toLocaleLowerCase('tr-TR');
    const localPart = email.split('@')[0]?.toLocaleLowerCase('tr-TR') ?? '';
    if (COMMON_PASSWORDS.has(lower)) return false;
    if (localPart.length >= 4 && lower.includes(localPart)) return false;
    return new Set(lower).size >= 4;
  }
}
