import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { RequestContext } from '../context/request-context.js';
import { uuidv7 } from '../ids.js';

const INCOMING_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assigns a request/correlation id (honouring a well-formed incoming `x-request-id`), exposes it
 * in the response, runs the rest of the pipeline inside the AsyncLocalStorage context and writes
 * one structured access log line per request. Query strings and bodies are never logged.
 */
export function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : uuidv7();
    res.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();

    RequestContext.run(
      { requestId, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null },
      () => {
        res.on('finish', () => {
          const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
          const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
          logger[level](
            {
              method: req.method,
              route: (req.route as { path?: string } | undefined)?.path ?? req.path,
              status: res.statusCode,
              durationMs: Math.round(durationMs * 10) / 10,
            },
            'request completed',
          );
        });
        next();
      },
    );
  };
}
