# Testing

The suites are layered so that the most important guarantees — tenant isolation, authorization,
financial correctness — are verified at the level where they are enforced, including directly
against PostgreSQL. CI runs all of them on every push (`.github/workflows/ci.yml`).

## 1. Suites at a glance

| Suite                    | Tool                             | Location                                                      | Needs                                 |
| ------------------------ | -------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Package unit tests       | Vitest                           | `packages/*/src/**/*.test.ts`                                 | nothing                               |
| API unit tests           | Vitest                           | `apps/api/src/**/*.test.ts`                                   | nothing                               |
| API integration/security | Vitest + Supertest               | `apps/api/test/**/*.test.ts`                                  | PostgreSQL (creates its own database) |
| Web unit/component       | Vitest + Testing Library (jsdom) | `apps/web/src/**/*.test.ts(x)`, `apps/web/messages/*.test.ts` | nothing                               |
| End-to-end               | Playwright (Chromium)            | `apps/web/e2e/*.spec.ts`                                      | API + web + seeded database           |

```bash
pnpm test                         # every unit and integration suite
pnpm --filter @repo/api test:unit
pnpm --filter @repo/api test:integration
pnpm --filter @repo/web test
pnpm test:e2e                     # see §4
```

## 2. What is covered

### Tenant isolation and RLS (database level — `test/security/rls*.test.ts`)

- No tenant context → zero rows (fail closed); wrong tenant context → zero rows.
- `WITH CHECK`: writes into another tenant are rejected.
- Branch boundary for branch-scoped members; organization-wide access only with `'*'`.
- Credentials and the outbox are invisible to `app_runtime`; the audit log is append-only.
- `FORCE ROW LEVEL SECURITY`: even the table owner sees nothing.
- Composite foreign keys reject cross-tenant references (e.g. a guardian of another tenant).
- **Coverage test:** every table with `organization_id` must have RLS enabled and forced, and the
  application roles must be neither superusers nor `BYPASSRLS` nor table owners.

### Authorization and isolation through the API (`tenant-isolation`, `authorization`)

- UUID guessing across tenants and branches returns 404 for records, never data.
- Teachers: assigned students only, 403 on every finance endpoint.
- Branch-scoped accountant sees only Kadıköy; principal gets aggregate KPIs only.
- Student affairs: students and guardians, no finance details.
- Anti-escalation: roles and member assignments cannot exceed the actor's own grants; last owner
  protection; members cannot change their own access.
- CSRF required on every state-changing request; unauthenticated access rejected.

### Finance (`test/finance/*.api.test.ts`, `src/finance/domain/finance-domain.test.ts`)

- Domain: discounts in sequence, rounding to whole units with the remainder first/last, due-date
  clamping (31 Jan → 28/29 Feb), FIFO allocation order, aging buckets.
- The vertical slice: student → agreement → installments → payment → FIFO allocation → balance →
  audit entry → outbox event; credit when overpaid; manual allocation limits.
- Idempotency: replay returns the original payment (200 + `Idempotent-Replayed`), key reuse with a
  different body is 409, concurrent duplicates record once.
- Reversal keeps history (allocations marked reversed), second reversal is 409.
- Database invariants: allocation sums cannot exceed payment or receivable amounts even with
  direct SQL.
- Webhooks: valid signature processed once, replays are duplicates, bad signatures and amount
  mismatches rejected.

### Authentication and onboarding (`test/auth/auth.api.test.ts`, `rate-limit.api.test.ts`)

- Enumeration-safe login (same status, code and message for unknown and wrong), cookies
  (`HttpOnly` session, readable CSRF), lockout after 10 failures, logout and logout-everywhere.
- Password reset: single-use, expiring tokens; sessions revoked after reset.
- Provisioning a tenant, invitations for new and existing users, suspension.
- Throttling of sign-in and password-reset requests (the only suite with the limiter enabled).

### Worker (`test/worker/outbox-relay.test.ts`)

- Each event delivered once and marked published; retries with backoff; parked after the last
  attempt; concurrent workers claim disjoint rows (`FOR UPDATE SKIP LOCKED`); events written by
  real business transactions are relayed.

### Web

- Money: parsing typed amounts (`12.500`, `12.500,50`, `12500.5`) into minor units without floating
  point, exact formatting up to `Number.MAX_SAFE_INTEGER`, percentage → basis points.
- Dates: organization time zone for "today", calendar dates never shifted, month clamping.
- Navigation per built-in role (hidden, not disabled), disabled modules, platform-only users.
- Security helpers: open-redirect guard for `?next=`, problem+json parsing, CSRF vs. 403.
- Message catalogs: identical keys and ICU arguments in every locale, every API error code and
  every permission labelled.
- Components: data table (sorting, paging, row navigation, empty/error states), status badges,
  money input normalization.

### End-to-end (`apps/web/e2e`)

- Authentication: redirect to login and back, enumeration-safe errors, external redirect targets
  ignored, sign-out protects pages, platform staff land on the console, language switch.
- Authorization in the UI: teacher sees no finance and gets the "no access" page by URL, accountant
  has no administration, principal sees KPIs only, another tenant's student URL is "not found",
  organization switching.
- Command palette: Turkish-insensitive record search.
- **The collections vertical slice** through the real UI: create a student with a guardian, create
  an agreement (server preview), record a payment, see the balance update and the audit trail.

## 3. Integration test database

The integration suites create a dedicated database (`campusos_test`) on the cluster at
`TEST_DATABASE_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`), create
the three application roles, apply all migrations and load the demo data once per run. Files run
sequentially against it. The rate limiter is disabled except in its own suite.

## 4. End-to-end tests

The suite needs a seeded database and running servers.

```bash
pnpm infra:up && pnpm db:reset
pnpm build
pnpm test:e2e            # starts API (rate limiter off) and web from the builds, or reuses running ones
```

Against development servers, start the API with `RATE_LIMIT_ENABLED=false` (every test signs in)
and run `pnpm test:e2e`; running servers are reused. Use `E2E_EXTERNAL_SERVERS=1` to never start
servers and `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` to use a preinstalled browser
instead of downloading one. Tests create uniquely named records, so they can run repeatedly.

## 5. Conventions

- A bug fix starts with a failing test at the lowest level that can express it.
- Security-relevant behavior gets a database-level test when the database enforces it.
- Never skip, comment out or weaken a failing test; fix the cause.
- No real personal data in fixtures — the seed is fictional and deterministic.
- Tests assert stable error `code`s, not English messages.
