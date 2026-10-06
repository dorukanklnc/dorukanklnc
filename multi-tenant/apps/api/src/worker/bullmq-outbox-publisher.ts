import { Queue } from 'bullmq';
import type { OutboxMessage, OutboxPublisher } from './outbox-publisher.js';

export const DOMAIN_EVENTS_QUEUE = 'domain-events';

/**
 * Publishes events to a BullMQ queue. The outbox id is the job id, so a re-relayed event (after a
 * crash between publish and commit) is deduplicated by Redis instead of being processed twice.
 */
export class BullMqOutboxPublisher implements OutboxPublisher {
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    const url = new URL(redisUrl);
    this.queue = new Queue(DOMAIN_EVENTS_QUEUE, {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 24 * 3600, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  async publish(message: OutboxMessage): Promise<void> {
    await this.queue.add(message.eventType, message, { jobId: message.id });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
