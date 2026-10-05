import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuditLogQuery,
  auditLogItemSchema,
  auditLogQuerySchema,
  paginatedSchema,
} from '@repo/contracts';
import { ApiZodQuery, ApiZodResponse, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequirePermission } from '../authorization/decorators.js';
import { AuditLogService } from './audit-log.service.js';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @RequirePermission('audit.read')
  @Get()
  @ApiZodQuery(auditLogQuerySchema)
  @ApiZodResponse(200, paginatedSchema(auditLogItemSchema))
  list(@CurrentActor() actor: Actor, @ValidQuery(auditLogQuerySchema) query: AuditLogQuery) {
    return this.auditLogs.list(actor, query);
  }
}
