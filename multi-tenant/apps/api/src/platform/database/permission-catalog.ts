import { PERMISSIONS, PERMISSION_KEYS } from '@repo/authorization';
import { notInArray, sql } from 'drizzle-orm';
import { permissions } from './schema/index.js';
import type { DbExecutor } from './types.js';

/**
 * Upserts the code-defined permission catalog into `permissions` and marks keys that no longer
 * exist as deprecated (never deleted: role grants keep referential integrity).
 */
export async function syncPermissionCatalog(db: DbExecutor): Promise<void> {
  const rows = PERMISSION_KEYS.map((key) => ({
    key,
    module: PERMISSIONS[key].module,
    allowedScopes: [...PERMISSIONS[key].scopes],
    sensitivity: PERMISSIONS[key].sensitivity,
    description: PERMISSIONS[key].description,
    deprecatedAt: null,
  }));
  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({
      target: permissions.key,
      set: {
        module: sql`excluded.module`,
        allowedScopes: sql`excluded.allowed_scopes`,
        sensitivity: sql`excluded.sensitivity`,
        description: sql`excluded.description`,
        deprecatedAt: sql`NULL`,
      },
    });
  await db
    .update(permissions)
    .set({ deprecatedAt: sql`now()` })
    .where(notInArray(permissions.key, PERMISSION_KEYS));
}
