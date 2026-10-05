import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { generateToken, hashToken } from '../../platform/crypto/tokens.js';
import { memberships, sessions, users } from '../../platform/database/schema/index.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import type { DbExecutor } from '../../platform/database/types.js';

export interface SessionRecord {
  id: string;
  userId: string;
  csrfTokenHash: string;
  activeOrganizationId: string | null;
  activeMembershipId: string | null;
  membershipAuthzVersion: number | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    platformRole: 'platform_admin' | 'platform_support' | null;
    locale: string | null;
    status: string;
  };
}

export interface IssuedSession {
  id: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Server-side sessions (ADR-0006). Opaque tokens; only SHA-256 hashes are stored.
 * Validation happens on every request, so revocation takes effect immediately.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly systemDb: SystemDatabase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    params: {
      userId: string;
      membership: { id: string; organizationId: string } | null;
      ip: string | null;
      userAgent: string | null;
    },
    db: DbExecutor = this.systemDb.db,
  ): Promise<IssuedSession> {
    const token = generateToken();
    const csrfToken = generateToken();
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + this.config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600_000);
    const idleExpiresAt = new Date(
      Math.min(now + this.config.SESSION_IDLE_TIMEOUT_MINUTES * 60_000, absoluteExpiresAt.getTime()),
    );
    const [row] = await db
      .insert(sessions)
      .values({
        userId: params.userId,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(csrfToken),
        activeOrganizationId: params.membership?.organizationId ?? null,
        activeMembershipId: params.membership?.id ?? null,
        ip: params.ip,
        userAgent: params.userAgent?.slice(0, 500) ?? null,
        idleExpiresAt,
        absoluteExpiresAt,
      })
      .returning({ id: sessions.id });
    if (!row) throw new Error('Session could not be created');
    return { id: row.id, token, csrfToken, expiresAt: absoluteExpiresAt };
  }

  async validate(token: string): Promise<SessionRecord | null> {
    if (token.length < 20 || token.length > 200) return null;
    const db = this.systemDb.db;
    const [row] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        csrfTokenHash: sessions.csrfTokenHash,
        activeOrganizationId: sessions.activeOrganizationId,
        activeMembershipId: sessions.activeMembershipId,
        lastSeenAt: sessions.lastSeenAt,
        membershipAuthzVersion: memberships.authzVersion,
        email: users.email,
        fullName: users.fullName,
        platformRole: users.platformRole,
        locale: users.locale,
        status: users.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(memberships, eq(memberships.id, sessions.activeMembershipId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.idleExpiresAt, sql`now()`),
          gt(sessions.absoluteExpiresAt, sql`now()`),
        ),
      )
      .limit(1);
    if (!row) return null;

    if (row.status !== 'active') {
      await this.revoke(row.id, 'account_disabled');
      return null;
    }

    if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await db
        .update(sessions)
        .set({
          lastSeenAt: sql`now()`,
          idleExpiresAt: sql`least(now() + make_interval(mins => ${this.config.SESSION_IDLE_TIMEOUT_MINUTES}), ${sessions.absoluteExpiresAt})`,
        })
        .where(eq(sessions.id, row.id));
    }

    return {
      id: row.id,
      userId: row.userId,
      csrfTokenHash: row.csrfTokenHash,
      activeOrganizationId: row.activeOrganizationId,
      activeMembershipId: row.activeMembershipId,
      membershipAuthzVersion: row.membershipAuthzVersion,
      user: {
        id: row.userId,
        email: row.email,
        fullName: row.fullName,
        platformRole: row.platformRole,
        locale: row.locale,
        status: row.status,
      },
    };
  }

  async setActiveMembership(
    sessionId: string,
    membership: { id: string; organizationId: string } | null,
  ): Promise<void> {
    await this.systemDb.db
      .update(sessions)
      .set({
        activeMembershipId: membership?.id ?? null,
        activeOrganizationId: membership?.organizationId ?? null,
      })
      .where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.systemDb.db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  async revokeAllForUser(
    userId: string,
    reason: string,
    options: { exceptSessionId?: string; db?: DbExecutor } = {},
  ): Promise<number> {
    const db = options.db ?? this.systemDb.db;
    const result = await db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          options.exceptSessionId ? ne(sessions.id, options.exceptSessionId) : undefined,
        ),
      );
    return result.rowCount ?? 0;
  }

  /** Ends sessions working inside a membership (e.g. after suspension). */
  async revokeForMembership(membershipId: string, reason: string): Promise<void> {
    await this.systemDb.db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.activeMembershipId, membershipId), isNull(sessions.revokedAt)));
  }

  async listActive(userId: string) {
    return this.systemDb.db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.absoluteExpiresAt, sql`now()`),
          gt(sessions.idleExpiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt));
  }
}
