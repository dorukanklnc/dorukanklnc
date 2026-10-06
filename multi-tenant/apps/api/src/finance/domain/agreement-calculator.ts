import type { DiscountInput, DiscountLine, PlanInput, ScheduleLine } from '@repo/contracts';
import { AppError } from '../../platform/errors/app-error.js';
import { addMonthsClamped, parseIsoDate } from './dates.js';
import { applyBasisPoints, assertAmount, sum } from './money.js';

export interface DiscountResult {
  lines: DiscountLine[];
  discountTotalMinor: number;
  netAmountMinor: number;
}

/**
 * Applies discounts in order; each percentage applies to the amount remaining after the previous
 * discounts (see FINANCE_MODEL §4). Fixed discounts larger than the remainder are rejected.
 */
export function applyDiscounts(
  grossAmountMinor: number,
  discounts: readonly DiscountInput[],
): DiscountResult {
  assertAmount(grossAmountMinor, 'grossAmountMinor');
  let remaining = grossAmountMinor;
  const lines: DiscountLine[] = [];
  for (const discount of discounts) {
    const amountMinor =
      discount.kind === 'percentage'
        ? applyBasisPoints(remaining, discount.percentageBps)
        : discount.amountMinor;
    if (amountMinor > remaining) {
      throw new AppError(
        'FINANCE_DISCOUNT_EXCEEDS_AMOUNT',
        422,
        'Discount exceeds the remaining amount',
      );
    }
    remaining -= amountMinor;
    lines.push({
      category: discount.category,
      label: discount.label,
      kind: discount.kind,
      percentageBps: discount.kind === 'percentage' ? discount.percentageBps : null,
      fixedAmountMinor: discount.kind === 'fixed' ? discount.amountMinor : null,
      amountMinor,
    });
  }
  return { lines, discountTotalMinor: grossAmountMinor - remaining, netAmountMinor: remaining };
}

export interface ScheduleInput extends Omit<PlanInput, 'downPaymentDueDate'> {
  netAmountMinor: number;
  /** Required when a down payment is present. */
  downPaymentDueDate?: string | undefined;
}

const invalidPlan = (message: string) => new AppError('FINANCE_INVALID_PLAN', 422, message);

/**
 * Splits the net amount into a down payment (sequence 0) and `installmentCount` monthly
 * installments rounded down to the rounding unit; the rounding difference goes to the first or
 * last installment. Invariant: the lines always sum to the net amount.
 */
export function buildSchedule(input: ScheduleInput): ScheduleLine[] {
  const net = assertAmount(input.netAmountMinor, 'netAmountMinor');
  const down = assertAmount(input.downPaymentMinor, 'downPaymentMinor');
  const count = input.installmentCount;
  if (!Number.isInteger(count) || count < 1 || count > 36)
    throw invalidPlan('Installment count must be 1–36');
  if (down > net) throw invalidPlan('Down payment exceeds the net amount');

  const lines: ScheduleLine[] = [];
  if (down > 0) {
    if (!input.downPaymentDueDate) throw invalidPlan('Down payment due date is required');
    parseIsoDate(input.downPaymentDueDate);
    lines.push({
      sequenceNo: 0,
      dueDate: input.downPaymentDueDate,
      amountMinor: down,
      isDownPayment: true,
    });
  }

  const remaining = net - down;
  if (remaining === 0) return lines;

  let unit = input.roundingUnitMinor;
  let base = Math.floor(remaining / count / unit) * unit;
  if (base === 0) {
    unit = 1;
    base = Math.floor(remaining / count);
  }
  if (base === 0) throw invalidPlan('Amount is too small for the number of installments');

  const amounts = Array.from({ length: count }, () => base);
  const remainder = remaining - base * count;
  const target = input.remainderPlacement === 'first' ? 0 : count - 1;
  amounts[target] = (amounts[target] ?? 0) + remainder;

  const anchorDay = parseIsoDate(input.firstDueDate).day;
  amounts.forEach((amountMinor, index) => {
    lines.push({
      sequenceNo: index + 1,
      dueDate: addMonthsClamped(input.firstDueDate, index, anchorDay),
      amountMinor,
      isDownPayment: false,
    });
  });

  if (sum(lines.map((line) => line.amountMinor)) !== net) {
    throw new Error('Schedule invariant violated: lines do not sum to the net amount');
  }
  return lines;
}
