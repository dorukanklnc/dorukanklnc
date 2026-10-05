import { Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type UpdateOrganizationRequest,
  organizationSchema,
  updateOrganizationRequestSchema,
} from '@repo/contracts';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequirePermission } from '../authorization/decorators.js';
import { OrganizationService } from './organization.service.js';

@ApiTags('organization')
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  @ApiZodResponse(200, organizationSchema)
  current(@CurrentActor() actor: Actor) {
    return this.organization.current(actor);
  }

  @RequirePermission('settings.organization.manage')
  @Patch()
  @ApiZodBody(updateOrganizationRequestSchema)
  @ApiZodResponse(200, organizationSchema)
  update(
    @CurrentActor() actor: Actor,
    @ValidBody(updateOrganizationRequestSchema) body: UpdateOrganizationRequest,
  ) {
    return this.organization.update(actor, body);
  }
}
