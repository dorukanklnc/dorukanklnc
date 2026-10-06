import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConfig } from '../../src/platform/config/env.js';
import {
  OUTBOX_PUBLISHER,
  type OutboxMessage,
  type OutboxPublisher,
} from '../../src/worker/outbox-publisher.js';
import { OutboxRelayService, retryDelaySeconds } from '../../src/worker/outbox-relay.service.js';
import { WorkerModule } from '../../src/worker/worker.module.js';
import { createTestApp } from '../support/app.js';
import { asSystem } from '../support/database.js';

class RecordingPublisher implements OutboxPublisher {
  messages: OutboxMessage[] = [];
  failing = new Set<string>();

  publish(message: OutboxMessage): Promise<void> {
    if (this.failing.has(message.eventType)) return Promise.reject(new Error('broker unavailable'));
    this.messages.push(message);
    return Promise.resolve();
  }
}

async function insertEvent(eventType: string): Promise<string> {
  const id = randomUUID();
  await asSystem((client) =>
    client.query(
      `INSERT INTO outbox_events (id, organization_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, NULL, 'test', $2, $3, '{"amountMinor": 100}')`,
      [id, randomUUID(), eventType],
    ),
  );
  return id;
}

async function row(id: string) {
  return asSystem(async (client) => {
    const result = await client.query<{
      status: string;
      attempts: number;
      last_error: string | null;
      published_at: Date | null;
      available_at: Date;
    }>(
      'SELECT status, attempts, last_error, published_at, available_at FROM outbox_events WHERE id = $1',
      [id],
    );
    const found = result.rows[0];
    if (!found) throw new Error(`outbox row ${id} not found`);
    return found;
  });
}

describe('outbox relay worker', () => {
  let moduleRef: TestingModule;
  let relay: OutboxRelayService;
  const publisher = new RecordingPublisher();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(OUTBOX_PUBLISHER)
      .useValue(publisher)
      .compile();
    await moduleRef.init();
    relay = moduleRef.get(OutboxRelayService);
    // Drain events produced by seeding and earlier suites.
    while ((await relay.processBatch(500)).published > 0) {
      // keep draining
    }
    publisher.messages = [];
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('publishes each pending event once and marks it published', async () => {
    const id = await insertEvent('test.relayed');
    expect((await relay.processBatch()).published).toBe(1);
    expect(publisher.messages.map((message) => message.id)).toEqual([id]);
    expect(publisher.messages[0]?.payload).toEqual({ amountMinor: 100 });

    expect((await relay.processBatch()).published).toBe(0);
    const stored = await row(id);
    expect(stored.status).toBe('published');
    expect(stored.attempts).toBe(1);
    expect(stored.published_at).not.toBeNull();
  });

  it('retries failed deliveries with backoff and parks them after the last attempt', async () => {
    publisher.failing.add('test.failing');
    const id = await insertEvent('test.failing');

    expect(await relay.processBatch()).toEqual({ published: 0, retried: 1, failed: 0 });
    let stored = await row(id);
    expect(stored.status).toBe('pending');
    expect(stored.attempts).toBe(1);
    expect(stored.last_error).toContain('broker unavailable');
    expect(stored.available_at.getTime()).toBeGreaterThan(Date.now());

    // Not retried before its backoff elapses.
    expect((await relay.processBatch()).retried).toBe(0);

    const maxAttempts = getConfig().WORKER_OUTBOX_MAX_ATTEMPTS;
    await asSystem((client) =>
      client.query('UPDATE outbox_events SET available_at = now(), attempts = $2 WHERE id = $1', [
        id,
        maxAttempts - 1,
      ]),
    );
    expect(await relay.processBatch()).toEqual({ published: 0, retried: 0, failed: 1 });
    stored = await row(id);
    expect(stored.status).toBe('failed');
    expect(stored.attempts).toBe(maxAttempts);
    publisher.failing.clear();
  });

  it('lets concurrent workers claim disjoint rows (FOR UPDATE SKIP LOCKED)', async () => {
    const ids = new Set<string>();
    for (let index = 0; index < 20; index += 1) ids.add(await insertEvent('test.concurrent'));

    const [first, second] = await Promise.all([relay.processBatch(12), relay.processBatch(12)]);
    expect(first.published + second.published).toBe(20);
    const delivered = publisher.messages
      .filter((message) => message.eventType === 'test.concurrent')
      .map((message) => message.id);
    expect(delivered).toHaveLength(20);
    expect(new Set(delivered)).toEqual(ids);
  });

  it('relays events committed by business transactions (student created)', async () => {
    const app = await createTestApp();
    try {
      const owner = await app.login('sahip@atlas.test');
      const branches = await owner.get('/api/v1/branches');
      const branchId = (branches.body as { id: string }[])[0]?.id;
      const created = await owner.post('/api/v1/students', {
        branchId,
        firstName: 'Outbox',
        lastName: 'Deneme',
      });
      expect(created.status).toBe(201);

      await relay.processBatch();
      const event = publisher.messages.find(
        (message) =>
          message.eventType === 'student.created' && message.aggregateId === created.body.id,
      );
      expect(event).toBeDefined();
      expect(event?.organizationId).toBeTruthy();
      expect(event?.metadata.requestId).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it('caps the retry delay at one hour', () => {
    expect(retryDelaySeconds(1)).toBe(2);
    expect(retryDelaySeconds(5)).toBe(32);
    expect(retryDelaySeconds(30)).toBe(3600);
  });
});
