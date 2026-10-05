import { AppError } from '../../platform/errors/app-error.js';
import { agingBucket, daysOverdue } from './aging.js';
import { applyDiscounts, buildSchedule } from './agreement-calculator.js';
import { allocateOldestFirst, validateManualAllocation, type OpenReceivable } from './allocation.js';
import { addMonthsClamped, daysBetween, monthBounds, todayIn } from './dates.js';
import { applyBasisPoints, sum } from './money.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('money', () => {
  it('rounds basis-point percentages half up with exact integer arithmetic', () => {
    expect(applyBasisPoints(1_000_000, 1000)).toBe(100_000);
    expect(applyBasisPoints(333, 5000)).toBe(167); // 166.5 → 167
    expect(applyBasisPoints(333, 3333)).toBe(111); // 110.99 → 111
    expect(applyBasisPoints(Number.MAX_SAFE_INTEGER, 10_000)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('applyDiscounts', () => {
  it('applies discounts sequentially on the remaining amount', () => {
    const result = applyDiscounts(25_000_000, [
      { kind: 'percentage', category: 'sibling', label: 'Kardeş', percentageBps: 1000 },
      { kind: 'percentage', category: 'early_payment', label: 'Peşin', percentageBps: 500 },
      { kind: 'fixed', category: 'scholarship', label: 'Burs', amountMinor: 1_000_000 },
    ]);
    expect(result.lines.map((line) => line.amountMinor)).toEqual([2_500_000, 1_125_000, 1_000_000]);
    expect(result.discountTotalMinor).toBe(4_625_000);
    expect(result.netAmountMinor).toBe(20_375_000);
  });

  it('supports a full scholarship', () => {
    const result = applyDiscounts(10_000, [
      { kind: 'percentage', category: 'scholarship', label: 'Tam burs', percentageBps: 10_000 },
    ]);
    expect(result.netAmountMinor).toBe(0);
  });

  it('rejects fixed discounts above the remaining amount', () => {
    expectCode(
      () =>
        applyDiscounts(10_000, [{ kind: 'fixed', category: 'other', label: 'x', amountMinor: 10_001 }]),
      'FINANCE_DISCOUNT_EXCEEDS_AMOUNT',
    );
  });
});

describe('buildSchedule', () => {
  const base = {
    roundingUnitMinor: 100 as const,
    remainderPlacement: 'last' as const,
    downPaymentMinor: 0,
  };

  it('rounds installments to whole currency units and puts the remainder last', () => {
    const lines = buildSchedule({ ...base, netAmountMinor: 10_000_000, installmentCount: 12, firstDueDate: '2026-09-15' });
    expect(lines).toHaveLength(12);
    expect(lines[0]).toEqual({ sequenceNo: 1, dueDate: '2026-09-15', amountMinor: 833_300, isDownPayment: false });
    expect(lines[11]?.amountMinor).toBe(10_000_000 - 833_300 * 11);
    expect(lines[11]?.dueDate).toBe('2027-08-15');
    expect(sum(lines.map((line) => line.amountMinor))).toBe(10_000_000);
  });

  it('can put the remainder on the first installment', () => {
    const lines = buildSchedule({
      ...base,
      remainderPlacement: 'first',
      netAmountMinor: 100_000,
      installmentCount: 3,
      firstDueDate: '2026-01-01',
    });
    expect(lines.map((line) => line.amountMinor)).toEqual([33_400, 33_300, 33_300]);
  });

  it('adds a down payment as sequence 0', () => {
    const lines = buildSchedule({
      ...base,
      netAmountMinor: 1_000_000,
      downPaymentMinor: 250_000,
      downPaymentDueDate: '2026-08-20',
      installmentCount: 3,
      firstDueDate: '2026-09-05',
    });
    expect(lines[0]).toEqual({ sequenceNo: 0, dueDate: '2026-08-20', amountMinor: 250_000, isDownPayment: true });
    expect(sum(lines.map((line) => line.amountMinor))).toBe(1_000_000);
  });

  it('clamps due dates to the end of shorter months', () => {
    const lines = buildSchedule({ ...base, netAmountMinor: 300_000, installmentCount: 3, firstDueDate: '2027-01-31' });
    expect(lines.map((line) => line.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('falls back to minor units when the rounding unit is too coarse', () => {
    const lines = buildSchedule({ ...base, netAmountMinor: 250, installmentCount: 3, firstDueDate: '2026-01-10' });
    expect(lines.map((line) => line.amountMinor)).toEqual([83, 83, 84]);
  });

  it('keeps the sum invariant across many shapes', () => {
    for (const net of [1, 99, 1_234_567, 25_000_000, 999_999_999]) {
      for (const count of [1, 2, 7, 10, 12, 36]) {
        if (net < count) continue;
        const lines = buildSchedule({ ...base, netAmountMinor: net, installmentCount: count, firstDueDate: '2026-02-28' });
        expect(sum(lines.map((line) => line.amountMinor))).toBe(net);
        expect(lines.every((line) => line.amountMinor > 0)).toBe(true);
      }
    }
  });

  it('rejects invalid plans', () => {
    expectCode(
      () => buildSchedule({ ...base, netAmountMinor: 100, downPaymentMinor: 200, installmentCount: 1, firstDueDate: '2026-01-01' }),
      'FINANCE_INVALID_PLAN',
    );
    expectCode(
      () => buildSchedule({ ...base, netAmountMinor: 2, installmentCount: 3, firstDueDate: '2026-01-01' }),
      'FINANCE_INVALID_PLAN',
    );
    expectCode(
      () => buildSchedule({ ...base, netAmountMinor: 1000, downPaymentMinor: 100, installmentCount: 2, firstDueDate: '2026-01-01' }),
      'FINANCE_INVALID_PLAN',
    );
  });
});

describe('allocation', () => {
  const receivable = (id: string, dueDate: string, outstandingMinor: number, extra: Partial<OpenReceivable> = {}): OpenReceivable => ({
    id,
    kind: 'installment',
    sequenceNo: null,
    dueDate,
    outstandingMinor,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  });

  it('allocates to the oldest receivables first and leaves credit', () => {
    const lines = allocateOldestFirst(1_500, [
      receivable('b', '2026-02-15', 1_000),
      receivable('a', '2026-01-15', 1_000),
      receivable('c', '2026-03-15', 1_000),
    ]);
    expect(lines).toEqual([
      { receivableId: 'a', amountMinor: 1_000 },
      { receivableId: 'b', amountMinor: 500 },
    ]);
  });

  it('settles installments before charges due the same day', () => {
    const lines = allocateOldestFirst(100, [
      receivable('charge', '2026-01-15', 100, { kind: 'charge' }),
      receivable('installment', '2026-01-15', 100, { sequenceNo: 3 }),
    ]);
    expect(lines).toEqual([{ receivableId: 'installment', amountMinor: 100 }]);
  });

  it('validates manual allocations', () => {
    const open = new Map([['a', receivable('a', '2026-01-15', 1_000)], ['b', receivable('b', '2026-02-15', 1_000)]]);
    expect(validateManualAllocation(1_500, [{ receivableId: 'b', amountMinor: 1_000 }], open)).toHaveLength(1);
    expectCode(() => validateManualAllocation(1_500, [{ receivableId: 'a', amountMinor: 1_001 }], open), 'FINANCE_ALLOCATION_EXCEEDS_OUTSTANDING');
    expectCode(
      () =>
        validateManualAllocation(
          1_500,
          [
            { receivableId: 'a', amountMinor: 1_000 },
            { receivableId: 'b', amountMinor: 600 },
          ],
          open,
        ),
      'FINANCE_ALLOCATION_EXCEEDS_PAYMENT',
    );
    expectCode(() => validateManualAllocation(100, [{ receivableId: 'zzz', amountMinor: 1 }], open), 'FINANCE_RECEIVABLE_NOT_OPEN');
    expectCode(
      () =>
        validateManualAllocation(
          100,
          [
            { receivableId: 'a', amountMinor: 1 },
            { receivableId: 'a', amountMinor: 1 },
          ],
          open,
        ),
      'VALIDATION_FAILED',
    );
  });
});

describe('dates and aging', () => {
  it('computes calendar arithmetic without time zone drift', () => {
    expect(addMonthsClamped('2024-01-31', 1, 31)).toBe('2024-02-29');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(monthBounds('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it("resolves today's date in the organization's time zone", () => {
    const instant = new Date('2026-10-05T22:30:00Z');
    expect(todayIn('Europe/Istanbul', instant)).toBe('2026-10-06');
    expect(todayIn('America/New_York', instant)).toBe('2026-10-05');
  });

  it('buckets overdue days; due today is not overdue', () => {
    expect(daysOverdue('2026-10-05', '2026-10-05')).toBe(0);
    expect(agingBucket(daysOverdue('2026-10-04', '2026-10-05'))).toBe('d1_30');
    expect(agingBucket(31)).toBe('d31_60');
    expect(agingBucket(61)).toBe('d61_90');
    expect(agingBucket(91)).toBe('d90_plus');
    expect(agingBucket(0)).toBe('not_due');
  });
});
