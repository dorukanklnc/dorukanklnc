import { describe, expect, it } from 'vitest';
import { isValidTurkishNationalId, paginationQuerySchema } from './common.js';
import { recordPaymentRequestSchema } from './finance.js';
import { inviteMemberRequestSchema } from './members.js';

describe('isValidTurkishNationalId', () => {
  it('accepts numbers with valid checksums', () => {
    expect(isValidTurkishNationalId('10000000146')).toBe(true);
    expect(isValidTurkishNationalId('12345678950')).toBe(true);
  });

  it('rejects malformed numbers and bad checksums', () => {
    expect(isValidTurkishNationalId('01234567890')).toBe(false);
    expect(isValidTurkishNationalId('1234567895')).toBe(false);
    expect(isValidTurkishNationalId('12345678951')).toBe(false);
    expect(isValidTurkishNationalId('1234567895a')).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('coerces query strings and applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps the page size', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
  });
});

describe('recordPaymentRequestSchema', () => {
  const base = {
    studentId: '018f6b1e-0000-7000-8000-000000000001',
    amountMinor: 1_250_000,
    method: 'cash',
  };

  it('defaults to automatic allocation in TRY', () => {
    const parsed = recordPaymentRequestSchema.parse(base);
    expect(parsed.allocation).toEqual({ mode: 'auto' });
    expect(parsed.currency).toBe('TRY');
  });

  it('rejects fractional and non-positive amounts', () => {
    expect(recordPaymentRequestSchema.safeParse({ ...base, amountMinor: 10.5 }).success).toBe(
      false,
    );
    expect(recordPaymentRequestSchema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
  });

  it('does not allow recording online payments manually', () => {
    expect(recordPaymentRequestSchema.safeParse({ ...base, method: 'online' }).success).toBe(false);
  });
});

describe('inviteMemberRequestSchema', () => {
  it('requires a branch unless all-branch access is granted', () => {
    const base = {
      email: 'ayse@example.com',
      fullName: 'Ayşe Demir',
      roleIds: ['018f6b1e-0000-7000-8000-000000000002'],
    };
    expect(
      inviteMemberRequestSchema.safeParse({ ...base, allBranches: false, branchIds: [] }).success,
    ).toBe(false);
    expect(
      inviteMemberRequestSchema.safeParse({ ...base, allBranches: true, branchIds: [] }).success,
    ).toBe(true);
  });
});
