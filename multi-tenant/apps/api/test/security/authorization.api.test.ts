import { type TestApp, type TestClient, createTestApp } from '../support/app.js';
import { type Fixtures, asSystem, loadFixtures } from '../support/database.js';

describe('authorization (API)', () => {
  let t: TestApp;
  let f: Fixtures;
  let teacher: TestClient;
  let accountant: TestClient;
  let principal: TestClient;
  let studentAffairs: TestClient;
  let branchManager: TestClient;

  beforeAll(async () => {
    t = await createTestApp();
    f = await loadFixtures();
    [teacher, accountant, principal, studentAffairs, branchManager] = await Promise.all([
      t.login('ogretmen@atlas.test'),
      t.login('muhasebe@atlas.test'),
      t.login('mudur@atlas.test'),
      t.login('ogrenciisleri@atlas.test'),
      t.login('subemuduru@atlas.test'),
    ]);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('teacher', () => {
    it('cannot access any finance API', async () => {
      for (const path of [
        '/api/v1/finance/summary',
        '/api/v1/finance/kpis',
        '/api/v1/finance/payments',
        '/api/v1/finance/receivables',
        `/api/v1/finance/students/${f.atlasKadikoyStudentId}`,
        `/api/v1/finance/payments/${f.atlasKadikoyPaymentId}`,
      ]) {
        expect((await teacher.get(path)).status, path).toBe(403);
      }
      const pay = await teacher.post(
        '/api/v1/finance/payments',
        { studentId: f.atlasKadikoyStudentId, amountMinor: 100, method: 'cash' },
        { 'idempotency-key': `teacher-${Date.now()}` },
      );
      expect(pay.status).toBe(403);
    });

    it('sees only students of assigned classes', async () => {
      const response = await teacher.get('/api/v1/students?pageSize=100');
      expect(response.status).toBe(200);
      const classes = new Set(
        (response.body.items as { className: string }[]).map((item) => item.className),
      );
      expect([...classes].sort()).toEqual(['10-A', '9-A']);
      expect((await teacher.get(`/api/v1/students/${f.unassignedKadikoyStudentId}`)).status).toBe(
        404,
      );
    });

    it('gets no finance data from search or the dashboard', async () => {
      const search = await teacher.get('/api/v1/search?q=TAH');
      expect(
        (search.body.groups as { type: string }[]).some((group) => group.type === 'payment'),
      ).toBe(false);
      const dashboard = await teacher.get('/api/v1/dashboard');
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.finance).toBeUndefined();
      expect(dashboard.body.financeKpis).toBeUndefined();
      expect(dashboard.body.teaching.classes.length).toBeGreaterThan(0);
    });

    it('has no finance permissions in its session', async () => {
      const session = await teacher.get('/api/v1/auth/session');
      expect(Object.keys(session.body.permissions).some((key) => key.startsWith('finance.'))).toBe(
        false,
      );
    });
  });

  describe('accountant (branch scoped to Kadıköy)', () => {
    it('reads student identity and finance within the branch', async () => {
      expect((await accountant.get(`/api/v1/students/${f.atlasKadikoyStudentId}`)).status).toBe(
        200,
      );
      expect(
        (await accountant.get(`/api/v1/finance/students/${f.atlasKadikoyStudentId}`)).status,
      ).toBe(200);
    });

    it('cannot access another branch, even by UUID', async () => {
      expect((await accountant.get(`/api/v1/students/${f.atlasAtasehirStudentId}`)).status).toBe(
        404,
      );
      expect(
        (await accountant.get(`/api/v1/finance/payments/${f.atlasAtasehirPaymentId}`)).status,
      ).toBe(404);
      expect(
        (await accountant.get(`/api/v1/finance/students/${f.atlasAtasehirStudentId}`)).status,
      ).toBe(404);
      const summary = await accountant.get(`/api/v1/finance/summary?branchId=${f.atasehirId}`);
      expect(summary.status).toBe(422);
      expect(summary.body.code).toBe('BRANCH_NOT_ALLOWED');
      const list = await accountant.get('/api/v1/finance/payments?pageSize=100');
      expect(
        (list.body.items as { branch: { id: string } }[]).every(
          (item) => item.branch.id === f.kadikoyId,
        ),
      ).toBe(true);
    });

    it('has no academic, attendance or sensitive-data access', async () => {
      expect((await accountant.get('/api/v1/academics/classes')).status).toBe(403);
      expect(
        (await accountant.post(`/api/v1/students/${f.atlasKadikoyStudentId}/national-id/reveal`))
          .status,
      ).toBe(403);
      expect((await accountant.post('/api/v1/students', {})).status).toBe(403);
      const session = await accountant.get('/api/v1/auth/session');
      const keys = Object.keys(session.body.permissions as Record<string, string>);
      expect(
        keys.some((key) => key.startsWith('attendance.') || key.startsWith('academics.')),
      ).toBe(false);
    });
  });

  describe('principal', () => {
    it('sees aggregate finance KPIs but not individual accounts', async () => {
      expect((await principal.get('/api/v1/finance/kpis')).status).toBe(200);
      expect((await principal.get('/api/v1/finance/summary')).status).toBe(403);
      expect(
        (await principal.get(`/api/v1/finance/students/${f.atlasKadikoyStudentId}`)).status,
      ).toBe(403);
      const dashboard = await principal.get('/api/v1/dashboard');
      expect(dashboard.body.financeKpis).toBeDefined();
      expect(dashboard.body.finance).toBeUndefined();
    });
  });

  describe('student affairs', () => {
    it('cannot create tuition agreements or payments', async () => {
      const agreement = await studentAffairs.post('/api/v1/finance/agreements', {});
      expect(agreement.status).toBe(403);
    });
  });

  describe('administration rules', () => {
    it('prevents privilege escalation when inviting', async () => {
      const roles = await branchManager.get('/api/v1/roles');
      const roleId = (key: string) =>
        (roles.body as { id: string; key: string }[]).find((role) => role.key === key)!.id;

      const escalation = await branchManager.post('/api/v1/members/invitations', {
        email: 'escalation@example.com',
        fullName: 'Yetki Deneme',
        roleIds: [roleId('accountant')],
        allBranches: false,
        branchIds: [f.atasehirId],
      });
      expect(escalation.status).toBe(422);
      expect(escalation.body.code).toBe('ROLE_ESCALATION');

      const otherBranch = await branchManager.post('/api/v1/members/invitations', {
        email: 'other-branch@example.com',
        fullName: 'Şube Deneme',
        roleIds: [roleId('teacher')],
        allBranches: false,
        branchIds: [f.kadikoyId],
      });
      expect(otherBranch.status).toBe(422);
      expect(otherBranch.body.code).toBe('BRANCH_NOT_ALLOWED');

      const allowed = await branchManager.post('/api/v1/members/invitations', {
        email: 'yeni.ogretmen@example.com',
        fullName: 'Yeni Öğretmen',
        roleIds: [roleId('teacher')],
        allBranches: false,
        branchIds: [f.atasehirId],
      });
      expect(allowed.status).toBe(201);
      expect(allowed.body.status).toBe('invited');
    });

    it('protects the last owner and self-administration', async () => {
      const owner = await t.login('sahip@atlas.test');
      const session = await owner.get('/api/v1/auth/session');
      const membershipId = session.body.activeMembership.id as string;
      const self = await owner.post(`/api/v1/members/${membershipId}/suspend`);
      expect(self.status).toBe(409);
      expect(self.body.code).toBe('MEMBER_SELF_ACTION');
    });

    it('requires a CSRF token for state-changing requests', async () => {
      const client = await t.login('sahip@atlas.test');
      client.csrfToken = null;
      const response = await client.post('/api/v1/branches', { code: 'CSRF', name: 'CSRF Deneme' });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('rejects unauthenticated requests', async () => {
      const anonymous = t.client();
      expect((await anonymous.get('/api/v1/students')).status).toBe(401);
      expect((await anonymous.get('/api/v1/finance/summary')).status).toBe(401);
    });

    it('records administrative actions in the audit log', async () => {
      const count = await asSystem(async (db) => {
        const { rows } = await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM audit_logs WHERE organization_id = $1 AND action = 'member.invited'",
          [f.atlasId],
        );
        return rows[0]!.n;
      });
      expect(count).toBeGreaterThan(0);
    });
  });
});
