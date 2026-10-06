import { describe, expect, it } from 'vitest';
import { PermissionSet, findEscalations, findMissingDependencies } from './permission-set.js';
import { ROLE_TEMPLATES } from './roles.js';

describe('PermissionSet', () => {
  it('merges grants from several roles keeping the broadest scope', () => {
    const set = PermissionSet.fromGrants([
      { permission: 'students.read', scope: 'assigned' },
      { permission: 'students.read', scope: 'branch' },
      { permission: 'attendance.write', scope: 'assigned' },
    ]);
    expect(set.scopeOf('students.read')).toBe('branch');
    expect(set.scopeOf('attendance.write')).toBe('assigned');
    expect(set.size).toBe(2);
  });

  it('fails closed on unknown permissions, unknown scopes and disallowed scopes', () => {
    const set = PermissionSet.fromGrants([
      { permission: 'students.teleport', scope: 'organization' },
      { permission: 'students.read', scope: 'galaxy' },
      // settings.roles.manage only supports organization scope
      { permission: 'settings.roles.manage', scope: 'branch' },
    ]);
    expect(set.size).toBe(0);
  });

  it('answers scope requirements', () => {
    const set = PermissionSet.fromGrants([
      { permission: 'students.read', scope: 'branch' },
      { permission: 'attendance.read', scope: 'assigned' },
    ]);
    expect(set.has('students.read')).toBe(true);
    expect(set.has('students.read', 'assigned')).toBe(true);
    expect(set.has('students.read', 'organization')).toBe(false);
    expect(set.has('attendance.read', 'branch')).toBe(false);
    expect(set.has('finance.payments.read')).toBe(false);
    expect(set.hasAny(['finance.payments.read', 'students.read'])).toBe(true);
    expect(set.hasAll(['finance.payments.read', 'students.read'])).toBe(false);
  });

  it('round-trips through a plain record', () => {
    const set = PermissionSet.fromGrants(ROLE_TEMPLATES.accountant.grants);
    const restored = PermissionSet.fromRecord(set.toRecord());
    expect(restored.toRecord()).toEqual(set.toRecord());
  });

  it('detects organization-wide access', () => {
    expect(
      PermissionSet.fromGrants(ROLE_TEMPLATES.teacher.grants).hasOrganizationWideAccess(),
    ).toBe(false);
    expect(PermissionSet.fromGrants(ROLE_TEMPLATES.owner.grants).hasOrganizationWideAccess()).toBe(
      true,
    );
  });

  it('drops permissions of disabled modules', () => {
    const set = PermissionSet.fromGrants(ROLE_TEMPLATES.owner.grants).restrictToModules(
      new Set(['students', 'administration']),
    );
    expect(set.has('students.read')).toBe(true);
    expect(set.has('finance.payments.read')).toBe(false);
  });
});

describe('findEscalations', () => {
  const branchAdmin = PermissionSet.fromGrants(ROLE_TEMPLATES.branch_manager.grants);

  it('allows delegating held permissions with equal or narrower scope', () => {
    expect(findEscalations(branchAdmin, ROLE_TEMPLATES.teacher.grants)).toEqual([]);
  });

  it('rejects permissions the actor does not hold', () => {
    const violations = findEscalations(branchAdmin, ROLE_TEMPLATES.accountant.grants);
    expect(violations.map((v) => v.permission)).toContain('finance.payments.create');
  });

  it('rejects broader scopes than the actor holds', () => {
    const violations = findEscalations(branchAdmin, [
      { permission: 'students.read', scope: 'organization' },
    ]);
    expect(violations).toHaveLength(1);
  });

  it('treats own and assigned as unrelated scopes', () => {
    const actor = PermissionSet.fromGrants([{ permission: 'admissions.read', scope: 'own' }]);
    expect(findEscalations(actor, [{ permission: 'admissions.read', scope: 'own' }])).toEqual([]);
    expect(
      findEscalations(actor, [{ permission: 'admissions.read', scope: 'branch' }]),
    ).toHaveLength(1);
  });
});

describe('findMissingDependencies', () => {
  it('reports dependencies that are missing or too narrow', () => {
    expect(
      findMissingDependencies([{ permission: 'finance.payments.create', scope: 'branch' }]),
    ).toEqual([
      { permission: 'finance.payments.create', missing: 'finance.payments.read' },
      { permission: 'finance.payments.create', missing: 'finance.collections.read' },
    ]);
    expect(
      findMissingDependencies([
        { permission: 'students.create', scope: 'branch' },
        { permission: 'students.read', scope: 'assigned' },
      ]),
    ).toEqual([{ permission: 'students.create', missing: 'students.read' }]);
  });
});
