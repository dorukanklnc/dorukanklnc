import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText } from './search-text';

describe('Turkish-insensitive matching', () => {
  it('folds Turkish letters and case', () => {
    expect(normalizeSearchText('IŞIKLAR')).toBe('isiklar');
    expect(normalizeSearchText('İlker Öğütçü')).toBe('ilker ogutcu');
  });

  it('matches every word in any order', () => {
    expect(matchesSearch('Tahsilat al · ödeme kaydet makbuz', 'odeme tahsilat')).toBe(true);
    expect(matchesSearch('Öğrenciler', 'ogrenci')).toBe(true);
    expect(matchesSearch('Öğrenciler', 'veli')).toBe(false);
  });
});
