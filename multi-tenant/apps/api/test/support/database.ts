import pg from 'pg';
import { TEST_ENV } from './environment.js';

/** Direct database access for security tests (bypasses the application on purpose). */
export async function withClient<T>(
  url: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export const asSystem = <T>(fn: (client: pg.Client) => Promise<T>) =>
  withClient(TEST_ENV.systemUrl, fn);
export const asOwner = <T>(fn: (client: pg.Client) => Promise<T>) =>
  withClient(TEST_ENV.ownerUrl, fn);

/**
 * Runs `fn` as app_runtime inside a transaction with the given tenant context, exactly like
 * TenantDatabase does, then rolls back.
 */
export async function asTenant<T>(
  context: { organizationId: string | null; userId?: string | null; branchIds?: '*' | string[] },
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  return withClient(TEST_ENV.runtimeUrl, async (client) => {
    await client.query('BEGIN');
    try {
      if (context.organizationId) {
        const branches = context.branchIds ?? '*';
        await client.query(
          "SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('app.branch_ids', $3, true)",
          [
            context.organizationId,
            context.userId ?? '',
            branches === '*' ? '*' : branches.join(','),
          ],
        );
      }
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
}

export interface Fixtures {
  atlasId: string;
  novaId: string;
  kadikoyId: string;
  atasehirId: string;
  /** A student per branch/tenant with finance history. */
  atlasKadikoyStudentId: string;
  atlasAtasehirStudentId: string;
  novaStudentId: string;
  atlasKadikoyPaymentId: string;
  atlasAtasehirPaymentId: string;
  novaPaymentId: string;
  /** A Kadıköy student outside the demo teacher's classes. */
  unassignedKadikoyStudentId: string;
}

/** Resolves stable ids from the seeded demo data. */
export async function loadFixtures(): Promise<Fixtures> {
  return asSystem(async (client) => {
    const one = async (sql: string, params: unknown[] = []) => {
      const result = await client.query<{ id: string }>(sql, params);
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`Fixture query returned nothing: ${sql}`);
      return id;
    };
    const atlasId = await one("SELECT id FROM organizations WHERE slug = 'atlas'");
    const novaId = await one("SELECT id FROM organizations WHERE slug = 'nova'");
    const kadikoyId = await one(
      "SELECT id FROM branches WHERE organization_id = $1 AND code = 'KDK'",
      [atlasId],
    );
    const atasehirId = await one(
      "SELECT id FROM branches WHERE organization_id = $1 AND code = 'ATS'",
      [atlasId],
    );
    const studentWithPayment = (organizationId: string, branchId: string) =>
      one(
        `SELECT s.id FROM students s WHERE s.organization_id = $1 AND s.branch_id = $2
           AND EXISTS (SELECT 1 FROM payments p WHERE p.student_id = s.id) ORDER BY s.student_number LIMIT 1`,
        [organizationId, branchId],
      );
    const novaBranch = await one(
      "SELECT id FROM branches WHERE organization_id = $1 AND code = 'CNK'",
      [novaId],
    );
    const atlasKadikoyStudentId = await studentWithPayment(atlasId, kadikoyId);
    const atlasAtasehirStudentId = await studentWithPayment(atlasId, atasehirId);
    const novaStudentId = await studentWithPayment(novaId, novaBranch);
    const paymentOf = (studentId: string) =>
      one('SELECT id FROM payments WHERE student_id = $1 ORDER BY received_at LIMIT 1', [
        studentId,
      ]);
    const unassignedKadikoyStudentId = await one(
      `SELECT s.id FROM students s
         JOIN class_enrollments ce ON ce.student_id = s.id AND ce.status = 'active'
         JOIN classes c ON c.id = ce.class_id
        WHERE s.organization_id = $1 AND s.branch_id = $2 AND c.name = '9-B' LIMIT 1`,
      [atlasId, kadikoyId],
    );
    return {
      atlasId,
      novaId,
      kadikoyId,
      atasehirId,
      atlasKadikoyStudentId,
      atlasAtasehirStudentId,
      novaStudentId,
      atlasKadikoyPaymentId: await paymentOf(atlasKadikoyStudentId),
      atlasAtasehirPaymentId: await paymentOf(atlasAtasehirStudentId),
      novaPaymentId: await paymentOf(novaStudentId),
      unassignedKadikoyStudentId,
    };
  });
}
