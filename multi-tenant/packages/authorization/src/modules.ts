/**
 * Product modules. A module can be switched on or off per organization (plan / settings);
 * permissions of a disabled module are ignored and its navigation is hidden.
 */
export const MODULE_KEYS = [
  'students',
  'admissions',
  'academics',
  'attendance',
  'personnel',
  'finance',
  'reports',
  'administration',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Modules every organization has regardless of plan. */
export const CORE_MODULES: readonly ModuleKey[] = ['students', 'administration'];

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && (MODULE_KEYS as readonly string[]).includes(value);
}
