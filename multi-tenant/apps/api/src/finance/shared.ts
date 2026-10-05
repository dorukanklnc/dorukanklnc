import type { PermissionKey } from '@repo/authorization';
import { and, eq, isNull } from 'drizzle-orm';
import { financialAccounts, studentGuardians, guardians, students } from '../platform/database/schema/index.js';
import type { DbExecutor } from '../platform/database/types.js';
import { Errors } from '../platform/errors/app-error.js';
import type { Actor } from '../core/authorization/actor.js';
import { branchPredicate } from '../core/authorization/scope-filters.js';

export interface FinanceStudent {
  id: string;
  branchId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
}

/** Loads a student the actor may act on for a finance permission (branch/organization scope). */
export async function loadStudentForFinance(
  db: DbExecutor,
  actor: Actor,
  studentId: string,
  permission: PermissionKey,
): Promise<FinanceStudent> {
  const [student] = await db
    .select({
      id: students.id,
      branchId: students.branchId,
      firstName: students.firstName,
      lastName: students.lastName,
      studentNumber: students.studentNumber,
    })
    .from(students)
    .where(
      and(
        eq(students.organizationId, actor.organizationId),
        eq(students.id, studentId),
        branchPredicate(actor, permission, students.branchId),
      ),
    )
    .limit(1);
  if (!student) throw Errors.notFound('Student');
  return student;
}

/** The student's receivable account for a branch and currency, created on first use. */
export async function findOrCreateAccount(
  db: DbExecutor,
  input: { organizationId: string; branchId: string; studentId: string; currency: string },
): Promise<string> {
  const [created] = await db
    .insert(financialAccounts)
    .values(input)
    .onConflictDoNothing({
      target: [
        financialAccounts.organizationId,
        financialAccounts.studentId,
        financialAccounts.branchId,
        financialAccounts.currency,
      ],
    })
    .returning({ id: financialAccounts.id });
  if (created) return created.id;
  const [existing] = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.organizationId, input.organizationId),
        eq(financialAccounts.studentId, input.studentId),
        eq(financialAccounts.branchId, input.branchId),
        eq(financialAccounts.currency, input.currency),
      ),
    );
  if (!existing) throw new Error('Financial account could not be resolved');
  return existing.id;
}

/** Guardian linked to the student (payer / responsible party validation). */
export async function loadLinkedGuardian(
  db: DbExecutor,
  organizationId: string,
  studentId: string,
  guardianId: string,
): Promise<{ id: string; fullName: string }> {
  const [guardian] = await db
    .select({ id: guardians.id, firstName: guardians.firstName, lastName: guardians.lastName })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(
      and(
        eq(studentGuardians.organizationId, organizationId),
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.guardianId, guardianId),
        isNull(guardians.archivedAt),
      ),
    );
  if (!guardian) {
    throw Errors.validation([{ path: 'guardianId', code: 'not_linked', message: 'Guardian is not linked to the student' }]);
  }
  return { id: guardian.id, fullName: `${guardian.firstName} ${guardian.lastName}` };
}
