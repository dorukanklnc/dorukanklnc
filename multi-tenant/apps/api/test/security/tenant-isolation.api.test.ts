import { type TestApp, type TestClient, createTestApp } from '../support/app.js';
import { type Fixtures, loadFixtures } from '../support/database.js';

/** Tenant isolation through the real HTTP API, including UUID guessing (IDOR). */
describe('tenant isolation (API)', () => {
  let t: TestApp;
  let f: Fixtures;
  let atlasOwner: TestClient;
  let novaOwner: TestClient;

  beforeAll(async () => {
    t = await createTestApp();
    f = await loadFixtures();
    atlasOwner = await t.login('sahip@atlas.test');
    novaOwner = await t.login('sahip@nova.test');
  });

  afterAll(async () => {
    await t.close();
  });

  it('Tenant A cannot read Tenant B students by guessing their UUID', async () => {
    const response = await atlasOwner.get(`/api/v1/students/${f.novaStudentId}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('Tenant A cannot read Tenant B payments by guessing their UUID', async () => {
    expect((await atlasOwner.get(`/api/v1/finance/payments/${f.novaPaymentId}`)).status).toBe(404);
    expect(
      (await novaOwner.get(`/api/v1/finance/payments/${f.atlasKadikoyPaymentId}`)).status,
    ).toBe(404);
  });

  it('Tenant A cannot update Tenant B records', async () => {
    const response = await atlasOwner.patch(`/api/v1/students/${f.novaStudentId}`, {
      firstName: 'Hacklendi',
    });
    expect(response.status).toBe(404);
    const unchanged = await novaOwner.get(`/api/v1/students/${f.novaStudentId}`);
    expect(unchanged.body.firstName).not.toBe('Hacklendi');
  });

  it('Tenant A cannot record payments or reverse payments of Tenant B', async () => {
    const pay = await atlasOwner.post(
      '/api/v1/finance/payments',
      { studentId: f.novaStudentId, amountMinor: 100, method: 'cash' },
      { 'idempotency-key': `iso-${Date.now()}` },
    );
    expect(pay.status).toBe(404);
    const reverse = await atlasOwner.post(`/api/v1/finance/payments/${f.novaPaymentId}/reverse`, {
      reason: 'cross tenant attempt',
    });
    expect(reverse.status).toBe(404);
  });

  it('never lists another tenant’s data', async () => {
    const students = await atlasOwner.get('/api/v1/students?pageSize=100&includeArchived=true');
    expect(students.status).toBe(200);
    const ids = new Set((students.body.items as { id: string }[]).map((item) => item.id));
    expect(ids.has(f.novaStudentId)).toBe(false);

    const payments = await novaOwner.get('/api/v1/finance/payments?pageSize=100');
    const paymentIds = new Set((payments.body.items as { id: string }[]).map((item) => item.id));
    expect(paymentIds.has(f.atlasKadikoyPaymentId)).toBe(false);
    expect(paymentIds.has(f.novaPaymentId)).toBe(true);
  });

  it('cannot switch into an organization without membership', async () => {
    const response = await atlasOwner.post('/api/v1/auth/session/organization', {
      organizationId: f.novaId,
    });
    expect(response.status).toBe(404);
  });

  it('does not leak other tenants through search', async () => {
    const novaStudent = await novaOwner.get(`/api/v1/students/${f.novaStudentId}`);
    const lastName = novaStudent.body.lastName as string;
    const search = await atlasOwner.get(`/api/v1/search?q=${encodeURIComponent(lastName)}`);
    const found = (search.body.groups as { items: { id: string }[] }[]).flatMap(
      (group) => group.items,
    );
    expect(found.some((item) => item.id === f.novaStudentId)).toBe(false);
  });

  it('lets a user with memberships in both tenants switch context explicitly', async () => {
    const consultant = await t.login('danisman@campusos.test');
    const session = await consultant.get('/api/v1/auth/session');
    expect(session.body.memberships).toHaveLength(2);
    const switched = await consultant.post('/api/v1/auth/session/organization', {
      organizationId: f.novaId,
    });
    expect(switched.status).toBe(200);
    expect(switched.body.activeOrganization.id).toBe(f.novaId);
    expect((await consultant.get(`/api/v1/students/${f.novaStudentId}`)).status).toBe(200);
    expect((await consultant.get(`/api/v1/students/${f.atlasKadikoyStudentId}`)).status).toBe(404);
  });
});
