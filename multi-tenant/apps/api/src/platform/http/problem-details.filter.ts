import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ErrorCode, Problem } from '@repo/contracts';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { mapPostgresError } from '../errors/postgres-errors.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * Renders every error as `application/problem+json`. Unknown errors become a generic 500:
 * stack traces and internal messages are logged, never returned.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const problem = this.toProblem(exception, request);

    if (problem.status >= 500) {
      this.logger.error({ err: exception, path: request.path }, 'Unhandled error');
    } else if (problem.status === 403 || problem.status === 401) {
      this.logger.info({ code: problem.code, path: request.path }, 'Access denied');
    }

    if (response.headersSent) return;
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, request: Request): Problem {
    const requestId = RequestContext.requestId();
    const base = (status: number, code: ErrorCode, detail?: string): Problem => ({
      type: `https://docs.campusos.dev/errors/${code.toLowerCase().replaceAll('_', '-')}`,
      title: TITLES[status] ?? 'Error',
      status,
      code,
      ...(detail ? { detail } : {}),
      ...(requestId ? { requestId } : {}),
    });

    if (exception instanceof AppError) {
      return {
        ...base(exception.status, exception.code, exception.message),
        ...(exception.errors ? { errors: exception.errors } : {}),
      };
    }

    if (exception instanceof ThrottlerException) {
      return base(429, 'RATE_LIMITED', 'Too many requests');
    }

    const mapped = mapPostgresError(exception);
    if (mapped) return base(mapped.status, mapped.code, mapped.message);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) {
        return base(404, 'NOT_FOUND', `No route for ${request.method} ${request.path}`);
      }
      const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'CONFLICT');
      return base(status, code, status >= 500 ? undefined : exception.message);
    }

    // Body parser errors (malformed JSON, payload too large) carry a status/statusCode.
    const status = (exception as { status?: number; statusCode?: number } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return base(status, STATUS_CODES[status] ?? 'VALIDATION_FAILED', 'Malformed request');
    }

    return base(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
