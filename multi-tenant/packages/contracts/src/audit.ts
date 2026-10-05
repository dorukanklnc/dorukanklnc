import { z } from 'zod';
import { isoDateSchema, paginationQuerySchema, refSchema, uuidSchema } from './common.js';

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  resourceType: z.string().trim().max(60).optional(),
  resourceId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogItemSchema = z.object({
  id: uuidSchema,
  occurredAt: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: uuidSchema.nullable(),
  actor: z.object({
    type: z.enum(['user', 'system', 'support', 'webhook']),
    userId: uuidSchema.nullable(),
    name: z.string().nullable(),
  }),
  branch: refSchema.nullable(),
  changes: z.record(z.string(), z.object({ before: z.unknown(), after: z.unknown() })).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  requestId: z.string().nullable(),
});
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;
