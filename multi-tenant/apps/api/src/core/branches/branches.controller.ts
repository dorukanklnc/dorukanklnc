import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateBranchRequest,
  type UpdateBranchRequest,
  branchSchema,
  createBranchRequestSchema,
  updateBranchRequestSchema,
} from '@repo/contracts';
import { z } from 'zod';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequirePermission } from '../authorization/decorators.js';
import { BranchesService } from './branches.service.js';

@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiZodResponse(200, z.array(branchSchema))
  list(@CurrentActor() actor: Actor) {
    return this.branches.list(actor);
  }

  @RequirePermission('settings.branches.manage')
  @Post()
  @ApiZodBody(createBranchRequestSchema)
  @ApiZodResponse(201, branchSchema)
  create(@CurrentActor() actor: Actor, @ValidBody(createBranchRequestSchema) body: CreateBranchRequest) {
    return this.branches.create(actor, body);
  }

  @RequirePermission('settings.branches.manage')
  @Patch(':id')
  @ApiZodBody(updateBranchRequestSchema)
  @ApiZodResponse(200, branchSchema)
  update(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(updateBranchRequestSchema) body: UpdateBranchRequest,
  ) {
    return this.branches.update(actor, id, body);
  }
}
