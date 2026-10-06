import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { safeEqual } from '../../platform/crypto/tokens.js';
import { AppError } from '../../platform/errors/app-error.js';
import { uuidv7 } from '../../platform/ids.js';
import type {
  CreatePaymentLinkInput,
  PaymentLinkResult,
  PaymentProvider,
  ProviderEventType,
  ProviderWebhookEvent,
} from './payment-provider.js';

const SIGNATURE_HEADER = 'x-mock-signature';
const TOLERANCE_SECONDS = 300;

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  data: z.object({
    reference: z.string().min(1).max(200),
    amountMinor: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    occurredAt: z.iso.datetime({ offset: true }),
  }),
});

/**
 * Development/test provider with the same shape as real PSPs: hosted checkout link and
 * HMAC-SHA-256 signed webhooks (`t=<unix>,v1=<hex>` over `${t}.${body}`), replay-tolerant.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly key = 'mock';

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const providerReference = `mock_${uuidv7().replaceAll('-', '')}`;
    return Promise.resolve({
      providerReference,
      checkoutUrl: `${this.config.APP_URL}/pay/mock/${providerReference}?intent=${input.intentId}`,
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    });
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    const header = headers[SIGNATURE_HEADER];
    const signature = Array.isArray(header) ? header[0] : header;
    const parts = new Map(
      (signature ?? '').split(',').map((part) => {
        const [key, ...rest] = part.split('=');
        return [key?.trim() ?? '', rest.join('=').trim()] as const;
      }),
    );
    const timestamp = Number(parts.get('t'));
    const provided = parts.get('v1') ?? '';
    const invalid = () =>
      new AppError('WEBHOOK_SIGNATURE_INVALID', 400, 'Invalid webhook signature');
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS)
      throw invalid();
    if (!safeEqual(this.sign(timestamp, rawBody.toString('utf8')), provided)) throw invalid();

    let parsed: z.infer<typeof eventSchema>;
    try {
      parsed = eventSchema.parse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw new AppError('VALIDATION_FAILED', 400, 'Malformed webhook payload');
    }
    return {
      eventId: parsed.id,
      type: parsed.type,
      providerReference: parsed.data.reference,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      occurredAt: new Date(parsed.data.occurredAt),
      payload: parsed,
    };
  }

  /** Builds a signed webhook exactly as the mock PSP would send it (simulation and tests). */
  buildSignedEvent(input: {
    eventId?: string;
    type: ProviderEventType;
    providerReference: string;
    amountMinor: number;
    currency: string;
    occurredAt?: Date;
  }): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify({
      id: input.eventId ?? `evt_${uuidv7().replaceAll('-', '')}`,
      type: input.type,
      data: {
        reference: input.providerReference,
        amountMinor: input.amountMinor,
        currency: input.currency,
        occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      body,
      headers: {
        [SIGNATURE_HEADER]: `t=${timestamp},v1=${this.sign(timestamp, body)}`,
        'content-type': 'application/json',
      },
    };
  }

  private sign(timestamp: number, body: string): string {
    return createHmac('sha256', this.config.PAYMENT_MOCK_WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }
}
