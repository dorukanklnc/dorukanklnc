import { describe, expect, it } from 'vitest';
import {
  formatBasisPoints,
  formatMoney,
  formatMoneyInput,
  minorToDecimalString,
  parseMoneyInput,
  parsePercentInput,
} from './money';

const nbsp = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('parseMoneyInput (tr-TR)', () => {
  const parse = (input: string) => parseMoneyInput(input, 'TRY', 'tr-TR');

  it.each([
    ['12500', 1_250_000],
    ['12.500', 1_250_000],
    ['12.500,50', 1_250_050],
    ['12500,5', 1_250_050],
    ['12500.5', 1_250_050],
    ['12.50', 1_250],
    ['1.250.000', 125_000_000],
    ['1.250.000,99', 125_000_099],
    ['0,01', 1],
    [',5', 50],
    ['₺ 1.250', 125_000],
    ['1250 TL', 125_000],
    ['  45.000  ', 4_500_000],
  ])('%s → %d kuruş', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it.each([
    [''],
    ['abc'],
    ['-5'],
    ['1,2,3'],
    ['12.5.5'],
    ['1234.567'],
    ['12,345'],
    ['1.2,5'],
    ['10,001'],
  ])('rejects %j', (input) => {
    expect(parse(input)).toBeNull();
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(parse('900.719.925.474.099,92')).toBeNull();
    expect(parse('90.071.992.547.409,91')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('parseMoneyInput (en-GB)', () => {
  const parse = (input: string) => parseMoneyInput(input, 'TRY', 'en-GB');

  it.each([
    ['12,500.50', 1_250_050],
    ['12,500', 1_250_000],
    ['12.5', 1_250],
    ['12,5', 1_250],
  ])('%s → %d', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });
});

describe('formatting', () => {
  it('formats minor units exactly, including values floats cannot represent', () => {
    expect(minorToDecimalString(1_234_567, 'TRY')).toBe('12345.67');
    expect(minorToDecimalString(-5, 'TRY')).toBe('-0.05');
    expect(minorToDecimalString(Number.MAX_SAFE_INTEGER, 'TRY')).toBe('90071992547409.91');
    expect(nbsp(formatMoney(Number.MAX_SAFE_INTEGER, 'TRY', 'tr-TR'))).toBe(
      '₺90.071.992.547.409,91',
    );
  });

  it('uses the locale conventions', () => {
    expect(nbsp(formatMoney(1_250_050, 'TRY', 'tr-TR'))).toBe('₺12.500,50');
    expect(formatMoneyInput(1_250_050, 'TRY', 'tr-TR')).toBe('12.500,50');
    expect(formatMoneyInput(1_250_050, 'TRY', 'en-GB')).toBe('12,500.50');
  });

  it('round-trips through the input format', () => {
    for (const amount of [1, 99, 100, 123_456_789, 4_500_000]) {
      expect(parseMoneyInput(formatMoneyInput(amount, 'TRY', 'tr-TR'), 'TRY', 'tr-TR')).toBe(
        amount,
      );
    }
  });
});

describe('percentages', () => {
  it('parses percentages into basis points', () => {
    expect(parsePercentInput('10', 'tr-TR')).toBe(1_000);
    expect(parsePercentInput('%12,5', 'tr-TR')).toBe(1_250);
    expect(parsePercentInput('100', 'tr-TR')).toBe(10_000);
    expect(parsePercentInput('100,01', 'tr-TR')).toBeNull();
    expect(parsePercentInput('12,345', 'tr-TR')).toBeNull();
  });

  it('formats basis points', () => {
    expect(nbsp(formatBasisPoints(1_250, 'tr-TR'))).toBe('%12,5');
    expect(formatBasisPoints(1_000, 'en-GB')).toBe('10%');
  });
});
