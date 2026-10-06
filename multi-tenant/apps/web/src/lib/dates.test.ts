import { describe, expect, it } from 'vitest';
import { addMonths, firstOfNextMonth, formatCalendarDate, parseIsoDate, todayIn } from './dates';

describe('calendar dates', () => {
  it('adds months with end-of-month clamping, like the installment schedule', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes the first day of the next month', () => {
    expect(firstOfNextMonth('2026-10-06')).toBe('2026-11-01');
    expect(firstOfNextMonth('2026-12-31')).toBe('2027-01-01');
  });

  it('resolves "today" in the organization time zone, not the device zone', () => {
    const instant = new Date('2026-10-05T22:30:00Z');
    expect(todayIn('Europe/Istanbul', instant)).toBe('2026-10-06');
    expect(todayIn('UTC', instant)).toBe('2026-10-05');
  });

  it('formats calendar dates without shifting them across time zones', () => {
    expect(formatCalendarDate('2026-11-01', 'tr-TR')).toBe('01.11.2026');
    expect(formatCalendarDate('2026-11-01', 'tr-TR', 'medium')).toBe('1 Kas 2026');
  });

  it('rejects malformed dates', () => {
    expect(parseIsoDate('2026-13')).toBeNull();
    expect(parseIsoDate('not a date')).toBeNull();
  });
});
