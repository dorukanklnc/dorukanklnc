import type { PermissionKey } from '@repo/authorization';
import { type AnyColumn, type SQL, inArray, sql } from 'drizzle-orm';
import type { Actor } from './actor.js';

/**
 * Translates scopes into SQL predicates. Every list/search/aggregate query over scoped data
 * combines the module's own filters with one of these. RLS bounds the tenant (and coarse branch)
 * independently; these predicates add the precise per-permission scope.
 */

const FALSE: SQL = sql`false`;

/** Branch predicate for `branch`/`organization` scoped permissions; `undefined` = no restriction. */
export function branchPredicate(
  actor: Actor,
  permission: PermissionKey,
  branchColumn: AnyColumn,
): SQL | undefined {
  const branches = actor.branchesFor(permission);
  if (branches === '*') return undefined;
  if (branches.length === 0) return FALSE;
  return inArray(branchColumn, [...branches]);
}

/** Students reachable through the actor's active teacher assignments. */
export function assignedStudentsPredicate(actor: Actor, studentIdColumn: AnyColumn): SQL {
  const personnelId = actor.tenant().membership.personnelId;
  if (!personnelId) return FALSE;
  return sql`EXISTS (
    SELECT 1 FROM class_enrollments ce
    JOIN teacher_assignments ta
      ON ta.organization_id = ce.organization_id AND ta.class_id = ce.class_id
    WHERE ce.organization_id = ${actor.organizationId}
      AND ce.student_id = ${studentIdColumn}
      AND ce.status = 'active'
      AND ta.personnel_id = ${personnelId}
      AND (ta.ends_on IS NULL OR ta.ends_on >= current_date)
  )`;
}

/** Classes the actor teaches. */
export function assignedClassesPredicate(actor: Actor, classIdColumn: AnyColumn): SQL {
  const personnelId = actor.tenant().membership.personnelId;
  if (!personnelId) return FALSE;
  return sql`EXISTS (
    SELECT 1 FROM teacher_assignments ta
    WHERE ta.organization_id = ${actor.organizationId}
      AND ta.class_id = ${classIdColumn}
      AND ta.personnel_id = ${personnelId}
      AND (ta.ends_on IS NULL OR ta.ends_on >= current_date)
  )`;
}

/**
 * Scope predicate for student-centric permissions (`students.read`, `attendance.read`, …):
 * organization → none, branch → student's branch, assigned → teacher assignments.
 */
export function studentScopePredicate(
  actor: Actor,
  permission: PermissionKey,
  columns: { studentId: AnyColumn; branchId: AnyColumn },
): SQL | undefined {
  const scope = actor.scopeFor(permission);
  switch (scope) {
    case 'organization':
      return undefined;
    case 'branch':
      return branchPredicate(actor, permission, columns.branchId);
    case 'assigned':
      return assignedStudentsPredicate(actor, columns.studentId);
    case 'own':
      return FALSE;
  }
}

/** Guardians linked to at least one student visible under `students.read`/`guardians.read`. */
export function guardianScopePredicate(actor: Actor, guardianIdColumn: AnyColumn): SQL | undefined {
  const scope = actor.scopeFor('guardians.read');
  if (scope === 'organization') return undefined;
  const branches = actor.branchesFor('guardians.read');
  if (scope === 'branch') {
    if (branches === '*') return undefined;
    if (branches.length === 0) return FALSE;
    return sql`EXISTS (
      SELECT 1 FROM student_guardians sg
      JOIN students s ON s.organization_id = sg.organization_id AND s.id = sg.student_id
      WHERE sg.organization_id = ${actor.organizationId}
        AND sg.guardian_id = ${guardianIdColumn}
        AND s.branch_id IN (${sql.join(
          branches.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    )`;
  }
  if (scope === 'assigned') {
    const personnelId = actor.tenant().membership.personnelId;
    if (!personnelId) return FALSE;
    return sql`EXISTS (
      SELECT 1 FROM student_guardians sg
      JOIN class_enrollments ce
        ON ce.organization_id = sg.organization_id AND ce.student_id = sg.student_id AND ce.status = 'active'
      JOIN teacher_assignments ta
        ON ta.organization_id = ce.organization_id AND ta.class_id = ce.class_id
      WHERE sg.organization_id = ${actor.organizationId}
        AND sg.guardian_id = ${guardianIdColumn}
        AND ta.personnel_id = ${personnelId}
        AND (ta.ends_on IS NULL OR ta.ends_on >= current_date)
    )`;
  }
  return FALSE;
}
