import { PERMISSION_KEYS } from '@repo/authorization';
import { ERROR_CODES } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import tr from './tr.json';

type Catalog = { [key: string]: string | Catalog };

function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result.set(path, value);
    else for (const [nested, text] of flatten(value, path)) result.set(nested, text);
  }
  return result;
}

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]).sort();

const trMessages = flatten(tr);
const enMessages = flatten(en);

describe('message catalogs', () => {
  it('have exactly the same keys in every locale', () => {
    expect([...enMessages.keys()].sort()).toEqual([...trMessages.keys()].sort());
  });

  it('use the same ICU arguments in every locale', () => {
    for (const [key, message] of trMessages) {
      expect(placeholders(enMessages.get(key) ?? ''), key).toEqual(placeholders(message));
    }
  });

  it('never contain dots in keys (next-intl uses them for nesting)', () => {
    for (const key of trMessages.keys()) {
      expect(key.split('.').every((segment) => segment.length > 0)).toBe(true);
    }
  });

  it('localize every API error code', () => {
    for (const code of ERROR_CODES) expect(trMessages.has(`errors.${code}`), code).toBe(true);
    expect(trMessages.has('errors.NETWORK_ERROR')).toBe(true);
  });

  it('label every permission in the catalog', () => {
    for (const key of PERMISSION_KEYS) expect(trMessages.has(`permissions.${key}`), key).toBe(true);
  });
});
