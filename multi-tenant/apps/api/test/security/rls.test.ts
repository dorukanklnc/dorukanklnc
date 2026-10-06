import { type Fixtures, asOwner, asSystem, asTenant, loadFixtures } from '../support/database.js';

/**
 * Database-level isolation: these tests talk to PostgreSQL directly as the runtime role, so they
 * prove the guarantees hold even if application code forgot a filter.
 */
describe('row-level security (database level)', () => {
  let f: Fixtures;

  beforeAll(async () => {
    f = await loadFixtures();
  });

  it('returns no rows without a tenant context (fail closed)', async () => {
    await asTenant({ organizationId: null }, async (db) => {
      for (const table of [
        'students',
        'guardians',
        'payments',
        'receivables',
        'branches',
        'roles',
      ]) {
        const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
        expect(rows[0]?.n, table).toBe(0);
      }
    });
  });

  it('isolates tenants: Atlas context cannot read Nova students or payments', async () => {
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      const students = await db.query('SELECT id FROM students WHERE id = $1', [f.novaStudentId]);
      const payments = await db.query('SELECT id FROM payments WHERE id = $1', [f.novaPaymentId]);
      const foreign = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM students WHERE organization_id <> $1',
        [f.atlasId],
      );
      expect(students.rowCount).toBe(0);
      expect(payments.rowCount).toBe(0);
      expect(foreign.rows[0]?.n).toBe(0);
    });
  });

  it('rejects writes into another tenant (WITH CHECK)', async () => {
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      await expect(
        db.query(
          `INSERT INTO guardians (organization_id, first_name, last_name) VALUES ($1, 'Kötü', 'Niyet')`,
          [f.novaId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('cannot update or touch another tenant’s rows', async () => {
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      const result = await db.query(
        `UPDATE students SET first_name = 'Ele geçirildi' WHERE id = $1`,
        [f.novaStudentId],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it('enforces the coarse branch boundary', async () => {
    await asTenant({ organizationId: f.atlasId, branchIds: [f.kadikoyId] }, async (db) => {
      const ats = await db.query('SELECT id FROM students WHERE id = $1', [
        f.atlasAtasehirStudentId,
      ]);
      const atsPayment = await db.query('SELECT id FROM payments WHERE id = $1', [
        f.atlasAtasehirPaymentId,
      ]);
      const kdk = await db.query('SELECT id FROM students WHERE id = $1', [
        f.atlasKadikoyStudentId,
      ]);
      expect(ats.rowCount).toBe(0);
      expect(atsPayment.rowCount).toBe(0);
      expect(kdk.rowCount).toBe(1);
    });
  });

  it('hides credentials and the outbox from the runtime role', async () => {
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      await expect(db.query('SELECT password_hash FROM users LIMIT 1')).rejects.toThrow(
        /permission denied/,
      );
    });
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      await expect(db.query('SELECT * FROM sessions LIMIT 1')).rejects.toThrow(/permission denied/);
    });
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      await expect(db.query('SELECT * FROM outbox_events LIMIT 1')).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it('keeps the audit log append-only for every role', async () => {
    await asSystem(async (db) => {
      await expect(db.query(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow();
    });
    await asSystem(async (db) => {
      await expect(db.query('DELETE FROM audit_logs')).rejects.toThrow();
    });
  });

  it('forbids deleting financial history', async () => {
    await asTenant({ organizationId: f.atlasId }, async (db) => {
      await expect(
        db.query('DELETE FROM payments WHERE id = $1', [f.atlasKadikoyPaymentId]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('shows the schema owner nothing (FORCE ROW LEVEL SECURITY)', async () => {
    await asOwner(async (db) => {
      const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM students');
      expect(rows[0]?.n).toBe(0);
    });
  });

  it('rejects cross-tenant references through composite foreign keys', async () => {
    await asSystem(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        'SELECT guardian_id AS id FROM student_guardians WHERE organization_id = $1 LIMIT 1',
        [f.novaId],
      );
      // An Atlas student linked to a Nova guardian: unrepresentable, even for the system role.
      await expect(
        db.query(
          `INSERT INTO student_guardians (organization_id, student_id, guardian_id, relationship)
           VALUES ($1, $2, $3, 'other')`,
          [f.atlasId, f.atlasKadikoyStudentId, rows[0]!.id],
        ),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it('validates allocations against payment and receivable accounts in the database', async () => {
    await asSystem(async (db) => {
      const { rows } = await db.query<{ account_id: string; branch_id: string }>(
        'SELECT account_id, branch_id FROM payments WHERE id = $1',
        [f.novaPaymentId],
      );
      await expect(
        db.query(
          `INSERT INTO payment_allocations (organization_id, branch_id, account_id, payment_id, receivable_id, amount_minor)
           SELECT $1, $2, $3, $4, r.id, 1 FROM receivables r WHERE r.organization_id = $1 LIMIT 1`,
          [f.atlasId, rows[0]!.branch_id, rows[0]!.account_id, f.novaPaymentId],
        ),
      ).rejects.toThrow();
    });
  });
});
