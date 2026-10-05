import { Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateRoleRequest,
  type UpdateRoleRequest,
  createRoleRequestSchema,
  permissionCatalogItemSchema,
  roleSchema,
  updateRoleRequestSchema,
} from '@repo/contracts';
import { z } from 'zod';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequireAnyPermission, RequirePermission } from '../authorization/decorators.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequireAnyPermission('settings.users.read', 'settings.roles.manage')
  @Get('permissions')
  @ApiZodResponse(200, z.array(permissionCatalogItemSchema))
  catalog() {
    return this.roles.catalog();
  }

  @RequireAnyPermission('settings.users.read', 'settings.roles.manage')
  @Get('roles')
  @ApiZodResponse(200, z.array(roleSchema))
  list(@CurrentActor() actor: Actor) {
    return this.roles.list(actor);
  }

  @RequirePermission('settings.roles.manage')
  @Post('roles')
  @ApiZodBody(createRoleRequestSchema)
  @ApiZodResponse(201, roleSchema)
  create(@CurrentActor() actor: Actor, @ValidBody(createRoleRequestSchema) body: CreateRoleRequest) {
    return this.roles.create(actor, body);
  }

  @RequirePermission('settings.roles.manage')
  @Patch('roles/:id')
  @ApiZodBody(updateRoleRequestSchema)
  @ApiZodResponse(200, roleSchema)
  update(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(updateRoleRequestSchema) body: UpdateRoleRequest,
  ) {
    return this.roles.update(actor, id, body);
  }

  @RequirePermission('settings.roles.manage')
  @Delete('roles/:id')
  @HttpCode(204)
  async archive(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    await this.roles.archive(actor, id);
  }
}
