const TURKISH_FOLD: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  I: 'i',
  ğ: 'g',
  Ğ: 'g',
  ş: 's',
  Ş: 's',
  ç: 'c',
  Ç: 'c',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u',
};

/**
 * Accent- and case-insensitive form for client-side matching, consistent with the API's
 * `search_normalize` (so "isik" finds "Işık" and "ogrenci" finds "Öğrenci").
 */
export function normalizeSearchText(value: string): string {
  return value
    .replace(/[ıİIğĞşŞçÇöÖüÜ]/g, (char) => TURKISH_FOLD[char] ?? char)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** True when every word of the query occurs in the haystack (any order). */
export function matchesSearch(haystack: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const target = normalizeSearchText(haystack);
  return normalizedQuery.split(/\s+/).every((word) => target.includes(word));
}
