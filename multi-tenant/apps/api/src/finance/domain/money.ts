import { Errors } from '../../platform/errors/app-error.js';

/** Throws unless the value is a safe, non-negative integer amount in minor units. */
export function assertAmount(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw Errors.validation([{ path: label, code: 'invalid_amount', message: 'Invalid amount' }]);
  }
  return value;
}

/**
 * `amount × basisPoints / 10 000`, rounded half up. BigInt keeps the intermediate product exact
 * for any safe-integer amount.
 */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertAmount(amountMinor);
  const product = BigInt(amountMinor) * BigInt(basisPoints);
  return Number((product + 5_000n) / 10_000n);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
