import { describe, expect, it } from 'vitest';
import { MODULE_KEYS } from './modules.js';
import { findMissingDependencies } from './permission-set.js';
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  broadestAllowedScope,
  getPermission,
  isPermissionKey,
  isScopeAllowed,
} from './permissions.js';
import { ROLE_TEMPLATES, ROLE_TEMPLATE_KEYS } from './roles.js';
import { SCOPES, scopeRank } from './scopes.js';

describe('permission catalog', () => {
  it('uses RESOURCE.ACTION keys', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('declares valid, ordered scopes for every permission', () => {
    for (const key of PERMISSION_KEYS) {
      const scopes = getPermission(key).scopes;
      expect(scopes.length, key).toBeGreaterThan(0);
      for (const scope of scopes) expect(SCOPES).toContain(scope);
      const ranks = scopes.map(scopeRank);
      expect([...ranks].sort((a, b) => a - b), key).toEqual(ranks);
    }
  });

  it('never allows both `own` and `assigned` on the same permission', () => {
    for (const key of PERMISSION_KEYS) {
      const scopes = getPermission(key).scopes;
      expect(scopes.includes('own') && scopes.includes('assigned'), key).toBe(false);
    }
  });

  it('references existing modules and dependencies only', () => {
    for (const key of PERMISSION_KEYS) {
      const definition = getPermission(key);
      expect(MODULE_KEYS).toContain(definition.module);
      for (const dependency of definition.dependsOn ?? []) {
        expect(isPermissionKey(dependency), `${key} → ${dependency}`).toBe(true);
      }
    }
  });
});

describe('role templates', () => {
  it('only grant catalog permissions with allowed scopes', () => {
    for (const templateKey of ROLE_TEMPLATE_KEYS) {
      for (const { permission, scope } of ROLE_TEMPLATES[templateKey].grants) {
        expect(isPermissionKey(permission), `${templateKey}: ${permission}`).toBe(true);
        expect(isScopeAllowed(permission, scope), `${templateKey}: ${permission}@${scope}`).toBe(
          true,
        );
      }
    }
  });

  it('satisfy permission dependencies', () => {
    for (const templateKey of ROLE_TEMPLATE_KEYS) {
      expect(findMissingDependencies(ROLE_TEMPLATES[templateKey].grants), templateKey).toEqual([]);
    }
  });

  it('give the owner every permission at its broadest scope', () => {
    const owner = new Map(ROLE_TEMPLATES.owner.grants.map((g) => [g.permission, g.scope]));
    expect(owner.size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) expect(owner.get(key)).toBe(broadestAllowedScope(key));
  });

  it('never give teachers access to finance', () => {
    const financePermissions = ROLE_TEMPLATES.teacher.grants.filter(
      (g) => PERMISSIONS[g.permission].module === 'finance',
    );
    expect(financePermissions).toEqual([]);
  });

  it('limit teachers to assigned records', () => {
    for (const { scope } of ROLE_TEMPLATES.teacher.grants) expect(scope).toBe('assigned');
  });

  it('keep accounting away from academic and attendance data', () => {
    const forbiddenModules = new Set(['academics', 'attendance', 'admissions', 'personnel']);
    for (const { permission } of ROLE_TEMPLATES.accountant.grants) {
      expect(forbiddenModules.has(PERMISSIONS[permission].module), permission).toBe(false);
    }
    const permissions = ROLE_TEMPLATES.accountant.grants.map((g) => g.permission);
    expect(permissions).not.toContain('students.sensitive.read');
  });

  it('give principals aggregate finance KPIs but not individual accounts', () => {
    const permissions = ROLE_TEMPLATES.principal.grants.map((g) => g.permission);
    expect(permissions).toContain('finance.kpis.read');
    expect(permissions).not.toContain('finance.collections.read');
    expect(permissions).not.toContain('finance.payments.read');
  });
});
