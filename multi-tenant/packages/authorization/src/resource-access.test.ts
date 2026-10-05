import { describe, expect, it } from 'vitest';
import { branchBoundary, isWithinScope, type AccessSubject } from './resource-access.js';

const BRANCH_A = '018f6b1e-0000-7000-8000-00000000000a';
const BRANCH_B = '018f6b1e-0000-7000-8000-00000000000b';

const branchAOnly: AccessSubject = {
  membershipId: 'm-1',
  allBranches: false,
  branchIds: [BRANCH_A],
};

describe('isWithinScope', () => {
  it('organization scope sees everything in the tenant', () => {
    expect(isWithinScope('organization', branchAOnly, { branchIds: [BRANCH_B] })).toBe(true);
  });

  it('branch scope sees only assigned branches', () => {
    expect(isWithinScope('branch', branchAOnly, { branchIds: [BRANCH_A] })).toBe(true);
    expect(isWithinScope('branch', branchAOnly, { branchIds: [BRANCH_B] })).toBe(false);
    expect(isWithinScope('branch', branchAOnly, { branchIds: [] })).toBe(false);
    expect(isWithinScope('branch', branchAOnly, { branchIds: [BRANCH_B, BRANCH_A] })).toBe(true);
  });

  it('branch scope with all-branch access sees every branch', () => {
    expect(
      isWithinScope('branch', { ...branchAOnly, allBranches: true }, { branchIds: [BRANCH_B] }),
    ).toBe(true);
  });

  it('assigned scope requires an assignment', () => {
    expect(isWithinScope('assigned', branchAOnly, { branchIds: [BRANCH_A] })).toBe(false);
    expect(isWithinScope('assigned', branchAOnly, { assigned: true })).toBe(true);
  });

  it('own scope requires ownership', () => {
    expect(isWithinScope('own', branchAOnly, { ownerMembershipId: 'm-2' })).toBe(false);
    expect(isWithinScope('own', branchAOnly, { ownerMembershipId: 'm-1' })).toBe(true);
    expect(isWithinScope('own', branchAOnly, { ownerMembershipId: null })).toBe(false);
  });
});

describe('branchBoundary', () => {
  it('is unbounded for all-branch members or organization-wide permissions', () => {
    expect(branchBoundary({ allBranches: true, branchIds: [] }, false)).toBe('*');
    expect(branchBoundary({ allBranches: false, branchIds: [BRANCH_A] }, true)).toBe('*');
  });

  it('is the explicit branch list otherwise', () => {
    expect(branchBoundary({ allBranches: false, branchIds: [BRANCH_A] }, false)).toEqual([
      BRANCH_A,
    ]);
  });
});
