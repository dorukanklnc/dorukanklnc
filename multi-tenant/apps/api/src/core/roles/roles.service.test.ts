import { slugify } from './roles.service.js';

describe('slugify', () => {
  it('produces ASCII keys from Turkish names', () => {
    expect(slugify('Muhasebe Şefi')).toBe('muhasebe-sefi');
    expect(slugify('İdari İşler')).toBe('idari-isler');
    expect(slugify('IŞIK Ğüçö')).toBe('isik-gucö'.replace('ö', 'o'));
    expect(slugify('  --Öğretmen (Yardımcı)-- ')).toBe('ogretmen-yardimci');
  });
});
