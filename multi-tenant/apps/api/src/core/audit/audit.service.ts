import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../platform/context/request-context.js';
import {
  type ActorType,
  type AuditChanges,
  auditLogs,
} from '../../platform/database/schema/index.js';
import type { DbExecutor } from '../../platform/database/types.js';

export interface AuditActor {
  type: ActorType;
  userId?: string | null;
  membershipId?: string | null;
  supportSessionId?: string | null;
}

export interface AuditEntry {
  organizationId: string | null;
  branchId?: string | null;
  actor: AuditActor;
  /** Past-tense `resource.verb`, e.g. `payment.created`, `role.updated`. */
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: AuditChanges | null;
  metadata?: Record<string, unknown> | null;
}

/** Fields whose values never enter the audit log (only the fact that they changed). */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'nationalId',
  'nationalIdCiphertext',
  'nationalIdHash',
  'token',
  'tokenHash',
]);

/**
 * Builds before/after pairs for changed fields only. Redacted fields are recorded as changed
 * without values; nothing else about secrets or raw identifiers is stored.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AuditChanges | null {
  const changes: AuditChanges = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = before[key];
    const next = after[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes[key] = REDACTED_FIELDS.has(key)
      ? { before: '[redacted]', after: '[redacted]' }
      : { before: previous ?? null, after: next ?? null };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/** Snapshot of selected fields for "created" audit entries. */
export function createdChanges(values: Record<string, unknown>): AuditChanges {
  return diffChanges({}, values) ?? {};
}

/**
 * Writes audit records inside the caller's transaction, so an audit entry exists if and only if
 * the audited change committed. Request metadata (ip, user agent, request id) is attached
 * automatically from the request context.
 */
@Injectable()
export class AuditService {
  async record(db: DbExecutor, entry: AuditEntry): Promise<void> {
    const context = RequestContext.get();
    await db.insert(auditLogs).values({
      organizationId: entry.organizationId,
      branchId: entry.branchId ?? null,
      actorType: entry.actor.type,
      actorUserId: entry.actor.userId ?? null,
      actorMembershipId: entry.actor.membershipId ?? null,
      supportSessionId: entry.actor.supportSessionId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent?.slice(0, 500) ?? null,
      requestId: context?.requestId ?? null,
    });
  }
}
