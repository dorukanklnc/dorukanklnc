import { randomUUID } from 'node:crypto';
import { type TestApp, type TestClient, createTestApp } from '../support/app.js';
import { type Fixtures, asSystem, asTenant, loadFixtures } from '../support/database.js';

interface Created {
  studentId: string;
  guardianId: string;
  agreementId: string;
}

/**
 * The first vertical slice end to end: student → tuition plan → installments → payment →
 * allocation → balance → audit → outbox, plus the financial invariants around it.
 */
describe('collections vertical slice', () => {
  let t: TestApp;
  let f: Fixtures;
  let studentAffairs: TestClient;
  let accountant: TestClient;
  let created: Created;

  const pay = (body: object, key = randomUUID()) =>
    accountant.post('/api/v1/finance/payments', body, { 'idempotency-key': key });

  beforeAll(async () => {
    t = await createTestApp();
    f = await loadFixtures();
    studentAffairs = await t.login('ogrenciisleri@atlas.test');
    accountant = await t.login('muhasebe@atlas.test');

    const student = await studentAffairs.post('/api/v1/students', {
      branchId: f.kadikoyId,
      firstName: 'Ece',
      lastName: 'Tahsilat',
      guardians: [
        {
          firstName: 'Ayten',
          lastName: 'Tahsilat',
          phone: '0500 000 12 34',
          relationship: 'mother',
        },
      ],
    });
    expect(student.status).toBe(201);

    const agreement = await accountant.post('/api/v1/finance/agreements', {
      studentId: student.body.id,
      title: 'Test Eğitim Ücreti',
      grossAmountMinor: 12_000_000,
      responsibleGuardianId: student.body.guardians[0].id,
      discounts: [
        { kind: 'percentage', category: 'scholarship', label: 'Burs', percentageBps: 2500 },
      ],
      plan: {
        installmentCount: 4,
        firstDueDate: '2030-01-10',
        downPaymentMinor: 1_000_000,
        downPaymentDueDate: '2029-12-15',
      },
    });
    expect(agreement.status).toBe(201);
    created = {
      studentId: student.body.id,
      guardianId: student.body.guardians[0].id,
      agreementId: agreement.body.id,
    };
  });

  afterAll(async () => {
    await t.close();
  });

  it('generates installments that sum to the net amount', async () => {
    const response = await accountant.get(
      `/api/v1/finance/receivables?studentId=${created.studentId}&pageSize=50`,
    );
    expect(response.status).toBe(200);
    const items = response.body.items as {
      amountMinor: number;
      sequenceNo: number;
      dueDate: string;
    }[];
    expect(items).toHaveLength(5);
    expect(items.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(9_000_000);
    expect(items[0]).toMatchObject({
      sequenceNo: 0,
      amountMinor: 1_000_000,
      dueDate: '2029-12-15',
    });
    expect(items.map((item) => item.dueDate)).toEqual([
      '2029-12-15',
      '2030-01-10',
      '2030-02-10',
      '2030-03-10',
      '2030-04-10',
    ]);
  });

  it('records a payment, allocates oldest first and updates the balance', async () => {
    const response = await pay({
      studentId: created.studentId,
      amountMinor: 3_000_000,
      method: 'bank_transfer',
      payerGuardianId: created.guardianId,
    });
    expect(response.status).toBe(201);
    expect(response.body.receiptNumber).toMatch(/^TAH-\d{4}-\d{6}$/);
    expect(response.body.payerName).toBe('Ayten Tahsilat');
    expect(response.body.allocations.map((a: { amountMinor: number }) => a.amountMinor)).toEqual([
      1_000_000, 2_000_000,
    ]);

    const finance = await accountant.get(`/api/v1/finance/students/${created.studentId}`);
    expect(finance.body.accounts[0]).toMatchObject({
      totalDueMinor: 9_000_000,
      paidMinor: 3_000_000,
      outstandingMinor: 6_000_000,
      creditMinor: 0,
    });

    const paymentId = response.body.id as string;
    await asSystem(async (db) => {
      const audit = await db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'payment.created' AND resource_id = $1",
        [paymentId],
      );
      const outbox = await db.query<{ payload: { amountMinor: number } }>(
        "SELECT payload FROM outbox_events WHERE event_type = 'payment.received' AND aggregate_id = $1",
        [paymentId],
      );
      expect(audit.rowCount).toBe(1);
      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]?.payload.amountMinor).toBe(3_000_000);
    });
  });

  it('keeps unallocated money as account credit', async () => {
    const before = await accountant.get(`/api/v1/finance/students/${created.studentId}`);
    const outstanding = before.body.accounts[0].outstandingMinor as number;
    const response = await pay({
      studentId: created.studentId,
      amountMinor: outstanding + 50_000,
      method: 'cash',
    });
    expect(response.status).toBe(201);
    expect(response.body.unallocatedMinor).toBe(50_000);
    const after = await accountant.get(`/api/v1/finance/students/${created.studentId}`);
    expect(after.body.accounts[0]).toMatchObject({ outstandingMinor: 0, creditMinor: 50_000 });
  });

  it('rejects manual allocations above the outstanding amount', async () => {
    const charge = await accountant.post('/api/v1/finance/receivables/charges', {
      studentId: created.studentId,
      category: 'books',
      description: 'Kitap seti',
      amountMinor: 200_000,
      dueDate: '2030-01-05',
    });
    expect(charge.status).toBe(201);
    const response = await pay({
      studentId: created.studentId,
      amountMinor: 300_000,
      method: 'cash',
      allocation: {
        mode: 'manual',
        items: [{ receivableId: charge.body.id, amountMinor: 300_000 }],
      },
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('FINANCE_ALLOCATION_EXCEEDS_OUTSTANDING');
  });

  describe('idempotency', () => {
    it('returns the original payment when a request is retried', async () => {
      const key = randomUUID();
      const body = { studentId: created.studentId, amountMinor: 10_000, method: 'cash' };
      const first = await pay(body, key);
      const second = await pay(body, key);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.id).toBe(first.body.id);
    });

    it('rejects reusing a key for a different request', async () => {
      const key = randomUUID();
      await pay({ studentId: created.studentId, amountMinor: 10_000, method: 'cash' }, key);
      const reused = await pay(
        { studentId: created.studentId, amountMinor: 20_000, method: 'cash' },
        key,
      );
      expect(reused.status).toBe(409);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('creates exactly one payment for concurrent duplicates', async () => {
      const key = randomUUID();
      const body = { studentId: created.studentId, amountMinor: 15_000, method: 'pos' };
      const responses = await Promise.all([pay(body, key), pay(body, key), pay(body, key)]);
      expect(responses.every((response) => [200, 201].includes(response.status))).toBe(true);
      expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
      const count = await asSystem(async (db) => {
        const { rows } = await db.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM payments WHERE idempotency_key = $1',
          [key],
        );
        return rows[0]!.n;
      });
      expect(count).toBe(1);
    });

    it('requires an idempotency key', async () => {
      const response = await accountant.post('/api/v1/finance/payments', {
        studentId: created.studentId,
        amountMinor: 100,
        method: 'cash',
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  describe('reversal', () => {
    it('reverses a payment, re-opens receivables and preserves history', async () => {
      const student = await studentAffairs.post('/api/v1/students', {
        branchId: f.kadikoyId,
        firstName: 'Ters',
        lastName: 'Kayıt',
      });
      await accountant.post('/api/v1/finance/receivables/charges', {
        studentId: student.body.id,
        category: 'trip',
        description: 'Gezi',
        amountMinor: 500_000,
        dueDate: '2030-02-01',
      });
      const payment = await pay({
        studentId: student.body.id,
        amountMinor: 500_000,
        method: 'cash',
      });
      expect(payment.body.allocatedMinor).toBe(500_000);

      const reversed = await accountant.post(
        `/api/v1/finance/payments/${payment.body.id}/reverse`,
        {
          reason: 'Yanlış tutar girildi',
        },
      );
      expect(reversed.status).toBe(200);
      expect(reversed.body).toMatchObject({
        status: 'reversed',
        allocatedMinor: 0,
        reversalReason: 'Yanlış tutar girildi',
      });
      expect(reversed.body.allocations[0].reversedAt).not.toBeNull();
      expect(reversed.body.amountMinor).toBe(500_000);

      const receivables = await accountant.get(
        `/api/v1/finance/receivables?studentId=${student.body.id}`,
      );
      expect(receivables.body.items[0]).toMatchObject({
        status: 'open',
        outstandingMinor: 500_000,
      });

      const again = await accountant.post(`/api/v1/finance/payments/${payment.body.id}/reverse`, {
        reason: 'ikinci deneme',
      });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('FINANCE_PAYMENT_ALREADY_REVERSED');
    });
  });

  describe('database invariants', () => {
    it('never lets a completed payment be edited silently', async () => {
      await asTenant({ organizationId: f.atlasId }, async (db) => {
        await expect(
          db.query('UPDATE payments SET amount_minor = amount_minor + 1 WHERE id = $1', [
            f.atlasKadikoyPaymentId,
          ]),
        ).rejects.toThrow(/immutable/);
      });
    });

    it('recomputes cached allocation totals instead of trusting writes', async () => {
      await asTenant({ organizationId: f.atlasId }, async (db) => {
        const before = await db.query<{ allocated_minor: number }>(
          'SELECT allocated_minor FROM payments WHERE id = $1',
          [f.atlasKadikoyPaymentId],
        );
        await db.query('UPDATE payments SET allocated_minor = 0 WHERE id = $1', [
          f.atlasKadikoyPaymentId,
        ]);
        const after = await db.query<{ allocated_minor: number }>(
          'SELECT allocated_minor FROM payments WHERE id = $1',
          [f.atlasKadikoyPaymentId],
        );
        expect(after.rows[0]?.allocated_minor).toBe(before.rows[0]?.allocated_minor);
      });
    });

    it('rejects allocations beyond a payment or a receivable', async () => {
      await asTenant({ organizationId: f.atlasId }, async (db) => {
        const { rows } = await db.query<{
          id: string;
          account_id: string;
          branch_id: string;
          amount_minor: number;
        }>(
          `SELECT r.id, r.account_id, r.branch_id, r.amount_minor FROM receivables r
           WHERE r.status = 'open' AND r.allocated_minor = 0 AND EXISTS (
             SELECT 1 FROM payments p WHERE p.account_id = r.account_id AND p.status = 'completed')
           LIMIT 1`,
        );
        const receivable = rows[0]!;
        const payment = await db.query<{ id: string }>(
          "SELECT id FROM payments WHERE account_id = $1 AND status = 'completed' LIMIT 1",
          [receivable.account_id],
        );
        await expect(
          db.query(
            `INSERT INTO payment_allocations (organization_id, branch_id, account_id, payment_id, receivable_id, amount_minor)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              f.atlasId,
              receivable.branch_id,
              receivable.account_id,
              payment.rows[0]!.id,
              receivable.id,
              receivable.amount_minor + 1,
            ],
          ),
        ).rejects.toThrow(/check constraint/);
      });
    });
  });
});
