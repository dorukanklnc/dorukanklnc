import { type TestApp, type TestClient, createTestApp } from '../support/app.js';
import { type Fixtures, asSystem, loadFixtures } from '../support/database.js';
import { MockPaymentProvider } from '../../src/finance/providers/mock-payment.provider.js';

/** Provider webhooks must be verified and idempotent. */
describe('payment webhooks', () => {
  let t: TestApp;
  let f: Fixtures;
  let accountant: TestClient;
  let provider: MockPaymentProvider;

  const createLink = async (amountMinor: number) => {
    const response = await accountant.post('/api/v1/finance/payment-links', {
      studentId: f.atlasKadikoyStudentId,
      amountMinor,
      description: 'Online ödeme',
    });
    expect(response.status).toBe(201);
    const reference = await asSystem(async (db) => {
      const { rows } = await db.query<{ provider_reference: string }>(
        'SELECT provider_reference FROM payment_intents WHERE id = $1',
        [response.body.id],
      );
      return rows[0]!.provider_reference;
    });
    return { id: response.body.id as string, reference };
  };

  const deliver = (body: string, headers: Record<string, string>) =>
    t.client().agent.post('/api/v1/webhooks/payments/mock').set(headers).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    f = await loadFixtures();
    accountant = await t.login('muhasebe@atlas.test');
    provider = t.app.get(MockPaymentProvider);
  });

  afterAll(async () => {
    await t.close();
  });

  it('settles a payment exactly once when the same webhook is replayed', async () => {
    const link = await createLink(123_400);
    const event = provider.buildSignedEvent({
      type: 'payment.succeeded',
      providerReference: link.reference,
      amountMinor: 123_400,
      currency: 'TRY',
    });

    const first = await deliver(event.body, event.headers);
    const replay = await deliver(event.body, event.headers);
    const differentEventSameIntent = provider.buildSignedEvent({
      type: 'payment.succeeded',
      providerReference: link.reference,
      amountMinor: 123_400,
      currency: 'TRY',
    });
    const third = await deliver(differentEventSameIntent.body, differentEventSameIntent.headers);

    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe('processed');
    expect(replay.body.outcome).toBe('duplicate');
    expect(third.body.outcome).toBe('duplicate');

    const payments = await asSystem(async (db) => {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM payments WHERE provider = 'mock' AND provider_reference = $1",
        [link.reference],
      );
      return rows[0]!.n;
    });
    expect(payments).toBe(1);

    const status = await accountant.get(`/api/v1/finance/payment-links/${link.id}`);
    expect(status.body.status).toBe('succeeded');
    expect(status.body.paymentId).not.toBeNull();
  });

  it('rejects webhooks with an invalid signature', async () => {
    const link = await createLink(10_000);
    const event = provider.buildSignedEvent({
      type: 'payment.succeeded',
      providerReference: link.reference,
      amountMinor: 10_000,
      currency: 'TRY',
    });
    const tampered = event.body.replace('10000', '99999');
    const response = await deliver(tampered, event.headers);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('never settles a different amount than the intent', async () => {
    const link = await createLink(50_000);
    const event = provider.buildSignedEvent({
      type: 'payment.succeeded',
      providerReference: link.reference,
      amountMinor: 49_999,
      currency: 'TRY',
    });
    const response = await deliver(event.body, event.headers);
    expect(response.body.outcome).toBe('rejected');
    const status = await accountant.get(`/api/v1/finance/payment-links/${link.id}`);
    expect(status.body.status).toBe('created');
  });
});
