import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { PermissionKey, PlatformPermission } from '@repo/authorization';
import type { Request } from 'express';
import type { Actor } from './actor.js';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ANY_PERMISSIONS_KEY = 'auth:any-permissions';
export const PLATFORM_PERMISSIONS_KEY = 'auth:platform-permissions';
export const ORGANIZATION_OPTIONAL_KEY = 'auth:organization-optional';

/** No session required (login, password reset, invitation acceptance, webhooks, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Every listed permission must be held (any scope). Scope is enforced in the service layer. */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** At least one of the listed permissions must be held. */
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

/** Platform staff endpoints; implies no active organization is needed. */
export const RequirePlatformPermission = (...permissions: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);

/** Authenticated endpoints that work without an active organization (session, org switch). */
export const OrganizationOptional = () => SetMetadata(ORGANIZATION_OPTIONAL_KEY, true);

export interface AuthenticatedRequest extends Request {
  actor?: Actor;
}

/** Injects the resolved {@link Actor}. Only valid on authenticated routes. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.actor) throw new Error('CurrentActor used on a route without authentication');
  return request.actor;
});
