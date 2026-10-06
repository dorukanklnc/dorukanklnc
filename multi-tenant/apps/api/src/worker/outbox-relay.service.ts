import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { APP_CONFIG, type AppConfig } from '../platform/config/env.js';
import { outboxEvents } from '../platform/database/schema/index.js';
import { SystemDatabase } from '../platform/database/system-database.service.js';
import { InjectLogger } from '../platform/logging/logging.module.js';
import { OUTBOX_PUBLISHER, type OutboxMessage, type OutboxPublisher } from './outbox-publisher.js';

export interface RelayResult {
  published: number;
  retried: number;
  failed: number;
}

/** Exponential backoff for failed deliveries: 2s, 4s, 8s … capped at one hour. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(2 ** attempt, 3600);
}

/**
 * Relays pending outbox rows to the configured publisher (ADR-0010).
 *
 * Each batch runs in one transaction that locks its rows with `FOR UPDATE SKIP LOCKED`, so any
 * number of workers can run side by side without delivering the same row concurrently. Failures
 * are retried with backoff; after the maximum attempts a row is parked as `failed` for an operator.
 * Delivery is at-least-once: a crash after publishing but before commit re-delivers the event.
 */
@Injectable()
export class OutboxRelayService {
  constructor(
    private readonly system: SystemDatabase,
    @Inject(OUTBOX_PUBLISHER) private readonly publisher: OutboxPublisher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectLogger() private readonly logger: Logger,
  ) {}

  async processBatch(limit = this.config.WORKER_OUTBOX_BATCH_SIZE): Promise<RelayResult> {
    return this.system.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.availableAt, sql`now()`)))
        .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.id))
        .limit(limit)
        .for('update', { skipLocked: true });

      const result: RelayResult = { published: 0, retried: 0, failed: 0 };
      for (const row of rows) {
        const message: OutboxMessage = {
          id: row.id,
          organizationId: row.organizationId,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          eventType: row.eventType,
          eventVersion: row.eventVersion,
          payload: row.payload,
          metadata: row.metadata,
          occurredAt: row.occurredAt.toISOString(),
        };
        const attempts = row.attempts + 1;
        try {
          await this.publisher.publish(message);
          await tx
            .update(outboxEvents)
            .set({ status: 'published', publishedAt: sql`now()`, attempts, lastError: null })
            .where(eq(outboxEvents.id, row.id));
          result.published += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const exhausted = attempts >= this.config.WORKER_OUTBOX_MAX_ATTEMPTS;
          await tx
            .update(outboxEvents)
            .set({
              status: exhausted ? 'failed' : 'pending',
              attempts,
              lastError: reason.slice(0, 1000),
              availableAt: sql`now() + make_interval(secs => ${retryDelaySeconds(attempts)})`,
            })
            .where(eq(outboxEvents.id, row.id));
          if (exhausted) result.failed += 1;
          else result.retried += 1;
          this.logger.warn(
            { outboxId: row.id, eventType: row.eventType, attempts, exhausted, err: reason },
            'outbox delivery failed',
          );
        }
      }
      return result;
    });
  }
}
