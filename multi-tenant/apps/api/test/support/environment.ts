/**
 * Integration test environment. Tests run against a dedicated database on the PostgreSQL
 * cluster pointed to by TEST_DATABASE_ADMIN_URL (superuser or CREATEROLE + CREATEDB). The three
 * application roles use the development passwords from .env.example — never production values.
 */
export const TEST_DATABASE = process.env.TEST_DATABASE_NAME ?? 'campusos_test';
const host = process.env.TEST_DATABASE_HOST ?? 'localhost:5432';

export const TEST_ENV = {
  adminUrl: process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://postgres:postgres@${host}/postgres`,
  ownerUrl: `postgres://app_owner:app_owner_dev@${host}/${TEST_DATABASE}`,
  runtimeUrl: `postgres://app_runtime:app_runtime_dev@${host}/${TEST_DATABASE}`,
  systemUrl: `postgres://app_system:app_system_dev@${host}/${TEST_DATABASE}`,
  roles: {
    owner: { name: 'app_owner', password: 'app_owner_dev' },
    runtime: { name: 'app_runtime', password: 'app_runtime_dev' },
    system: { name: 'app_system', password: 'app_system_dev' },
  },
};

export function applyTestEnvironment(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_ENV.runtimeUrl,
    DATABASE_SYSTEM_URL: TEST_ENV.systemUrl,
    DATABASE_MIGRATION_URL: TEST_ENV.ownerUrl,
    MAIL_DRIVER: 'memory',
    RATE_LIMIT_ENABLED: 'false',
    COOKIE_SECURE: 'false',
    SWAGGER_ENABLED: 'false',
    APP_URL: 'http://localhost:3000',
  });
}
