import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AgreementPreviewRequest,
  type CreateAgreementRequest,
  agreementPreviewRequestSchema,
  agreementPreviewSchema,
  agreementSchema,
  createAgreementRequestSchema,
  studentFinanceSchema,
} from '@repo/contracts';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { AgreementsService } from './agreements.service.js';

@ApiTags('finance')
@Controller('finance')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @RequirePermission('finance.collections.write')
  @Post('agreements/preview')
  @HttpCode(200)
  @ApiZodBody(agreementPreviewRequestSchema)
  @ApiZodResponse(200, agreementPreviewSchema)
  preview(
    @CurrentActor() actor: Actor,
    @ValidBody(agreementPreviewRequestSchema) body: AgreementPreviewRequest,
  ) {
    return this.agreements.preview(actor, body);
  }

  @RequirePermission('finance.collections.write')
  @Post('agreements')
  @ApiZodBody(createAgreementRequestSchema)
  @ApiZodResponse(201, agreementSchema)
  create(
    @CurrentActor() actor: Actor,
    @ValidBody(createAgreementRequestSchema) body: CreateAgreementRequest,
  ) {
    return this.agreements.create(actor, body);
  }

  @RequirePermission('finance.collections.read')
  @Get('agreements/:id')
  @ApiZodResponse(200, agreementSchema)
  get(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.agreements.get(actor, id);
  }

  @RequirePermission('finance.collections.read')
  @Get('students/:id')
  @ApiZodResponse(200, studentFinanceSchema)
  studentFinance(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.agreements.studentFinance(actor, id);
  }
}
