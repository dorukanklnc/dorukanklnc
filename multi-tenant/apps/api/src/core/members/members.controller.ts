import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type InviteMemberRequest,
  type MemberListQuery,
  type UpdateMemberRequest,
  inviteMemberRequestSchema,
  memberListQuerySchema,
  memberSchema,
  paginatedSchema,
  updateMemberRequestSchema,
} from '@repo/contracts';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodQuery, ApiZodResponse, ValidBody, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, RequirePermission } from '../authorization/decorators.js';
import { MembersService } from './members.service.js';

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @RequirePermission('settings.users.read')
  @Get()
  @ApiZodQuery(memberListQuerySchema)
  @ApiZodResponse(200, paginatedSchema(memberSchema))
  list(@CurrentActor() actor: Actor, @ValidQuery(memberListQuerySchema) query: MemberListQuery) {
    return this.members.list(actor, query);
  }

  @RequirePermission('settings.users.read')
  @Get(':id')
  @ApiZodResponse(200, memberSchema)
  get(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.members.get(actor, id);
  }

  @RequirePermission('settings.users.manage')
  @Post('invitations')
  @ApiZodBody(inviteMemberRequestSchema)
  @ApiZodResponse(201, memberSchema)
  invite(@CurrentActor() actor: Actor, @ValidBody(inviteMemberRequestSchema) body: InviteMemberRequest) {
    return this.members.invite(actor, body);
  }

  @RequirePermission('settings.users.manage')
  @Patch(':id')
  @ApiZodBody(updateMemberRequestSchema)
  @ApiZodResponse(200, memberSchema)
  update(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(updateMemberRequestSchema) body: UpdateMemberRequest,
  ) {
    return this.members.update(actor, id, body);
  }

  @RequirePermission('settings.users.manage')
  @Post(':id/suspend')
  @HttpCode(200)
  @ApiZodResponse(200, memberSchema)
  suspend(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.members.suspend(actor, id);
  }

  @RequirePermission('settings.users.manage')
  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiZodResponse(200, memberSchema)
  reactivate(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.members.reactivate(actor, id);
  }

  @RequirePermission('settings.users.manage')
  @Post(':id/resend-invitation')
  @HttpCode(204)
  async resendInvitation(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    await this.members.resendInvitation(actor, id);
  }
}
