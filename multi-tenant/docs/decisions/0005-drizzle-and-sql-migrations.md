# ADR-0005: Drizzle ORM with generated and hand-written SQL migrations

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

We need full control of PostgreSQL features (RLS, transaction-local settings, triggers, partial
indexes, generated columns, composite foreign keys) and explicit transactions, with type-safe
queries in TypeScript.

## Decision

- **Drizzle ORM** with **node-postgres** (`pg`): thin SQL-like query builder, explicit
  transactions, raw SQL when needed, OpenTelemetry instrumentation available for `pg`.
- The Drizzle schema (`src/platform/database/schema`) is the source of truth for tables, columns,
  indexes and constraints; `drizzle-kit generate` produces SQL migrations that are reviewed and
  committed.
- Security objects (extensions, `app` schema functions, RLS policies, grants, triggers) live in
  hand-written SQL migrations (`drizzle-kit generate --custom`), applied in the same ordered
  journal.
- Migrations run as `app_owner` via `pnpm db:migrate`; the running application never runs DDL.

## Consequences

- Readable SQL migrations in code review; no hidden ORM magic.
- Two kinds of migration files to keep in mind (documented in LOCAL_DEVELOPMENT).

## Alternatives considered

- **Prisma** — RLS with session variables requires interactive transactions and extensions;
  less control over generated SQL; heavier runtime.
- **TypeORM/MikroORM** — decorator-heavy entities, implicit behaviour around transactions.
- **Raw SQL only** — maximal control, but no type safety for queries.
