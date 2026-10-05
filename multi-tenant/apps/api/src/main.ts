import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { getConfig } from './platform/config/env.js';
import { configureApp } from './platform/http/configure-app.js';
import { NestPinoLogger } from './platform/logging/logger.js';
import { getRootLogger } from './platform/logging/logging.module.js';

const config = getConfig();
const logger = getRootLogger(config);

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: new NestPinoLogger(logger),
  bodyParser: false,
  rawBody: true,
});
configureApp(app, config, logger);
await app.listen(config.PORT);
logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API listening');
