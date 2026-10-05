import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  organizations,
  paymentIntents,
  paymentProviderEvents,
} from '../../platform/database/schema/index.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import { LOGGER } from '../../platform/logging/logging.module.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { DomainEvents } from '../../core/outbox/events.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { recordPayment } from '../payments/payment-recorder.js';
import { PaymentProviderRegistry } from './payment-provider.registry.js';

export type WebhookOutcome =
  | { status: 'processed'; paymentId: string }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: string }
  | { status: 'rejected'; reason: string };

/**
 * Idempotent webhook processing. The webhook carries no user and must resolve its tenant from
 * the provider reference, so it runs as the system role with explicit organization ids.
 *
 * Replay safety comes from two independent guarantees: the inbox's unique
 * (provider, provider_event_id) and the payments' unique (organization, provider, reference).
 */
@Injectable()
export class PaymentWebhookService {
  constructor(
    private readonly systemDb: SystemDatabase,
    private readonly registry: PaymentProviderRegistry,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async handle(
    providerKey: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookOutcome> {
    const provider = this.registry.get(providerKey);
    const event = provider.parseWebhook(rawBody, headers);

    return this.systemDb.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(paymentProviderEvents)
        .values({
          provider: provider.key,
          providerEventId: event.eventId,
          eventType: event.type,
          payload: event.payload,
          signatureValid: true,
        })
        .onConflictDoNothing({ target: [paymentProviderEvents.provider, paymentProviderEvents.providerEventId] })
        .returning({ id: paymentProviderEvents.id });

      let eventRowId = inserted?.id;
      if (!eventRowId) {
        const [existing] = await tx
          .select({ id: paymentProviderEvents.id, status: paymentProviderEvents.status })
          .from(paymentProviderEvents)
          .where(
            and(
              eq(paymentProviderEvents.provider, provider.key),
              eq(paymentProviderEvents.providerEventId, event.eventId),
            ),
          )
          .for('update');
        if (!existing || existing.status === 'processed' || existing.status === 'ignored') {
          return { status: 'duplicate' as const };
        }
        eventRowId = existing.id;
      }

      const finish = async (status: 'processed' | 'ignored' | 'failed', organizationId: string | null, error?: string) => {
        await tx
          .update(paymentProviderEvents)
          .set({ status, organizationId, error: error ?? null, processedAt: sql`now()` })
          .where(eq(paymentProviderEvents.id, eventRowId));
      };

      const [intent] = await tx
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.provider, provider.key), eq(paymentIntents.providerReference, event.providerReference)))
        .for('update');
      if (!intent) {
        await finish('ignored', null, 'unknown provider reference');
        return { status: 'ignored' as const, reason: 'unknown_reference' };
      }

      if (event.type === 'payment.failed') {
        if (intent.status === 'created') {
          await tx.update(paymentIntents).set({ status: 'failed' }).where(eq(paymentIntents.id, intent.id));
        }
        await finish('processed', intent.organizationId);
        return { status: 'ignored' as const, reason: 'payment_failed' };
      }

      if (intent.status === 'succeeded') {
        await finish('ignored', intent.organizationId, 'intent already settled');
        return { status: 'duplicate' as const };
      }
      if (intent.status !== 'created') {
        await finish('ignored', intent.organizationId, `intent is ${intent.status}`);
        return { status: 'ignored' as const, reason: `intent_${intent.status}` };
      }
      if (event.amountMinor !== intent.amountMinor || event.currency !== intent.currency) {
        // Never settle a different amount automatically: leave it for reconciliation.
        await finish('failed', intent.organizationId, 'amount or currency mismatch');
        this.logger.warn({ intentId: intent.id, provider: provider.key }, 'webhook amount mismatch');
        return { status: 'rejected' as const, reason: 'amount_mismatch' };
      }

      const [organization] = await tx
        .select({ timezone: organizations.timezone })
        .from(organizations)
        .where(eq(organizations.id, intent.organizationId));
      const recorded = await recordPayment(tx, {
        organizationId: intent.organizationId,
        branchId: intent.branchId,
        accountId: intent.accountId,
        studentId: intent.studentId,
        currency: intent.currency,
        amountMinor: intent.amountMinor,
        method: 'online',
        receivedAt: event.occurredAt,
        timezone: organization?.timezone ?? 'Europe/Istanbul',
        provider: provider.key,
        providerReference: event.providerReference,
        paymentIntentId: intent.id,
        payerName: null,
        allocation: { mode: 'auto' },
      });

      await tx
        .update(paymentIntents)
        .set({ status: 'succeeded', paymentId: recorded.paymentId })
        .where(eq(paymentIntents.id, intent.id));
      await finish('processed', intent.organizationId);

      await this.audit.record(tx, {
        organizationId: intent.organizationId,
        branchId: intent.branchId,
        actor: { type: 'webhook' },
        action: 'payment.created',
        resourceType: 'payment',
        resourceId: recorded.paymentId,
        metadata: {
          provider: provider.key,
          providerEventId: event.eventId,
          receiptNumber: recorded.receiptNumber,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          allocations: recorded.allocations,
        },
      });
      await this.outbox.publish(tx, {
        organizationId: intent.organizationId,
        aggregateType: 'payment',
        aggregateId: recorded.paymentId,
        eventType: DomainEvents.paymentReceived,
        payload: {
          paymentId: recorded.paymentId,
          accountId: intent.accountId,
          studentId: intent.studentId,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          method: 'online',
          provider: provider.key,
          allocations: recorded.allocations,
        },
      });
      return { status: 'processed' as const, paymentId: recorded.paymentId };
    });
  }
}
