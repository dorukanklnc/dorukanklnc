import { PERMISSION_KEYS, SCOPES } from '@repo/authorization';
import { z } from 'zod';
import { uuidSchema } from './common.js';

export const permissionKeySchema = z.enum(PERMISSION_KEYS as [string, ...string[]]);
export const scopeSchema = z.enum(SCOPES);

export const grantSchema = z.object({
  permission: permissionKeySchema,
  scope: scopeSchema,
});
export type Grant = z.infer<typeof grantSchema>;

export const roleSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  templateKey: z.string().nullable(),
  memberCount: z.number().int(),
  grants: z.array(grantSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Role = z.infer<typeof roleSchema>;

export const createRoleRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  grants: z.array(grantSchema).min(1).max(200),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const updateRoleRequestSchema = createRoleRequestSchema.partial();
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export const permissionCatalogItemSchema = z.object({
  key: z.string(),
  module: z.string(),
  scopes: z.array(scopeSchema),
  sensitivity: z.enum(['standard', 'personal', 'financial', 'restricted']),
  description: z.string(),
  dependsOn: z.array(z.string()),
});
export type PermissionCatalogItem = z.infer<typeof permissionCatalogItemSchema>;
