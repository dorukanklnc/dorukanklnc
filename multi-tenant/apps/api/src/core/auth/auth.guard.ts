import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type ModuleKey,
  type PermissionKey,
  PermissionSet,
  type PlatformPermission,
  platformPermissionsOf,
} from '@repo/authorization';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { hashToken, safeEqual } from '../../platform/crypto/tokens.js';
import { AppError, Errors } from '../../platform/errors/app-error.js';
import { Actor } from '../authorization/actor.js';
import { AuthorizationContextService } from '../authorization/authorization-context.service.js';
import {
  ANY_PERMISSIONS_KEY,
  type AuthenticatedRequest,
  ORGANIZATION_OPTIONAL_KEY,
  PERMISSIONS_KEY,
  PLATFORM_PERMISSIONS_KEY,
  PUBLIC_KEY,
} from '../authorization/decorators.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: session → CSRF → actor (tenant, permissions) → route requirements.
 * Everything is resolved server-side; nothing about identity or access is read from the payload.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly authorization: AuthorizationContextService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[this.config.sessionCookieName];
    if (!token) throw Errors.unauthenticated();

    const session = await this.sessions.validate(token);
    if (!session) throw Errors.unauthenticated('Session expired or revoked');

    if (!SAFE_METHODS.has(request.method)) {
      const header = request.header('x-csrf-token');
      if (!header || !safeEqual(hashToken(header), session.csrfTokenHash)) {
        throw new AppError('CSRF_TOKEN_INVALID', 403, 'Missing or invalid CSRF token');
      }
    }

    let membershipContext = null;
    if (session.activeMembershipId && session.membershipAuthzVersion !== null) {
      membershipContext = await this.authorization.resolve(
        session.activeMembershipId,
        session.membershipAuthzVersion,
      );
      // Membership suspended or organization deactivated since the session started.
      if (!membershipContext) await this.sessions.setActiveMembership(session.id, null);
    }

    const actor = new Actor(
      session.id,
      {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
        platformRole: session.user.platformRole,
        locale: session.user.locale,
      },
      membershipContext?.organization ?? null,
      membershipContext?.membership ?? null,
      membershipContext?.permissions ?? PermissionSet.empty(),
      membershipContext?.enabledModules ?? new Set<ModuleKey>(),
      platformPermissionsOf(session.user.platformRole),
    );
    request.actor = actor;
    RequestContext.setIdentity(actor.userId, actor.organization?.id);

    const platformRequired = this.reflector.getAllAndOverride<PlatformPermission[] | undefined>(
      PLATFORM_PERMISSIONS_KEY,
      targets,
    );
    if (platformRequired?.length) {
      if (!platformRequired.every((permission) => actor.hasPlatformPermission(permission))) {
        throw Errors.forbidden();
      }
      return true;
    }

    const organizationOptional = this.reflector.getAllAndOverride<boolean>(
      ORGANIZATION_OPTIONAL_KEY,
      targets,
    );
    if (!organizationOptional && !actor.membership) {
      throw new AppError('AUTH_ORGANIZATION_REQUIRED', 409, 'Select an organization first');
    }

    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (required?.length && !required.every((permission) => actor.can(permission))) {
      throw Errors.forbidden();
    }

    const anyOf = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      ANY_PERMISSIONS_KEY,
      targets,
    );
    if (anyOf?.length && !anyOf.some((permission) => actor.can(permission))) {
      throw Errors.forbidden();
    }

    return true;
  }
}
