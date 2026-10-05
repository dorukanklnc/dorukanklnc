import { Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type SwitchOrganizationRequest,
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  invitationPreviewSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  sessionSchema,
  switchOrganizationRequestSchema,
} from '@repo/contracts';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { ApiZodBody, ApiZodResponse, ValidBody } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor, OrganizationOptional, Public } from '../authorization/decorators.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { clearSessionCookies, setSessionCookies } from './cookies.js';

function clientInfo(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginRequestSchema)
  @ApiZodResponse(200, sessionSchema)
  async login(
    @ValidBody(loginRequestSchema) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { issued, session } = await this.auth.login(body, clientInfo(req));
    setSessionCookies(res, this.config, issued);
    return session;
  }

  @OrganizationOptional()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor);
    clearSessionCookies(res, this.config);
  }

  @OrganizationOptional()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(actor);
    clearSessionCookies(res, this.config);
  }

  @OrganizationOptional()
  @Get('session')
  @ApiZodResponse(200, sessionSchema)
  session(@CurrentActor() actor: Actor) {
    return this.auth.sessionFor(actor);
  }

  @OrganizationOptional()
  @Post('session/organization')
  @HttpCode(200)
  @ApiZodBody(switchOrganizationRequestSchema)
  @ApiZodResponse(200, sessionSchema)
  switchOrganization(
    @CurrentActor() actor: Actor,
    @ValidBody(switchOrganizationRequestSchema) body: SwitchOrganizationRequest,
  ) {
    return this.auth.switchOrganization(actor, body.organizationId);
  }

  @OrganizationOptional()
  @Get('sessions')
  sessions(@CurrentActor() actor: Actor) {
    return this.auth.listSessions(actor);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(202)
  @ApiZodBody(forgotPasswordRequestSchema)
  async forgotPassword(
    @ValidBody(forgotPasswordRequestSchema) body: ForgotPasswordRequest,
    @Req() req: Request,
  ) {
    await this.auth.requestPasswordReset(body.email, clientInfo(req));
    return { accepted: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(204)
  @ApiZodBody(resetPasswordRequestSchema)
  async resetPassword(@ValidBody(resetPasswordRequestSchema) body: ResetPasswordRequest) {
    await this.auth.resetPassword(body);
  }

  @OrganizationOptional()
  @Post('password/change')
  @HttpCode(204)
  @ApiZodBody(changePasswordRequestSchema)
  async changePassword(
    @CurrentActor() actor: Actor,
    @ValidBody(changePasswordRequestSchema) body: ChangePasswordRequest,
  ) {
    await this.auth.changePassword(actor, body);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('invitations/:token')
  @ApiZodResponse(200, invitationPreviewSchema)
  previewInvitation(@Param('token') token: string) {
    return this.auth.previewInvitation(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/:token/accept')
  @HttpCode(200)
  @ApiZodBody(acceptInvitationRequestSchema)
  @ApiZodResponse(200, acceptInvitationResponseSchema)
  async acceptInvitation(
    @Param('token') token: string,
    @ValidBody(acceptInvitationRequestSchema) body: AcceptInvitationRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { response, result } = await this.auth.acceptInvitation(token, body, clientInfo(req));
    if (result) setSessionCookies(res, this.config, result.issued);
    return response;
  }
}
