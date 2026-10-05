import { Global, Inject, Module } from '@nestjs/common';
import type { Logger } from 'pino';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { createLogger } from './logger.js';

export const LOGGER = Symbol('LOGGER');

export const InjectLogger = () => Inject(LOGGER);

let rootLogger: Logger | undefined;

export function getRootLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'LOG_PRETTY'>): Logger {
  rootLogger ??= createLogger({ level: config.LOG_LEVEL, pretty: config.LOG_PRETTY });
  return rootLogger;
}

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => getRootLogger(config),
    },
  ],
  exports: [LOGGER],
})
export class LoggingModule {}
