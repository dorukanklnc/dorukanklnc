import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../platform/context/request-context.js';
import { outboxEvents } from '../../platform/database/schema/index.js';
import type { DbExecutor } from '../../platform/database/types.js';
import type { DomainEventType } from './events.js';

export interface DomainEvent {
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: DomainEventType;
  eventVersion?: number;
  /** Identifiers, amounts (minor units), currencies and dates. No unnecessary personal data. */
  payload: Record<string, unknown>;
  actorUserId?: string | null;
}

/**
 * Transactional outbox (ADR-0010): events are rows written in the same transaction as the change.
 * The worker relays them; consumers must be idempotent (at-least-once delivery).
 */
@Injectable()
export class OutboxService {
  async publish(db: DbExecutor, event: DomainEvent): Promise<void> {
    await this.publishMany(db, [event]);
  }

  async publishMany(db: DbExecutor, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const requestId = RequestContext.requestId();
    await db.insert(outboxEvents).values(
      events.map((event) => ({
        organizationId: event.organizationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventVersion: event.eventVersion ?? 1,
        payload: event.payload,
        metadata: {
          ...(requestId ? { requestId } : {}),
          ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
        },
      })),
    );
  }
}
