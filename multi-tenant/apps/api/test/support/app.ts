import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { getConfig } from '../../src/platform/config/env.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { getRootLogger } from '../../src/platform/logging/logging.module.js';
import { MailService } from '../../src/platform/mail/mail.service.js';

export interface TestApp {
  app: INestApplication;
  close(): Promise<void>;
  mail(): MailService;
  client(): TestClient;
  login(email: string, password?: string): Promise<TestClient>;
}

export const DEMO_PASSWORD = 'Demo!Parola2026';

/** Boots the real application (all modules, guards, filters) against the test database. */
export async function createTestApp(): Promise<TestApp> {
  const config = getConfig();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    rawBody: true,
  });
  configureApp(app, config, getRootLogger(config));
  await app.init();

  const testApp: TestApp = {
    app,
    close: () => app.close(),
    mail: () => app.get(MailService),
    client: () => new TestClient(app),
    async login(email: string, password = DEMO_PASSWORD) {
      const client = new TestClient(app);
      const response = await client.post('/api/v1/auth/login', { email, password });
      if (response.status !== 200) {
        throw new Error(
          `Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return client;
    },
  };
  return testApp;
}

/**
 * Cookie-keeping HTTP client that sends the CSRF header automatically, like the web app does.
 */
export class TestClient {
  readonly agent: ReturnType<typeof request.agent>;
  csrfToken: string | null = null;

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  private capture(response: request.Response): request.Response {
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    for (const cookie of cookies ?? []) {
      const match = /^csrf=([^;]*)/.exec(cookie);
      if (match) this.csrfToken = match[1] ? decodeURIComponent(match[1]) : null;
    }
    return response;
  }

  async get(path: string) {
    return this.capture(await this.agent.get(path));
  }

  async post(path: string, body?: object, headers: Record<string, string> = {}) {
    let req = this.agent.post(path).set(headers);
    if (this.csrfToken) req = req.set('x-csrf-token', this.csrfToken);
    return this.capture(await req.send(body ?? {}));
  }

  async patch(path: string, body?: object) {
    let req = this.agent.patch(path);
    if (this.csrfToken) req = req.set('x-csrf-token', this.csrfToken);
    return this.capture(await req.send(body ?? {}));
  }

  async delete(path: string) {
    let req = this.agent.delete(path);
    if (this.csrfToken) req = req.set('x-csrf-token', this.csrfToken);
    return this.capture(await req.send());
  }
}
