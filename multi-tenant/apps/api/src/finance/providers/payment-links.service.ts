import { Inject, Injectable } from '@nestjs/common';
import type { CreatePaymentLinkRequest, PaymentLink } from '@repo/contracts';
import { and, eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { paymentIntents } from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import { Errors } from '../../platform/errors/app-error.js';
import { uuidv7 } from '../../platform/ids.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { branchPredicate } from '../../core/authorization/scope-filters.js';
import { findOrCreateAccount, loadStudentForFinance } from '../shared.js';
import { MockPaymentProvider } from './mock-payment.provider.js';
import { PaymentProviderRegistry } from './payment-provider.registry.js';
import { PaymentWebhookService, type WebhookOutcome } from './payment-webhook.service.js';

type IntentRow = typeof paymentIntents.$inferSelect;

function toLink(row: IntentRow): PaymentLink {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt.toISOString(),
    paymentId: row.paymentId,
  };
}

/** Online payment links (hosted checkout). Settlement happens only through verified webhooks. */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly registry: PaymentProviderRegistry,
    private readonly mock: MockPaymentProvider,
    private readonly webhooks: PaymentWebhookService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    actor: Actor,
    input: CreatePaymentLinkRequest,
    providerKey = 'mock',
  ): Promise<PaymentLink> {
    const provider = this.registry.get(providerKey);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const student = await loadStudentForFinance(
        tx,
        actor,
        input.studentId,
        'finance.payments.create',
      );
      const accountId = await findOrCreateAccount(tx, {
        organizationId: actor.organizationId,
        branchId: student.branchId,
        studentId: student.id,
        currency: input.currency,
      });
      const intentId = uuidv7();
      const link = await provider.createPaymentLink({
        intentId,
        organizationId: actor.organizationId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: input.description,
      });
      const [intent] = await tx
        .insert(paymentIntents)
        .values({
          id: intentId,
          organizationId: actor.organizationId,
          branchId: student.branchId,
          accountId,
          studentId: student.id,
          provider: provider.key,
          providerReference: link.providerReference,
          description: input.description,
          currency: input.currency,
          amountMinor: input.amountMinor,
          checkoutUrl: link.checkoutUrl,
          expiresAt: link.expiresAt,
          createdByMembershipId: actor.membershipId,
        })
        .returning();
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: student.branchId,
        actor: actor.auditActor(),
        action: 'payment_link.created',
        resourceType: 'payment_intent',
        resourceId: intentId,
        metadata: {
          provider: provider.key,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
      });
      return toLink(intent!);
    });
  }

  async get(actor: Actor, intentId: string): Promise<PaymentLink> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [intent] = await tx
        .select()
        .from(paymentIntents)
        .where(
          and(
            eq(paymentIntents.organizationId, actor.organizationId),
            eq(paymentIntents.id, intentId),
            branchPredicate(actor, 'finance.payments.read', paymentIntents.branchId),
          ),
        );
      if (!intent) throw Errors.notFound('Payment link');
      return toLink(intent);
    });
  }

  /**
   * Development only: completes a mock checkout by sending a signed webhook through the exact
   * same processing path a real provider callback uses.
   */
  async simulateMockPayment(actor: Actor, intentId: string): Promise<WebhookOutcome> {
    if (this.config.isProduction) throw Errors.notFound();
    const link = await this.get(actor, intentId);
    if (link.provider !== this.mock.key) throw Errors.notFound('Payment link');
    const [intent] = await this.db.transaction(actor.tenantScope(), (tx) =>
      tx
        .select({ reference: paymentIntents.providerReference })
        .from(paymentIntents)
        .where(eq(paymentIntents.id, intentId)),
    );
    const signed = this.mock.buildSignedEvent({
      type: 'payment.succeeded',
      providerReference: intent!.reference,
      amountMinor: link.amountMinor,
      currency: link.currency,
    });
    return this.webhooks.handle(this.mock.key, Buffer.from(signed.body), signed.headers);
  }
}
