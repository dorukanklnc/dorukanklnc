import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';
import { ConfigModule } from '../platform/config/config.module.js';
import { APP_CONFIG, type AppConfig } from '../platform/config/env.js';
import { DatabaseModule } from '../platform/database/database.module.js';
import { LOGGER, LoggingModule } from '../platform/logging/logging.module.js';
import { BullMqOutboxPublisher } from './bullmq-outbox-publisher.js';
import { LogOutboxPublisher } from './log-outbox-publisher.js';
import { OUTBOX_PUBLISHER, type OutboxPublisher } from './outbox-publisher.js';
import { OutboxRelayService } from './outbox-relay.service.js';

/** Background processing: no HTTP, only the database, the logger and job infrastructure. */
@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule],
  providers: [
    {
      provide: OUTBOX_PUBLISHER,
      inject: [APP_CONFIG, LOGGER],
      useFactory: (config: AppConfig, logger: Logger): OutboxPublisher =>
        config.OUTBOX_PUBLISHER === 'bullmq'
          ? new BullMqOutboxPublisher(config.REDIS_URL)
          : new LogOutboxPublisher(logger),
    },
    OutboxRelayService,
  ],
  exports: [OutboxRelayService],
})
export class WorkerModule implements OnApplicationShutdown {
  constructor(@Inject(OUTBOX_PUBLISHER) private readonly publisher: OutboxPublisher) {}

  async onApplicationShutdown(): Promise<void> {
    await this.publisher.close?.();
  }
}
