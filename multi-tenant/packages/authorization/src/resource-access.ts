import type { Scope } from './scopes.js';

/** Who is asking: the member's identity and branch access inside the active organization. */
export interface AccessSubject {
  readonly membershipId: string;
  /** Organization-wide branch access (`memberships.all_branches`). */
  readonly allBranches: boolean;
  /** Branches assigned to the membership when `allBranches` is false. */
  readonly branchIds: readonly string[];
}

/** What is being accessed, reduced to the attributes scope rules need. */
export interface ResourceAttributes {
  /** Branch the record belongs to, or branches for records spanning several (e.g. guardians). */
  readonly branchIds?: readonly (string | null | undefined)[];
  /** Membership that owns the record (e.g. the admissions officer assigned to a lead). */
  readonly ownerMembershipId?: string | null;
  /** Whether the record is reachable through one of the subject's assignments. */
  readonly assigned?: boolean;
}

/**
 * Record-level scope check (the "ABAC-like" part of the model).
 *
 * List endpoints translate scopes into SQL predicates instead; this function is used for single
 * record decisions and as the executable specification of what each scope means.
 */
export function isWithinScope(
  scope: Scope,
  subject: AccessSubject,
  resource: ResourceAttributes,
): boolean {
  switch (scope) {
    case 'organization':
      return true;
    case 'branch': {
      if (subject.allBranches) return true;
      const branches = (resource.branchIds ?? []).filter((id): id is string => Boolean(id));
      return branches.some((id) => subject.branchIds.includes(id));
    }
    case 'assigned':
      return resource.assigned === true;
    case 'own':
      return (
        Boolean(resource.ownerMembershipId) && resource.ownerMembershipId === subject.membershipId
      );
  }
}

/**
 * The branch filter a subject's data access is bounded by, given its effective permissions:
 * `'*'` (no bound) or the explicit branch list. Used for the database row-level-security
 * branch boundary, which is a coarse outer limit; fine-grained scopes are enforced per query.
 */
export function branchBoundary(
  subject: Pick<AccessSubject, 'allBranches' | 'branchIds'>,
  hasOrganizationWideAccess: boolean,
): '*' | readonly string[] {
  if (subject.allBranches || hasOrganizationWideAccess) return '*';
  return subject.branchIds;
}
