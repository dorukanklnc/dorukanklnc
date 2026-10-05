/**
 * Authorization scopes, from narrowest to broadest.
 *
 * - `own`          records the member owns or created (e.g. leads assigned to an admissions officer)
 * - `assigned`     records reachable through an assignment (teacher → class → students)
 * - `branch`       records that belong to one of the member's branches
 * - `organization` every record of the organization (all branches)
 *
 * `platform` is deliberately *not* a tenant scope: platform staff permissions live in
 * {@link PLATFORM_PERMISSIONS} and can never be granted through tenant roles.
 *
 * `own` and `assigned` are different dimensions, not a hierarchy. The permission catalog
 * guarantees that no permission allows both, so a single "broadest scope" per permission is
 * always well defined (see catalog tests).
 */
export const SCOPES = ['own', 'assigned', 'branch', 'organization'] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_RANK: Readonly<Record<Scope, number>> = {
  own: 1,
  assigned: 2,
  branch: 3,
  organization: 4,
};

export function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value);
}

/** Returns the broader of two scopes. */
export function broaderScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/**
 * Whether holding `granted` satisfies a requirement of `required`.
 *
 * `branch` and `organization` cover every narrower scope. `own` and `assigned` only cover
 * themselves because they describe unrelated record sets.
 */
export function scopeCovers(granted: Scope, required: Scope): boolean {
  if (granted === required) return true;
  if (granted === 'branch' || granted === 'organization') {
    return SCOPE_RANK[granted] >= SCOPE_RANK[required];
  }
  return false;
}

export function scopeRank(scope: Scope): number {
  return SCOPE_RANK[scope];
}
