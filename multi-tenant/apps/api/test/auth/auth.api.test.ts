import { type TestApp, type TestClient, createTestApp, DEMO_PASSWORD } from '../support/app.js';
import { asSystem } from '../support/database.js';

const tokenFrom = (text: string, marker: string) => {
  const match = new RegExp(`${marker}([A-Za-z0-9_-]+)`).exec(text);
  if (!match?.[1]) throw new Error(`No token found after ${marker}`);
  return decodeURIComponent(match[1]);
};

describe('authentication and onboarding flows', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('login', () => {
    it('does not reveal whether an account exists', async () => {
      const unknown = await t
        .client()
        .post('/api/v1/auth/login', { email: 'yok@atlas.test', password: 'whatever-123' });
      const wrong = await t
        .client()
        .post('/api/v1/auth/login', { email: 'mudur@atlas.test', password: 'whatever-123' });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.code).toBe(wrong.body.code);
      expect(unknown.body.detail).toBe(wrong.body.detail);
    });

    it('sets HttpOnly session and readable CSRF cookies', async () => {
      const response = await t
        .client()
        .post('/api/v1/auth/login', { email: 'mudur@atlas.test', password: DEMO_PASSWORD });
      const cookies = (response.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(cookies).toMatch(/sid=[^;]+;.*HttpOnly/);
      expect(cookies).toMatch(/csrf=[^;]+;/);
      expect(cookies).toMatch(/SameSite=Lax/);
      expect(response.body.activeOrganization.slug).toBe('atlas');
    });

    it('locks the account after repeated failures', async () => {
      const email = 'subemuduru@atlas.test';
      for (let attempt = 0; attempt < 10; attempt++) {
        await t
          .client()
          .post('/api/v1/auth/login', { email, password: `wrong-password-${attempt}` });
      }
      const locked = await t
        .client()
        .post('/api/v1/auth/login', { email, password: DEMO_PASSWORD });
      expect(locked.status).toBe(401);
      await asSystem((db) =>
        db.query(
          'UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE email = $1',
          [email],
        ),
      );
      const unlocked = await t
        .client()
        .post('/api/v1/auth/login', { email, password: DEMO_PASSWORD });
      expect(unlocked.status).toBe(200);
    });
  });

  describe('sessions', () => {
    it('revokes the session on logout', async () => {
      const client = await t.login('mudur@atlas.test');
      expect((await client.post('/api/v1/auth/logout')).status).toBe(204);
      expect((await client.get('/api/v1/auth/session')).status).toBe(401);
    });

    it('logs out everywhere', async () => {
      const first = await t.login('mudur@atlas.test');
      const second = await t.login('mudur@atlas.test');
      expect((await second.post('/api/v1/auth/logout-all')).status).toBe(204);
      expect((await first.get('/api/v1/auth/session')).status).toBe(401);
      expect((await second.get('/api/v1/auth/session')).status).toBe(401);
    });
  });

  describe('password reset', () => {
    it('resets the password with a single-use token and revokes existing sessions', async () => {
      const email = 'ogrenciisleri@atlas.test';
      const existing = await t.login(email);
      t.mail().sent.length = 0;

      const request = await t.client().post('/api/v1/auth/password/forgot', { email });
      expect(request.status).toBe(202);
      const message = t.mail().sent.find((mail) => mail.to === email);
      expect(message?.template).toBe('password_reset');
      const token = tokenFrom(message!.text, 'token=');

      const reset = await t
        .client()
        .post('/api/v1/auth/password/reset', { token, password: 'Yeni-Parola-2026!' });
      expect(reset.status).toBe(204);
      expect((await existing.get('/api/v1/auth/session')).status).toBe(401);
      expect(
        (
          await t
            .client()
            .post('/api/v1/auth/password/reset', { token, password: 'Baska-Parola-2026!' })
        ).status,
      ).toBe(400);

      await t.login(email, 'Yeni-Parola-2026!');
      // restore the demo password for other tests
      const client = await t.login(email, 'Yeni-Parola-2026!');
      expect(
        (
          await client.post('/api/v1/auth/password/change', {
            currentPassword: 'Yeni-Parola-2026!',
            newPassword: DEMO_PASSWORD,
          })
        ).status,
      ).toBe(204);
    });

    it('answers identically for unknown e-mail addresses and sends nothing', async () => {
      t.mail().sent.length = 0;
      const response = await t
        .client()
        .post('/api/v1/auth/password/forgot', { email: 'kimse@example.com' });
      expect(response.status).toBe(202);
      expect(t.mail().sent).toHaveLength(0);
    });
  });

  describe('Flow 1 + 2: provisioning, invitation, branch and team setup', () => {
    let admin: TestClient;

    it('platform admin creates an organization and its first administrator is invited', async () => {
      const platform = await t.login('platform@campusos.test');
      t.mail().sent.length = 0;
      const response = await platform.post('/api/v1/platform/organizations', {
        name: 'Deneme Kolej',
        slug: 'deneme-kolej',
        firstBranch: { code: 'MRK', name: 'Merkez Kampüs' },
        administrator: { fullName: 'Hande Kurucu', email: 'hande@deneme.test' },
      });
      expect(response.status).toBe(201);

      const invitation = t.mail().sent.find((mail) => mail.to === 'hande@deneme.test');
      expect(invitation?.template).toBe('invitation');
      const token = tokenFrom(invitation!.text, '/invitations/');

      const preview = await t.client().get(`/api/v1/auth/invitations/${token}`);
      expect(preview.body).toMatchObject({
        organizationName: 'Deneme Kolej',
        requiresAccountSetup: true,
      });

      admin = t.client();
      const accepted = await admin.post(`/api/v1/auth/invitations/${token}/accept`, {
        fullName: 'Hande Kurucu',
        password: 'Kurucu-Parola-2026!',
      });
      expect(accepted.status).toBe(200);
      expect(accepted.body.signedIn).toBe(true);

      const session = await admin.get('/api/v1/auth/session');
      expect(session.body.activeOrganization.slug).toBe('deneme-kolej');
      expect(session.body.permissions['settings.users.manage']).toBe('organization');
      expect((await t.client().get(`/api/v1/auth/invitations/${token}`)).status).toBe(404);
    });

    it('non-platform users cannot provision organizations', async () => {
      const owner = await t.login('sahip@atlas.test');
      const response = await owner.post('/api/v1/platform/organizations', {
        name: 'X',
        slug: 'xyz-test',
        firstBranch: { code: 'X1', name: 'X Kampüs' },
        administrator: { fullName: 'X Y', email: 'x@y.test' },
      });
      expect(response.status).toBe(403);
    });

    it('administrator creates a branch and invites an accountant and a teacher', async () => {
      const branch = await admin.post('/api/v1/branches', { code: 'BTI', name: 'Batı Kampüsü' });
      expect(branch.status).toBe(201);
      const roles = await admin.get('/api/v1/roles');
      const roleId = (key: string) =>
        (roles.body as { id: string; key: string }[]).find((role) => role.key === key)!.id;

      t.mail().sent.length = 0;
      const accountant = await admin.post('/api/v1/members/invitations', {
        email: 'muhasebe@deneme.test',
        fullName: 'Okan Hesap',
        roleIds: [roleId('accountant')],
        allBranches: false,
        branchIds: [branch.body.id],
      });
      const teacher = await admin.post('/api/v1/members/invitations', {
        email: 'ogretmen@deneme.test',
        fullName: 'Seda Ders',
        roleIds: [roleId('teacher')],
        allBranches: false,
        branchIds: [branch.body.id],
      });
      expect(accountant.status).toBe(201);
      expect(teacher.status).toBe(201);
      expect(
        t
          .mail()
          .sent.map((mail) => mail.to)
          .sort(),
      ).toEqual(['muhasebe@deneme.test', 'ogretmen@deneme.test']);

      const token = tokenFrom(
        t.mail().sent.find((mail) => mail.to === 'muhasebe@deneme.test')!.text,
        '/invitations/',
      );
      const invitee = t.client();
      await invitee.post(`/api/v1/auth/invitations/${token}/accept`, {
        fullName: 'Okan Hesap',
        password: 'Hesap-Parola-2026!',
      });
      const session = await invitee.get('/api/v1/auth/session');
      expect(session.body.activeMembership.roles.map((role: { key: string }) => role.key)).toEqual([
        'accountant',
      ]);
      expect(session.body.branches.map((b: { code: string }) => b.code)).toEqual(['BTI']);

      const members = await admin.get('/api/v1/members');
      const statuses = Object.fromEntries(
        (members.body.items as { email: string; status: string }[]).map((member) => [
          member.email,
          member.status,
        ]),
      );
      expect(statuses).toMatchObject({
        'muhasebe@deneme.test': 'active',
        'ogretmen@deneme.test': 'invited',
      });
    });

    it('a suspended member loses access immediately', async () => {
      const members = await admin.get('/api/v1/members');
      const accountant = (members.body.items as { id: string; email: string }[]).find(
        (member) => member.email === 'muhasebe@deneme.test',
      )!;
      const session = await t.login('muhasebe@deneme.test', 'Hesap-Parola-2026!');
      expect((await session.get('/api/v1/finance/summary')).status).toBe(200);

      const suspended = await admin.post(`/api/v1/members/${accountant.id}/suspend`);
      expect(suspended.status).toBe(200);
      expect(suspended.body.status).toBe('suspended');
      expect((await session.get('/api/v1/finance/summary')).status).toBe(401);
    });
  });
});
