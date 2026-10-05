import { Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  type PaymentListQuery,
  type RecordPaymentRequest,
  type ReversePaymentRequest,
  paginatedSchema,
  paymentListItemSchema,
  paymentListQuerySchema,
  paymentSchema,
  recordPaymentRequestSchema,
  reversePaymentRequestSchema,
} from '@repo/contracts';
import type { Response } from 'express';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodQuery, ApiZodResponse, ValidBody, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('finance')
@Controller('finance/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermission('finance.payments.read')
  @Get()
  @ApiZodQuery(paymentListQuerySchema)
  @ApiZodResponse(200, paginatedSchema(paymentListItemSchema))
  list(@CurrentActor() actor: Actor, @ValidQuery(paymentListQuerySchema) query: PaymentListQuery) {
    return this.payments.list(actor, query);
  }

  @RequirePermission('finance.payments.read')
  @Get(':id')
  @ApiZodResponse(200, paymentSchema)
  get(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.payments.get(actor, id);
  }

  /** 201 for a new payment, 200 when the idempotency key replays an earlier request. */
  @RequirePermission('finance.payments.create')
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per submission (e.g. a UUID)' })
  @ApiZodBody(recordPaymentRequestSchema)
  @ApiZodResponse(201, paymentSchema)
  async record(
    @CurrentActor() actor: Actor,
    @ValidBody(recordPaymentRequestSchema) body: RecordPaymentRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.payments.record(actor, body, idempotencyKey);
    res.status(result.replayed ? 200 : 201);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.payment;
  }

  @RequirePermission('finance.payments.reverse')
  @Post(':id/reverse')
  @HttpCode(200)
  @ApiZodBody(reversePaymentRequestSchema)
  @ApiZodResponse(200, paymentSchema)
  reverse(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(reversePaymentRequestSchema) body: ReversePaymentRequest,
  ) {
    return this.payments.reverse(actor, id, body.reason);
  }
}
