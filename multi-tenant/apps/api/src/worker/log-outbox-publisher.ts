import type { Logger } from 'pino';
import type { OutboxMessage, OutboxPublisher } from './outbox-publisher.js';

/**
 * Development default: one structured log line per event. The payload is not logged; operators
 * correlate with the outbox row by id.
 */
export class LogOutboxPublisher implements OutboxPublisher {
  constructor(private readonly logger: Logger) {}

  publish(message: OutboxMessage): Promise<void> {
    this.logger.info(
      {
        outboxId: message.id,
        eventType: message.eventType,
        eventVersion: message.eventVersion,
        organizationId: message.organizationId,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
      },
      'domain event relayed',
    );
    return Promise.resolve();
  }
}
