import { Injectable } from '@nestjs/common';
import type { GuardianListItem, GuardianListQuery, Paginated } from '@repo/contracts';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { guardians, studentGuardians, students } from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import {
  guardianScopePredicate,
  studentScopePredicate,
} from '../../core/authorization/scope-filters.js';

const TR = sql.raw('COLLATE "tr-x-icu"');

@Injectable()
export class GuardiansService {
  constructor(private readonly db: TenantDatabase) {}

  async list(actor: Actor, query: GuardianListQuery): Promise<Paginated<GuardianListItem>> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const where = and(
        eq(guardians.organizationId, actor.organizationId),
        isNull(guardians.archivedAt),
        guardianScopePredicate(actor, guardians.id),
        query.q
          ? sql`${guardians.searchText} LIKE '%' || app.search_normalize(${query.q}) || '%'`
          : undefined,
      );
      const [total] = await tx.select({ value: count() }).from(guardians).where(where);
      const rows = await tx
        .select({
          id: guardians.id,
          firstName: guardians.firstName,
          lastName: guardians.lastName,
          phone: guardians.phone,
          email: guardians.email,
        })
        .from(guardians)
        .where(where)
        .orderBy(asc(sql`${guardians.lastName} ${TR}`), asc(sql`${guardians.firstName} ${TR}`))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      // Linked students, limited to those the caller may see.
      const linked =
        rows.length && actor.can('students.read')
          ? await tx
              .select({
                guardianId: studentGuardians.guardianId,
                id: students.id,
                firstName: students.firstName,
                lastName: students.lastName,
              })
              .from(studentGuardians)
              .innerJoin(students, eq(students.id, studentGuardians.studentId))
              .where(
                and(
                  eq(studentGuardians.organizationId, actor.organizationId),
                  inArray(
                    studentGuardians.guardianId,
                    rows.map((row) => row.id),
                  ),
                  isNull(students.archivedAt),
                  studentScopePredicate(actor, 'students.read', {
                    studentId: students.id,
                    branchId: students.branchId,
                  }),
                ),
              )
          : [];
      return {
        items: rows.map((row) => ({
          id: row.id,
          fullName: `${row.firstName} ${row.lastName}`,
          phone: row.phone,
          email: row.email,
          students: linked
            .filter((student) => student.guardianId === row.id)
            .map((student) => ({
              id: student.id,
              name: `${student.firstName} ${student.lastName}`,
            })),
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }
}
