import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { getConfig } from './platform/config/env.js';
import { NestPinoLogger } from './platform/logging/logger.js';
import { getRootLogger } from './platform/logging/logging.module.js';
import { OutboxRelayService } from './worker/outbox-relay.service.js';
import { WorkerModule } from './worker/worker.module.js';

/**
 * Worker entrypoint: relays the transactional outbox until SIGTERM/SIGINT. Safe to run several
 * instances (rows are claimed with SKIP LOCKED). Scheduled jobs (reminders, exports) join here.
 */
const config = getConfig();
const logger = getRootLogger(config).child({ component: 'worker' });

const app = await NestFactory.createApplicationContext(WorkerModule, {
  logger: new NestPinoLogger(logger),
});
const relay = app.get(OutboxRelayService);

let stopping = false;
const stop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker stopping');
};
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('SIGINT', () => stop('SIGINT'));

logger.info(
  { publisher: config.OUTBOX_PUBLISHER, pollMs: config.WORKER_OUTBOX_POLL_MS },
  'worker started',
);
while (!stopping) {
  try {
    const result = await relay.processBatch();
    const handled = result.published + result.retried + result.failed;
    if (handled > 0) logger.debug(result, 'outbox batch relayed');
    // A full batch means more may be waiting: continue immediately, otherwise poll.
    if (handled < config.WORKER_OUTBOX_BATCH_SIZE) await sleep(config.WORKER_OUTBOX_POLL_MS);
  } catch (error) {
    logger.error({ err: error }, 'outbox relay iteration failed');
    await sleep(Math.min(config.WORKER_OUTBOX_POLL_MS * 5, 30_000));
  }
}

await app.close();
logger.info('worker stopped');
