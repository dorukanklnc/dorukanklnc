import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type FinanceSummaryQuery,
  financeKpisSchema,
  financeSummaryQuerySchema,
  financeSummarySchema,
} from '@repo/contracts';
import { ApiZodQuery, ApiZodResponse, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { FinanceSummaryService } from './finance-summary.service.js';

@ApiTags('finance')
@Controller('finance')
export class FinanceSummaryController {
  constructor(private readonly summary: FinanceSummaryService) {}

  @RequirePermission('finance.reports.read')
  @Get('summary')
  @ApiZodQuery(financeSummaryQuerySchema)
  @ApiZodResponse(200, financeSummarySchema)
  get(@CurrentActor() actor: Actor, @ValidQuery(financeSummaryQuerySchema) query: FinanceSummaryQuery) {
    return this.summary.summary(actor, query);
  }

  /** Aggregate KPIs only — for roles without access to individual accounts (principals). */
  @RequirePermission('finance.kpis.read')
  @Get('kpis')
  @ApiZodQuery(financeSummaryQuerySchema)
  @ApiZodResponse(200, financeKpisSchema)
  kpis(@CurrentActor() actor: Actor, @ValidQuery(financeSummaryQuerySchema) query: FinanceSummaryQuery) {
    return this.summary.kpis(actor, query);
  }
}
