import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type GuardianListQuery,
  guardianListItemSchema,
  guardianListQuerySchema,
  paginatedSchema,
} from '@repo/contracts';
import { ApiZodQuery, ApiZodResponse, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { GuardiansService } from './guardians.service.js';

@ApiTags('guardians')
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @RequirePermission('guardians.read')
  @Get()
  @ApiZodQuery(guardianListQuerySchema)
  @ApiZodResponse(200, paginatedSchema(guardianListItemSchema))
  list(@CurrentActor() actor: Actor, @ValidQuery(guardianListQuerySchema) query: GuardianListQuery) {
    return this.guardians.list(actor, query);
  }
}
