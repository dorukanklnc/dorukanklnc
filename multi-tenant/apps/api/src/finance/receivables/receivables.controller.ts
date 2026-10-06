import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateChargeRequest,
  type ReceivableListQuery,
  createChargeRequestSchema,
  paginatedSchema,
  receivableListQuerySchema,
  receivableSchema,
} from '@repo/contracts';
import { z } from 'zod';
import { UuidParam } from '../../platform/http/params.js';
import {
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
  ValidBody,
  ValidQuery,
} from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { ReceivablesService } from './receivables.service.js';

const cancelSchema = z.object({ reason: z.string().trim().min(5).max(500) });

@ApiTags('finance')
@Controller('finance/receivables')
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  @RequirePermission('finance.collections.read')
  @Get()
  @ApiZodQuery(receivableListQuerySchema)
  @ApiZodResponse(200, paginatedSchema(receivableSchema))
  list(
    @CurrentActor() actor: Actor,
    @ValidQuery(receivableListQuerySchema) query: ReceivableListQuery,
  ) {
    return this.receivables.list(actor, query);
  }

  @RequirePermission('finance.collections.write')
  @Post('charges')
  @ApiZodBody(createChargeRequestSchema)
  @ApiZodResponse(201, receivableSchema)
  createCharge(
    @CurrentActor() actor: Actor,
    @ValidBody(createChargeRequestSchema) body: CreateChargeRequest,
  ) {
    return this.receivables.createCharge(actor, body);
  }

  @RequirePermission('finance.collections.write')
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiZodBody(cancelSchema)
  @ApiZodResponse(200, receivableSchema)
  cancel(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(cancelSchema) body: z.infer<typeof cancelSchema>,
  ) {
    return this.receivables.cancel(actor, id, body.reason);
  }
}
