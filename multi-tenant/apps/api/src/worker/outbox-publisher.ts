/** A domain event as relayed from the outbox (ids, amounts and dates; no unnecessary PII). */
export interface OutboxMessage {
  id: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Destination of relayed events. Delivery is at-least-once: implementations and their consumers
 * must be idempotent (the outbox id is the deduplication key).
 */
export interface OutboxPublisher {
  publish(message: OutboxMessage): Promise<void>;
  close?(): Promise<void>;
}

export const OUTBOX_PUBLISHER = Symbol('OUTBOX_PUBLISHER');
