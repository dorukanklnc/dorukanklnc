import { MODULE_KEYS, type ModuleKey, PermissionSet, ROLE_TEMPLATES } from '@repo/authorization';
import { describe, expect, it } from 'vitest';
import type { AccessContext } from './access';
import { activeNavHref, homePath, visibleNavigation } from './navigation';

function accessFor(
  role: keyof typeof ROLE_TEMPLATES,
  options: { modules?: readonly ModuleKey[]; platform?: boolean } = {},
): AccessContext {
  const modules = new Set(options.modules ?? MODULE_KEYS);
  return {
    permissions: PermissionSet.fromGrants(ROLE_TEMPLATES[role].grants).restrictToModules(modules),
    enabledModules: modules,
    platformPermissions: new Set(
      options.platform ? (['platform.organizations.manage'] as const) : [],
    ),
    hasOrganization: true,
  };
}

const items = (access: AccessContext) =>
  visibleNavigation(access).flatMap((group) => group.items.map((item) => item.key));

describe('role-based navigation (unauthorized items are hidden, not disabled)', () => {
  it('shows the owner every organization screen but no platform console', () => {
    expect(items(accessFor('owner'))).toEqual([
      'dashboard',
      'students',
      'guardians',
      'classes',
      'collections',
      'installments',
      'payments',
      'overdue',
      'users',
      'roles',
      'branches',
      'organization',
      'audit',
    ]);
  });

  it('never shows finance to teachers', () => {
    const groups = visibleNavigation(accessFor('teacher')).map((group) => group.key);
    expect(groups).not.toContain('finance');
    expect(groups).not.toContain('administration');
    expect(items(accessFor('teacher'))).toEqual(['dashboard', 'students', 'guardians', 'classes']);
  });

  it('gives accounting the collections workspace without administration or academics', () => {
    const keys = items(accessFor('accountant'));
    expect(keys).toEqual(
      expect.arrayContaining(['collections', 'installments', 'payments', 'overdue']),
    );
    expect(keys).not.toContain('classes');
    expect(keys).not.toContain('users');
    expect(keys).not.toContain('audit');
  });

  it('shows principals aggregate dashboards but not individual finance screens', () => {
    const keys = items(accessFor('principal'));
    expect(keys).not.toContain('collections');
    expect(keys).not.toContain('payments');
    expect(keys).toContain('students');
  });

  it('hides screens of disabled modules even when the role grants them', () => {
    const keys = items(accessFor('owner', { modules: ['students', 'administration'] }));
    expect(keys).not.toContain('collections');
    expect(keys).not.toContain('classes');
    expect(keys).toContain('students');
  });

  it('shows platform staff without an organization only the platform console', () => {
    const access: AccessContext = {
      permissions: PermissionSet.empty(),
      enabledModules: new Set(),
      platformPermissions: new Set(['platform.organizations.manage']),
      hasOrganization: false,
    };
    expect(items(access)).toEqual(['organizations']);
    expect(homePath(access)).toBe('/platform/organizations');
  });

  it('sends members without an organization to the organization picker', () => {
    const access: AccessContext = {
      permissions: PermissionSet.empty(),
      enabledModules: new Set(),
      platformPermissions: new Set(),
      hasOrganization: false,
    };
    expect(items(access)).toEqual([]);
    expect(homePath(access)).toBe('/select-organization');
  });
});

describe('activeNavHref', () => {
  const groups = visibleNavigation(accessFor('owner'));

  it('picks the longest matching prefix', () => {
    expect(activeNavHref('/finance/payments/0193', groups)).toBe('/finance/payments');
    expect(activeNavHref('/finance', groups)).toBe('/finance');
    expect(activeNavHref('/students/0193', groups)).toBe('/students');
  });

  it('does not match partial segments', () => {
    expect(activeNavHref('/students-archive', groups)).toBeNull();
  });
});
