import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env.js';

const KEY_ID = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface ProtectedValue {
  ciphertext: string;
  hash: string;
  last4: string;
}

/**
 * Field-level protection for sensitive identifiers (ADR-0013): AES-256-GCM ciphertext for
 * authorized display, an HMAC-SHA-256 blind index for exact-match lookups, and the last four
 * characters for masked display. The key id prefix allows key rotation.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;
  private readonly hashKey: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.FIELD_ENCRYPTION_KEY, 'base64');
    this.hashKey = config.FIELD_HASH_KEY;
  }

  protect(value: string): ProtectedValue {
    const normalized = value.trim();
    return {
      ciphertext: this.encrypt(normalized),
      hash: this.blindIndex(normalized),
      last4: normalized.slice(-4),
    };
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${KEY_ID}:${Buffer.concat([iv, encrypted, tag]).toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [keyId, data] = payload.split(':', 2);
    if (keyId !== KEY_ID || !data) throw new Error('Unsupported ciphertext format');
    const raw = Buffer.from(data, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  blindIndex(value: string): string {
    return createHmac('sha256', this.hashKey).update(value.trim(), 'utf8').digest('hex');
  }

  static mask(last4: string | null): string | null {
    return last4 ? `•••••••${last4}` : null;
  }
}
