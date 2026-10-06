import { Inject, Injectable } from '@nestjs/common';
import type {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  ActiveSession,
  ChangePasswordRequest,
  InvitationPreview,
  LoginRequest,
  ResetPasswordRequest,
  Session,
} from '@repo/contracts';
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { generateToken, hashToken } from '../../platform/crypto/tokens.js';
import {
  branches,
  invitations,
  membershipBranches,
  memberships,
  organizations,
  passwordResetTokens,
  sessions,
  users,
} from '../../platform/database/schema/index.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import { AppError, Errors } from '../../platform/errors/app-error.js';
import { LOGGER } from '../../platform/logging/logging.module.js';
import { passwordResetEmail } from '../../platform/mail/templates.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DomainEvents } from '../outbox/events.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { Actor } from '../authorization/actor.js';
import { AuthorizationContextService } from '../authorization/authorization-context.service.js';
import { PasswordService } from './password.service.js';
import { type IssuedSession, SessionService } from './session.service.js';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_MINUTES = 30;

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface SessionResult {
  issued: IssuedSession;
  session: Session;
}

/**
 * Authentication flows. All of them run before a tenant context exists (or across tenants),
 * so they use the system database role — one of the few intended users of SystemDatabase.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly systemDb: SystemDatabase,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly authorization: AuthorizationContextService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  // ── Login / logout ────────────────────────────────────────────────────────────────────

  async login(input: LoginRequest, client: ClientInfo): Promise<SessionResult> {
    const db = this.systemDb.db;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
        platformRole: users.platformRole,
        lockedUntil: users.lockedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    // Identical response and comparable timing whether or not the account exists.
    const invalid = () => new AppError('AUTH_INVALID_CREDENTIALS', 401, 'Invalid credentials');
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      this.logger.info({ reason: 'unknown_account' }, 'login failed');
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.passwords.verifyDummy(input.password);
      throw invalid();
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await db
        .update(users)
        .set({
          failedLoginAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
        })
        .where(eq(users.id, user.id));
      await this.audit.record(db, {
        organizationId: null,
        actor: { type: 'user', userId: user.id },
        action: lock ? 'auth.account_locked' : 'auth.login_failed',
        resourceType: 'user',
        resourceId: user.id,
      });
      throw invalid();
    }

    if (user.status === 'disabled') {
      throw new AppError('AUTH_ACCOUNT_DISABLED', 403, 'This account is disabled');
    }

    const activeMemberships = await this.activeMembershipsOf(user.id);
    if (activeMemberships.length === 0 && !user.platformRole) {
      throw new AppError('AUTH_NO_ACTIVE_MEMBERSHIP', 403, 'No active organization membership');
    }
    const preferred = await this.preferredMembership(user.id, activeMemberships);

    const issued = await this.systemDb.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: sql`now()` })
        .where(eq(users.id, user.id));
      const created = await this.sessions.create(
        { userId: user.id, membership: preferred, ip: client.ip, userAgent: client.userAgent },
        tx,
      );
      await this.audit.record(tx, {
        organizationId: preferred?.organizationId ?? null,
        actor: { type: 'user', userId: user.id, membershipId: preferred?.id ?? null },
        action: 'auth.login_succeeded',
        resourceType: 'session',
        resourceId: created.id,
      });
      return created;
    });

    return { issued, session: await this.buildSession(user.id, preferred?.id ?? null) };
  }

  async logout(actor: Actor): Promise<void> {
    await this.sessions.revoke(actor.sessionId, 'logout');
    await this.audit.record(this.systemDb.db, {
      organizationId: actor.organization?.id ?? null,
      actor: actor.auditActor(),
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: actor.sessionId,
    });
  }

  async logoutEverywhere(actor: Actor): Promise<number> {
    const revoked = await this.sessions.revokeAllForUser(actor.userId, 'logout_all');
    await this.audit.record(this.systemDb.db, {
      organizationId: actor.organization?.id ?? null,
      actor: actor.auditActor(),
      action: 'auth.logout_all',
      resourceType: 'user',
      resourceId: actor.userId,
      metadata: { revokedSessions: revoked },
    });
    return revoked;
  }

  async listSessions(actor: Actor): Promise<ActiveSession[]> {
    const rows = await this.sessions.listActive(actor.userId);
    return rows.map((row) => ({
      id: row.id,
      current: row.id === actor.sessionId,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      ip: row.ip,
      userAgent: row.userAgent,
    }));
  }

  // ── Organization context ──────────────────────────────────────────────────────────────

  async switchOrganization(actor: Actor, organizationId: string): Promise<Session> {
    const target = (await this.activeMembershipsOf(actor.userId)).find(
      (membership) => membership.organizationId === organizationId,
    );
    if (!target) throw Errors.notFound('Organization');
    await this.sessions.setActiveMembership(actor.sessionId, target);
    await this.audit.record(this.systemDb.db, {
      organizationId,
      actor: { type: 'user', userId: actor.userId, membershipId: target.id },
      action: 'auth.organization_switched',
      resourceType: 'session',
      resourceId: actor.sessionId,
    });
    return this.buildSession(actor.userId, target.id);
  }

  sessionFor(actor: Actor): Promise<Session> {
    return this.buildSession(actor.userId, actor.membership?.id ?? null);
  }

  // ── Passwords ─────────────────────────────────────────────────────────────────────────

  /** Always resolves the same way; whether the account exists is never revealed. */
  async requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
    const db = this.systemDb.db;
    const [user] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        locale: users.locale,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || user.status !== 'active') {
      this.logger.info({ reason: user ? 'inactive_account' : 'unknown_account' }, 'reset skipped');
      return;
    }

    const token = generateToken();
    await this.systemDb.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
        requestedIp: client.ip,
      });
      await this.audit.record(tx, {
        organizationId: null,
        actor: { type: 'user', userId: user.id },
        action: 'auth.password_reset_requested',
        resourceType: 'user',
        resourceId: user.id,
      });
    });

    const message = passwordResetEmail({
      locale: user.locale,
      name: user.fullName,
      link: `${this.config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
      expiresInMinutes: RESET_TOKEN_MINUTES,
    });
    await this.mail.send({ to: email, ...message, template: 'password_reset' });
  }

  async resetPassword(input: ResetPasswordRequest): Promise<void> {
    await this.systemDb.transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          email: users.email,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(input.token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, sql`now()`),
            eq(users.status, 'active'),
          ),
        )
        .for('update')
        .limit(1);
      if (!record) throw new AppError('AUTH_INVALID_TOKEN', 400, 'Invalid or expired link');
      this.assertPasswordAcceptable(input.password, record.email);

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(eq(passwordResetTokens.id, record.id));
      await tx
        .update(users)
        .set({
          passwordHash: await this.passwords.hash(input.password),
          passwordChangedAt: sql`now()`,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, record.userId));
      await this.sessions.revokeAllForUser(record.userId, 'password_reset', { db: tx });
      await this.audit.record(tx, {
        organizationId: null,
        actor: { type: 'user', userId: record.userId },
        action: 'auth.password_reset',
        resourceType: 'user',
        resourceId: record.userId,
      });
    });
  }

  async changePassword(actor: Actor, input: ChangePasswordRequest): Promise<void> {
    const db = this.systemDb.db;
    const [user] = await db
      .select({ passwordHash: users.passwordHash, email: users.email })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    if (!user || !(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      throw new AppError('AUTH_PASSWORD_INCORRECT', 400, 'Current password is incorrect');
    }
    this.assertPasswordAcceptable(input.newPassword, user.email);
    await this.systemDb.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await this.passwords.hash(input.newPassword),
          passwordChangedAt: sql`now()`,
        })
        .where(eq(users.id, actor.userId));
      await this.sessions.revokeAllForUser(actor.userId, 'password_changed', {
        exceptSessionId: actor.sessionId,
        db: tx,
      });
      await this.audit.record(tx, {
        organizationId: actor.organization?.id ?? null,
        actor: actor.auditActor(),
        action: 'auth.password_changed',
        resourceType: 'user',
        resourceId: actor.userId,
      });
    });
  }

  // ── Invitations ───────────────────────────────────────────────────────────────────────

  async previewInvitation(token: string): Promise<InvitationPreview> {
    const invitation = await this.findPendingInvitation(token);
    return {
      organizationName: invitation.organizationName,
      email: invitation.email,
      fullName: invitation.fullName,
      requiresAccountSetup: invitation.passwordHash === null,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    token: string,
    input: AcceptInvitationRequest,
    client: ClientInfo,
  ): Promise<{ response: AcceptInvitationResponse; result?: SessionResult }> {
    const invitation = await this.findPendingInvitation(token);
    const needsSetup = invitation.passwordHash === null;
    if (needsSetup) {
      const errors = [];
      if (!input.fullName) errors.push({ path: 'fullName', code: 'required', message: 'Required' });
      if (!input.password) errors.push({ path: 'password', code: 'required', message: 'Required' });
      if (errors.length) throw Errors.validation(errors);
      this.assertPasswordAcceptable(input.password!, invitation.email);
    }

    const passwordHash = needsSetup ? await this.passwords.hash(input.password!) : null;
    const issued = await this.systemDb.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: invitations.status })
        .from(invitations)
        .where(eq(invitations.id, invitation.id))
        .for('update');
      if (locked?.status !== 'pending')
        throw new AppError('INVITATION_INVALID', 404, 'Invalid invitation');

      await tx
        .update(invitations)
        .set({ status: 'accepted', acceptedAt: sql`now()` })
        .where(eq(invitations.id, invitation.id));
      await tx
        .update(memberships)
        .set({
          status: 'active',
          joinedAt: sql`now()`,
          authzVersion: sql`${memberships.authzVersion} + 1`,
        })
        .where(eq(memberships.id, invitation.membershipId));
      if (needsSetup) {
        await tx
          .update(users)
          .set({
            fullName: input.fullName!,
            passwordHash,
            status: 'active',
            emailVerifiedAt: sql`now()`,
            passwordChangedAt: sql`now()`,
          })
          .where(eq(users.id, invitation.userId));
      } else {
        await tx
          .update(users)
          .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
          .where(eq(users.id, invitation.userId));
      }
      await this.audit.record(tx, {
        organizationId: invitation.organizationId,
        actor: { type: 'user', userId: invitation.userId, membershipId: invitation.membershipId },
        action: 'member.joined',
        resourceType: 'membership',
        resourceId: invitation.membershipId,
      });
      await this.outbox.publish(tx, {
        organizationId: invitation.organizationId,
        aggregateType: 'membership',
        aggregateId: invitation.membershipId,
        eventType: DomainEvents.memberJoined,
        payload: { membershipId: invitation.membershipId, userId: invitation.userId },
        actorUserId: invitation.userId,
      });
      if (!needsSetup) return null;
      return this.sessions.create(
        {
          userId: invitation.userId,
          membership: { id: invitation.membershipId, organizationId: invitation.organizationId },
          ip: client.ip,
          userAgent: client.userAgent,
        },
        tx,
      );
    });

    const response = { signedIn: issued !== null, organizationId: invitation.organizationId };
    if (!issued) return { response };
    return {
      response,
      result: {
        issued,
        session: await this.buildSession(invitation.userId, invitation.membershipId),
      },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────

  private assertPasswordAcceptable(password: string, email: string): void {
    if (!this.passwords.isAcceptable(password, email)) {
      throw Errors.validation([
        { path: 'password', code: 'weak_password', message: 'Password is too easy to guess' },
      ]);
    }
  }

  private async findPendingInvitation(token: string) {
    if (token.length < 20 || token.length > 200) {
      throw new AppError('INVITATION_INVALID', 404, 'Invalid invitation');
    }
    const [invitation] = await this.systemDb.db
      .select({
        id: invitations.id,
        organizationId: invitations.organizationId,
        membershipId: invitations.membershipId,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        userId: users.id,
        fullName: users.fullName,
        passwordHash: users.passwordHash,
        organizationName: organizations.name,
      })
      .from(invitations)
      .innerJoin(memberships, eq(memberships.id, invitations.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, sql`now()`),
          eq(organizations.status, 'active'),
        ),
      )
      .limit(1);
    if (!invitation) throw new AppError('INVITATION_INVALID', 404, 'Invalid invitation');
    return invitation;
  }

  private async activeMembershipsOf(userId: string) {
    return this.systemDb.db
      .select({ id: memberships.id, organizationId: memberships.organizationId })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          eq(organizations.status, 'active'),
        ),
      )
      .orderBy(asc(organizations.name));
  }

  /** The membership used in the user's most recent session, else the first active one. */
  private async preferredMembership(
    userId: string,
    active: { id: string; organizationId: string }[],
  ): Promise<{ id: string; organizationId: string } | null> {
    if (active.length <= 1) return active[0] ?? null;
    const [last] = await this.systemDb.db
      .select({ membershipId: sessions.activeMembershipId })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          inArray(
            sessions.activeMembershipId,
            active.map((membership) => membership.id),
          ),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return active.find((membership) => membership.id === last?.membershipId) ?? active[0] ?? null;
  }

  /** The session contract consumed by the web app to compose a permission-aware UI. */
  async buildSession(userId: string, membershipId: string | null): Promise<Session> {
    const db = this.systemDb.db;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        platformRole: users.platformRole,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw Errors.unauthenticated();

    const membershipRows = await db
      .select({
        membershipId: memberships.id,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, userId), eq(organizations.status, 'active')))
      .orderBy(asc(organizations.name));

    let context = null;
    if (membershipId) {
      const [version] = await db
        .select({ authzVersion: memberships.authzVersion })
        .from(memberships)
        .where(eq(memberships.id, membershipId))
        .limit(1);
      if (version) context = await this.authorization.resolve(membershipId, version.authzVersion);
    }

    let branchRows: { id: string; name: string; code: string }[] = [];
    if (context) {
      const { organization, membership } = context;
      branchRows = membership.allBranches
        ? await db
            .select({ id: branches.id, name: branches.name, code: branches.code })
            .from(branches)
            .where(and(eq(branches.organizationId, organization.id), eq(branches.status, 'active')))
            .orderBy(asc(branches.name))
        : await db
            .select({ id: branches.id, name: branches.name, code: branches.code })
            .from(membershipBranches)
            .innerJoin(branches, eq(branches.id, membershipBranches.branchId))
            .where(
              and(
                eq(membershipBranches.membershipId, membership.id),
                eq(branches.status, 'active'),
              ),
            )
            .orderBy(asc(branches.name));
    }

    const platformPermissions =
      user.platformRole === 'platform_admin'
        ? ([
            'platform.organizations.manage',
            'platform.support.access',
            'platform.audit.read',
          ] as const)
        : user.platformRole === 'platform_support'
          ? (['platform.support.access'] as const)
          : ([] as const);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        locale: user.locale,
      },
      memberships: membershipRows,
      activeOrganization: context?.organization ?? null,
      activeMembership: context
        ? {
            id: context.membership.id,
            title: context.membership.title,
            allBranches: context.membership.allBranches,
            branchIds: [...context.membership.branchIds],
            roles: [...context.membership.roles],
            personnelId: context.membership.personnelId,
          }
        : null,
      permissions: context ? context.permissions.toRecord() : {},
      platformPermissions: [...platformPermissions],
      enabledModules: context ? [...context.enabledModules] : [],
      branches: branchRows,
    };
  }
}
