import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './core/audit/audit.module.js';
import { AuthGuard } from './core/auth/auth.guard.js';
import { AuthModule } from './core/auth/auth.module.js';
import { BranchesModule } from './core/branches/branches.module.js';
import { DashboardModule } from './core/dashboard/dashboard.module.js';
import { MembersModule } from './core/members/members.module.js';
import { OrganizationsModule } from './core/organizations/organizations.module.js';
import { RolesModule } from './core/roles/roles.module.js';
import { SearchModule } from './core/search/search.module.js';
import { EducationModule } from './education/education.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ConfigModule } from './platform/config/config.module.js';
import { APP_CONFIG, type AppConfig } from './platform/config/env.js';
import { CryptoModule } from './platform/crypto/crypto.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthController } from './platform/health/health.controller.js';
import { RedisThrottlerStorage } from './platform/http/redis-throttler.storage.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { MailModule } from './platform/mail/mail.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    CryptoModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        skipIf: () => !config.RATE_LIMIT_ENABLED,
        ...(config.RATE_LIMIT_STORE === 'redis'
          ? { storage: new RedisThrottlerStorage(config.REDIS_URL) }
          : {}),
      }),
    }),
    AuditModule,
    AuthModule,
    OrganizationsModule,
    BranchesModule,
    MembersModule,
    RolesModule,
    EducationModule,
    FinanceModule,
    SearchModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
