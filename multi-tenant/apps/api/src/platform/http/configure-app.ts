import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/env.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';
import { requestContextMiddleware } from './request-context.middleware.js';

/**
 * HTTP pipeline shared by the server entry point and integration tests.
 * Routes live under /api/v1 (URI versioning); health endpoints are version-neutral (/api/health).
 */
export function configureApp(app: NestExpressApplication, config: AppConfig, logger: Logger): void {
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.use(requestContextMiddleware(logger));
  app.use(
    helmet({
      // The API serves JSON; a strict CSP only matters for the Swagger UI, which needs inline assets.
      contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ProblemDetailsFilter(logger));
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CampusOS API')
        .setDescription(
          'Multi-tenant education operations API. Authentication uses an HttpOnly session cookie; ' +
            'unsafe methods require the x-csrf-token header. Errors are RFC 9457 problem details.',
        )
        .setVersion('1')
        .addCookieAuth('sid')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
  }
}
