import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateOrganizationRequest,
  createOrganizationRequestSchema,
  platformOrganizationSchema,
} from '@repo/contracts';
import { z } from 'zod';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequirePlatformPermission } from '../authorization/decorators.js';
import { PlatformOrganizationsService } from './platform-organizations.service.js';

@ApiTags('platform')
@Controller('platform/organizations')
export class PlatformOrganizationsController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

  @RequirePlatformPermission('platform.organizations.manage')
  @Get()
  @ApiZodResponse(200, z.array(platformOrganizationSchema))
  list() {
    return this.organizations.list();
  }

  @RequirePlatformPermission('platform.organizations.manage')
  @Post()
  @ApiZodBody(createOrganizationRequestSchema)
  create(
    @CurrentActor() actor: Actor,
    @ValidBody(createOrganizationRequestSchema) body: CreateOrganizationRequest,
  ) {
    return this.organizations.create(actor, body);
  }
}
