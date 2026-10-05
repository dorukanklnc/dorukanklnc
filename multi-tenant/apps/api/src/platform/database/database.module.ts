import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { createDatabase, createPool } from './connection.js';
import { assertSafeDatabaseRoles } from './database-safety.js';
import { SystemDatabase } from './system-database.service.js';
import { TenantDatabase } from './tenant-database.service.js';
import { RUNTIME_DB, RUNTIME_POOL, SYSTEM_DB, SYSTEM_POOL, type Database } from './types.js';

@Global()
@Module({
  providers: [
    {
      provide: RUNTIME_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createPool({
          connectionString: config.DATABASE_URL,
          max: config.DATABASE_POOL_MAX,
          applicationName: 'campusos-runtime',
          statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
        }),
    },
    {
      provide: SYSTEM_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createPool({
          connectionString: config.DATABASE_SYSTEM_URL,
          max: config.DATABASE_SYSTEM_POOL_MAX,
          applicationName: 'campusos-system',
          statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
        }),
    },
    { provide: RUNTIME_DB, inject: [RUNTIME_POOL], useFactory: createDatabase },
    { provide: SYSTEM_DB, inject: [SYSTEM_POOL], useFactory: createDatabase },
    TenantDatabase,
    SystemDatabase,
  ],
  exports: [TenantDatabase, SystemDatabase, RUNTIME_DB, SYSTEM_DB],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(RUNTIME_POOL) private readonly runtimePool: pg.Pool,
    @Inject(SYSTEM_POOL) private readonly systemPool: pg.Pool,
    @Inject(RUNTIME_DB) private readonly runtimeDb: Database,
    @Inject(SYSTEM_DB) private readonly systemDb: Database,
  ) {}

  async onModuleInit(): Promise<void> {
    await assertSafeDatabaseRoles(this.runtimeDb, this.systemDb);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.runtimePool.end(), this.systemPool.end()]);
  }
}
