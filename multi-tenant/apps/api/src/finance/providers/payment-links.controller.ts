import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreatePaymentLinkRequest,
  createPaymentLinkRequestSchema,
  paymentLinkSchema,
} from '@repo/contracts';
import type { Request } from 'express';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import { AppError } from '../../platform/errors/app-error.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, Public, RequirePermission } from '../../core/authorization/decorators.js';
import { PaymentLinksService } from './payment-links.service.js';
import { PaymentWebhookService } from './payment-webhook.service.js';

@ApiTags('finance')
@Controller()
export class PaymentLinksController {
  constructor(
    private readonly links: PaymentLinksService,
    private readonly webhooks: PaymentWebhookService,
  ) {}

  @RequirePermission('finance.payments.create')
  @Post('finance/payment-links')
  @ApiZodBody(createPaymentLinkRequestSchema)
  @ApiZodResponse(201, paymentLinkSchema)
  create(
    @CurrentActor() actor: Actor,
    @ValidBody(createPaymentLinkRequestSchema) body: CreatePaymentLinkRequest,
  ) {
    return this.links.create(actor, body);
  }

  @RequirePermission('finance.payments.read')
  @Get('finance/payment-links/:id')
  @ApiZodResponse(200, paymentLinkSchema)
  get(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.links.get(actor, id);
  }

  /** Development helper: complete a mock checkout (disabled in production). */
  @RequirePermission('finance.payments.create')
  @Post('finance/payment-links/:id/simulate')
  @HttpCode(200)
  simulate(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.links.simulateMockPayment(actor, id);
  }

  /** Provider callbacks. Authenticated by signature, not by session. */
  @Public()
  @Post('webhooks/payments/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) throw new AppError('VALIDATION_FAILED', 400, 'Missing body');
    const outcome = await this.webhooks.handle(provider, req.rawBody, req.headers);
    return { received: true, outcome: outcome.status };
  }
}
