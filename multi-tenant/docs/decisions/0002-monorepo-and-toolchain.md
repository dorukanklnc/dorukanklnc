# ADR-0002: pnpm monorepo and toolchain versions

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Web and API share contracts (Zod schemas) and the authorization catalog. We want one repository,
strict dependency boundaries and reproducible installs. In October 2026 the ecosystem is mid
transition: TypeScript 7 (native Go compiler) is released, but `typescript-eslint` supports
`< 6.1` and the Nest CLI depends on TypeScript `~6.0`; ESLint 10 is released, but the React,
import and accessibility plugins used by `eslint-config-next` still declare ESLint ≤ 9.

## Decision

- **pnpm workspaces** (`apps/*`, `packages/*`), no extra task runner for now.
- **TypeScript 6.0** everywhere (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` for
  libraries and web). Revisit TS 7 when typescript-eslint and the Nest CLI support it.
- **ESLint 9** flat config with type-aware `typescript-eslint` rules; Prettier for formatting.
- **ESM everywhere** (NestJS 12 is ESM-only).
- Shared runtime packages (`@repo/contracts`, `@repo/authorization`) are **compiled to `dist`**
  with `tsc` and consumed as normal packages by Node, Vitest and Next.js. `@repo/ui` is consumed
  as source by Next.js (`transpilePackages`).
- **Vitest** for unit/integration tests, **Playwright** for E2E.

## Consequences

- Shared packages must be built before dependents are type-checked (`pnpm build:packages`; the
  root scripts do this automatically, `pnpm dev` runs them in watch mode).
- Upgrading to TS 7 / ESLint 10 is a contained change in `packages/tsconfig` and
  `packages/eslint-config`.

## Alternatives considered

- **Turborepo/Nx** — useful for caching at larger scale; not needed for two apps and three packages.
- **Source-only internal packages for the API** — `tsc` rejects files outside `rootDir`, and
  bundling a NestJS app needs decorator-metadata-aware tooling; building small packages is simpler.
