import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const DEV_FIELD_ENCRYPTION_KEY = 'ZGV2LW9ubHktZmllbGQtZW5jcnlwdGlvbi1rZXktMzI=';
const DEV_FIELD_HASH_KEY = 'dev-only-field-hash-key-change-me-0123456789';
const DEV_WEBHOOK_SECRET = 'dev-only-mock-webhook-secret';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    /** Public origin of the web app; used in e-mail links. */
    APP_URL: z.url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: booleanString.default(false),
    TRUST_PROXY: booleanString.default(false),
    SWAGGER_ENABLED: booleanString.optional(),

    DATABASE_URL: z.string().min(1),
    DATABASE_SYSTEM_URL: z.string().min(1),
    DATABASE_MIGRATION_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
    DATABASE_SYSTEM_POOL_MAX: z.coerce.number().int().min(1).max(50).default(4),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(15_000),

    REDIS_URL: z.string().default('redis://localhost:6379'),
    RATE_LIMIT_ENABLED: booleanString.default(true),
    RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),

    SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).default(12 * 60),
    SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().min(1).default(7 * 24),
    COOKIE_SECURE: booleanString.optional(),

    /** Base64-encoded 32-byte key for AES-256-GCM field encryption. */
    FIELD_ENCRYPTION_KEY: z.string().default(DEV_FIELD_ENCRYPTION_KEY),
    FIELD_HASH_KEY: z.string().min(32).default(DEV_FIELD_HASH_KEY),

    MAIL_DRIVER: z.enum(['smtp', 'console', 'memory']).default('console'),
    MAIL_FROM: z.string().default('CampusOS <no-reply@campusos.local>'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    PAYMENT_MOCK_WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),

    WORKER_OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(1000),
  })
  .superRefine((env, ctx) => {
    const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIELD_ENCRYPTION_KEY'],
        message: 'must be a base64-encoded 32-byte key',
      });
    }
    if (env.NODE_ENV === 'production') {
      const devDefaults: [keyof typeof env, string][] = [
        ['FIELD_ENCRYPTION_KEY', DEV_FIELD_ENCRYPTION_KEY],
        ['FIELD_HASH_KEY', DEV_FIELD_HASH_KEY],
        ['PAYMENT_MOCK_WEBHOOK_SECRET', DEV_WEBHOOK_SECRET],
      ];
      for (const [name, value] of devDefaults) {
        if (env[name] === value) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'development default in production' });
        }
      }
      if (env.MAIL_DRIVER !== 'smtp') {
        ctx.addIssue({ code: 'custom', path: ['MAIL_DRIVER'], message: 'smtp required in production' });
      }
    }
  });

export type AppConfig = Readonly<
  z.infer<typeof envSchema> & {
    isProduction: boolean;
    cookieSecure: boolean;
    sessionCookieName: string;
    csrfCookieName: string;
    swaggerEnabled: boolean;
  }
>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Loads `.env` files (app directory first, then the monorepo root) without overriding variables
 * that are already set, then validates the environment. Invalid configuration aborts startup.
 */
export function loadEnvFiles(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const appRoot = resolve(here, '../../..');
  const candidates = [resolve(appRoot, '.env'), resolve(appRoot, '../../.env')];
  for (const file of candidates) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const parsed = result.data;
  const isProduction = parsed.NODE_ENV === 'production';
  const cookieSecure = parsed.COOKIE_SECURE ?? isProduction;
  return Object.freeze({
    ...parsed,
    isProduction,
    cookieSecure,
    // __Host- cookies must be Secure, host-only and Path=/ — enforced by browsers.
    sessionCookieName: cookieSecure ? '__Host-sid' : 'sid',
    csrfCookieName: cookieSecure ? '__Host-csrf' : 'csrf',
    swaggerEnabled: parsed.SWAGGER_ENABLED ?? !isProduction,
  });
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) {
    loadEnvFiles();
    cached = parseConfig();
  }
  return cached;
}

/** Test helper: forget the cached configuration so a new environment can be parsed. */
export function resetConfigCache(): void {
  cached = undefined;
}
