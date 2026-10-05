import { type Column, type SQL, getTableName, sql } from 'drizzle-orm';
import { toSnakeCase } from 'drizzle-orm/casing';

/**
 * Fully qualified column reference (`"table"."column"`) for raw SQL fragments.
 *
 * Drizzle renders columns in the SELECT list of single-table queries without the table name.
 * Inside a correlated subquery an unqualified name would bind to the subquery's own tables —
 * silently wrong results. Always use `ref()` for outer references in select-list subqueries.
 */
export function ref(column: Column): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(toSnakeCase(column.name))}`;
}
