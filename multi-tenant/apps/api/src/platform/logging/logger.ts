import type { LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { RequestContext } from '../context/request-context.js';

/**
 * Paths that must never reach log storage. Logs are an operational tool, not a data store:
 * no credentials, no tokens, no national IDs, no request bodies.
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.nationalId',
  '*.authorization',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

export function createLogger(options: { level: string; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    base: { service: 'campusos-api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    mixin() {
      const context = RequestContext.get();
      if (!context) return {};
      return {
        requestId: context.requestId,
        ...(context.userId ? { userId: context.userId } : {}),
        ...(context.organizationId ? { organizationId: context.organizationId } : {}),
      };
    },
    ...(options.pretty
      ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
      : {}),
  });
}

/** Adapts pino to Nest's LoggerService so framework logs share the same structured output. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    if (message instanceof Error) {
      this.logger.error({ err: message, context: stackOrContext }, message.message);
      return;
    }
    this.logger.error({ context: context ?? stackOrContext }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context }, String(message));
  }
}
