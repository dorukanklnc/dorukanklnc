import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';
import type { Database } from './types.js';

// Calendar dates stay 'YYYY-MM-DD' strings: converting them to JS Dates would shift them by the
// server's time zone. int8 (bigint) values — money in minor units, counts — become numbers, with
// a hard failure if a value ever exceeds the safe-integer range instead of silently rounding.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`int8 value out of safe range: ${value}`);
  return parsed;
});

export interface PoolOptions {
  connectionString: string;
  max: number;
  applicationName: string;
  statementTimeoutMs?: number;
}

export function createPool(options: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    application_name: options.applicationName,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(options.statementTimeoutMs ? { statement_timeout: options.statementTimeoutMs } : {}),
  });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema, casing: 'snake_case' });
}
