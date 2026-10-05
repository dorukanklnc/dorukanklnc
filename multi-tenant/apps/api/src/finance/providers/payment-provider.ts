/**
 * Payment provider port (FINANCE_MODEL §11). Provider-specific code lives only in adapters;
 * the rest of the application sees intents, normalized webhook events and payments.
 */
export interface CreatePaymentLinkInput {
  intentId: string;
  organizationId: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface PaymentLinkResult {
  providerReference: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type ProviderEventType = 'payment.succeeded' | 'payment.failed';

export interface ProviderWebhookEvent {
  eventId: string;
  type: ProviderEventType;
  providerReference: string;
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  /** Sanitized payload stored in the webhook inbox (never card data). */
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly key: string;
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult>;
  /** Verifies the signature and normalizes the event; throws on invalid signatures. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderWebhookEvent;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
