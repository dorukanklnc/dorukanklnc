# Implementation checklist

What exists today, what is partially there and what is planned. Product-level scope and phases
are in [MVP_SCOPE](product/MVP_SCOPE.md); this list is the engineering view and is updated with
every change that adds or removes a capability.

Legend: ✅ built and tested · 🟡 partial (see note) · ⬜ planned

## 1. Foundation and tooling

| Item                                                                              | Status | Notes                                                                  |
| --------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| pnpm monorepo (`apps/api`, `apps/web`, `packages/*`) with shared TS/ESLint config | ✅     | [ADR-0002](decisions/0002-monorepo-and-toolchain.md)                   |
| Strict TypeScript, no unjustified `any`, Prettier, ESLint (type-aware)            | ✅     | `pnpm check` runs format, lint, typecheck, tests and build             |
| Environment validation at boot (Zod), safe production refusals                    | ✅     | Dev secrets, unsafe DB roles and non-SMTP mail are refused             |
| Local infrastructure with Docker Compose (PostgreSQL, Redis, MinIO, Mailpit)      | ✅     | No paid third-party accounts required                                  |
| Deterministic fictional seed with demo accounts for every role                    | ✅     | [LOCAL_DEVELOPMENT](development/LOCAL_DEVELOPMENT.md)                  |
| CI: verify job and Playwright end-to-end job                                      | ✅     | `.github/workflows/ci.yml` (repository root)                           |
| Product name centralized for renaming                                             | ✅     | [DESIGN_SYSTEM §14](product/DESIGN_SYSTEM.md#14-branding-and-renaming) |

## 2. Multi-tenancy and data

| Item                                                                                | Status | Notes                                                    |
| ----------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| Organization → branches hierarchy; `organization_id` on every tenant row            | ✅     | [MULTITENANCY](architecture/MULTITENANCY.md)             |
| PostgreSQL RLS enabled and forced on all tenant tables, fail-closed without context | ✅     | Coverage test fails if a new table lacks RLS             |
| Branch-level RLS for branch-scoped members                                          | ✅     |                                                          |
| Composite tenant foreign keys (no cross-tenant references even via direct SQL)      | ✅     |                                                          |
| Three database roles (`app_owner`, `app_runtime`, `app_system`), no `BYPASSRLS`     | ✅     | [ADR-0004](decisions/0004-database-roles.md)             |
| Tenant derived from the session, never from payloads                                | ✅     | Branch ids in payloads validated against access          |
| UUIDv7 keys, `timestamptz` instants, `date` calendar facts in the org time zone     | ✅     |                                                          |
| Drizzle schema + hand-written SQL migrations for security objects                   | ✅     | [ADR-0005](decisions/0005-drizzle-and-sql-migrations.md) |
| Organization groups / franchises (parent organization)                              | ⬜     | Designed in MULTITENANCY §8                              |
| Data retention jobs, outbox cleanup                                                 | ⬜     |                                                          |

## 3. Authentication and sessions

| Item                                                                                 | Status | Notes                                                   |
| ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------- |
| E-mail + password sign-in, argon2id hashes, enumeration-safe errors                  | ✅     |                                                         |
| Server-side sessions (opaque token, `HttpOnly` cookie), idle and absolute expiry     | ✅     | [ADR-0006](decisions/0006-server-side-sessions.md)      |
| CSRF synchronizer token on every state-changing request                              | ✅     |                                                         |
| Account lockout (10 failures → 15 minutes) and rate limiting (memory or Redis store) | ✅     |                                                         |
| Sign out, sign out everywhere, active session list                                   | ✅     | Revoking a single other session: ⬜                     |
| Password reset (single-use, expiring, revokes sessions) and password change          | ✅     |                                                         |
| Invitations (new and existing users), organization selection and switching           | ✅     |                                                         |
| Multi-factor authentication (TOTP, recovery codes)                                   | ⬜     | High priority before production pilots                  |
| SSO (Google Workspace / Microsoft Entra ID)                                          | ⬜     |                                                         |
| Platform support access to a tenant (time-boxed, consented, audited)                 | ⬜     | Platform staff currently cannot read tenant data at all |

## 4. Authorization

| Item                                                                                                                 | Status | Notes                                              |
| -------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| Permission catalog `resource.action` with scopes `own`/`assigned`/`branch`/`organization`                            | ✅     | `@repo/authorization`, shared by API and web       |
| Built-in role templates (owner, principal, branch manager, accountant, teacher, student affairs, admissions officer) | ✅     | [AUTHORIZATION](architecture/AUTHORIZATION.md)     |
| Custom roles with permission dependencies                                                                            | ✅     |                                                    |
| Anti-escalation (cannot grant more than you hold), last-owner protection, no self-changes                            | ✅     |                                                    |
| Scope-aware queries (assigned students for teachers, branch filters)                                                 | ✅     |                                                    |
| Module entitlements per organization (disabled module → hidden and `MODULE_DISABLED`)                                | ✅     | Set by plan at provisioning; read-only in settings |
| Permission-aware navigation, actions and tabs in the UI                                                              | ✅     | The API remains the authority                      |
| Field-level permissions (e.g. national ID reveal) with audit                                                         | ✅     |                                                    |
| Module toggling by platform staff after provisioning                                                                 | ⬜     |                                                    |

## 5. Organization administration (TenantCore)

| Item                                                                              | Status | Notes                                                    |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| Platform console: list and provision organizations (first branch + administrator) | ✅     |                                                          |
| Organization settings (name, legal name, time zone), module overview              | ✅     | Currency set at provisioning; locale defaults to Turkish |
| Branches: list, create, edit, activate/deactivate                                 | ✅     |                                                          |
| Users: invite, resend, edit roles and branch access, suspend, reactivate          | ✅     |                                                          |
| Roles and permissions screen with role editor                                     | ✅     |                                                          |
| Tenant suspension / offboarding with data export                                  | ⬜     |                                                          |
| Billing and plans for the SaaS itself                                             | ⬜     | `planKey` stored; no billing integration                 |

## 6. Audit, events and background work

| Item                                                                                     | Status | Notes                                                |
| ---------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| Append-only audit log (database-enforced), written in the same transaction as the change | ✅     | No secrets, tokens or full national IDs in entries   |
| Audit viewer with filters; per-record history (e.g. student history tab)                 | ✅     |                                                      |
| Transactional outbox with versioned events                                               | ✅     | [ADR-0010](decisions/0010-transactional-outbox.md)   |
| Worker: outbox relay (`SKIP LOCKED`, backoff, parking after max attempts, graceful stop) | ✅     | Publishers: structured log (default) or BullMQ queue |
| Event consumers (receipt e-mails, reminders, integrations)                               | ⬜     | Events are relayed; no handler acts on them yet      |
| Scheduled jobs (daily overdue snapshot, reminder planning)                               | ⬜     | Overdue status is computed at query time today       |

## 7. Students and guardians

| Item                                                                                            | Status | Notes                                                  |
| ----------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| Student list: search (Turkish-insensitive), filters, sort, pagination, URL state, column picker | ✅     |                                                        |
| Create student with enrollment (year, grade, class) and up to four guardians                    | ✅     | New or existing guardian, primary contact, payer flag  |
| Student profile: overview, personal data, guardians, finance, history tabs (permission-aware)   | ✅     |                                                        |
| Edit and archive student                                                                        | ✅     |                                                        |
| National ID: validated, encrypted at rest, blind-indexed for uniqueness, masked, audited reveal | ✅     | [ADR-0013](decisions/0013-field-level-encryption.md)   |
| Guardian directory with search                                                                  | ✅     |                                                        |
| Edit guardian, link an existing guardian to another student, remove a link                      | ⬜     | Today guardians are linked when the student is created |
| Student import (CSV/Excel) and export                                                           | ⬜     |                                                        |
| Documents and photos (object storage)                                                           | ⬜     | MinIO is provisioned locally; no storage code yet      |

## 8. Academic structure, personnel, attendance

| Item                                                                                         | Status | Notes                              |
| -------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| Data model: academic years, grade levels, classes, enrollments, rosters, teacher assignments | ✅     | Seeded for the demo tenants        |
| Read-only class list with homeroom teacher and student counts                                | ✅     |                                    |
| Management UI for years, grades, classes, rosters and assignments                            | ⬜     | Phase 4                            |
| Personnel records linked to memberships                                                      | 🟡     | Table and links exist; no screens  |
| Attendance (daily and per lesson), absence follow-up                                         | ⬜     | Phase 4; teacher dashboard says so |

## 9. Finance and collections

| Item                                                                                                                                                         | Status | Notes                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------- |
| Money as integer minor units with currency; exact parsing and formatting in the browser                                                                      | ✅     | [ADR-0008](decisions/0008-money-integer-minor-units.md)       |
| Financial account per student; balance, overdue and credit                                                                                                   | ✅     |                                                               |
| Tuition agreement wizard with server-side preview                                                                                                            | ✅     | [FINANCE_MODEL](architecture/FINANCE_MODEL.md)                |
| Discounts and scholarships (percentage or fixed, applied in sequence)                                                                                        | ✅     |                                                               |
| Payment plans: down payment, 1–36 monthly installments, month-end clamping, rounding unit and remainder placement                                            | ✅     |                                                               |
| Unified receivables (installments and one-off charges); cancel open items                                                                                    | ✅     | [ADR-0009](decisions/0009-unified-receivables.md)             |
| Record payment: methods, payer, FIFO or manual allocation, overpayment as credit, idempotency key                                                            | ✅     | Concurrent duplicates record once                             |
| Immutable payments; reversal with reason (allocations reversed, history kept)                                                                                | ✅     |                                                               |
| Receipt numbers per organization and year (`TAH-2026-000001`); printable receipt page                                                                        | ✅     | PDF receipts: ⬜                                              |
| Database invariants (allocations never exceed payment or receivable amounts)                                                                                 | ✅     | Enforced by triggers, tested with direct SQL                  |
| Collections dashboard: due today, overdue, collected this month, collection rate, aging, due vs. collected over eight months, upcoming, top overdue accounts | ✅     |                                                               |
| Receivables and overdue work lists; payments list with filters                                                                                               | ✅     |                                                               |
| Payment links with the mock provider; signed webhooks, stored once per provider event                                                                        | ✅     | Local mock checkout page                                      |
| Real payment providers (iyzico, PayTR, Stripe)                                                                                                               | ⬜     | Adapter interface in place                                    |
| Refunds to the payer                                                                                                                                         | ⬜     | Reversal covers recording mistakes only                       |
| Reminders for upcoming and overdue installments                                                                                                              | ⬜     | Needs notification channels and scheduled jobs                |
| Agreement amendments (restructuring a plan), early-payment discounts, late fees                                                                              | ⬜     |                                                               |
| Accounting exports, e-Arşiv/e-Fatura integration                                                                                                             | ⬜     |                                                               |
| Multiple currencies within one organization in the UI                                                                                                        | 🟡     | Amounts carry a currency; screens assume one per organization |

## 10. Dashboards, search and reports

| Item                                                                      | Status | Notes                                                                  |
| ------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Role-aware dashboard (sections only for permitted data, computed live)    | ✅     | Owner, principal, branch manager, accountant, teacher, student affairs |
| Command palette (⌘/Ctrl+K): pages, actions, recent records, server search | ✅     | Students, guardians, classes, receipts; scope-aware                    |
| Collections reports: aging, monthly due vs. collected, overdue accounts   | ✅     |                                                                        |
| Exports (CSV/Excel/PDF) and scheduled reports                             | ⬜     |                                                                        |
| Operational reports (enrollment, attendance, admissions funnel)           | ⬜     | Depend on phases 2 and 4                                               |
| Analytics platform (CDC, lakehouse, warehouse)                            | ⬜     | [DATA_PLATFORM](architecture/DATA_PLATFORM.md)                         |

## 11. Notifications

| Item                                                                      | Status | Notes                                    |
| ------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| Transactional e-mail (invitations, password reset) in Turkish and English | ✅     | Drivers: console, SMTP (Mailpit), memory |
| Notification channel abstraction (e-mail, SMS, WhatsApp, in-app)          | ⬜     |                                          |
| Reminder rules and delivery log                                           | ⬜     |                                          |

## 12. Admissions CRM

| Item                                                                    | Status | Notes                                                   |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| Leads, sources, pipeline, follow-ups, conversion to student + agreement | ⬜     | Phase 2; the permission catalog and role template exist |

## 13. Web experience

| Item                                                                                    | Status | Notes                                     |
| --------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| Design tokens and component library (`@repo/ui`)                                        | ✅     | [DESIGN_SYSTEM](product/DESIGN_SYSTEM.md) |
| App shell: collapsible sidebar, organization switcher, user menu, mobile navigation     | ✅     |                                           |
| Loading, empty, error (with request id), no-access and not-found states on every screen | ✅     |                                           |
| Turkish default, English available; catalog parity enforced by tests                    | ✅     |                                           |
| Server-rendered session gate, full reload on organization switch and sign-out           | ✅     |                                           |
| Strict CSP with nonces, security headers                                                | ✅     |                                           |
| Automated accessibility checks (axe) and a screen-reader review                         | ⬜     |                                           |
| Unsaved-changes guard on dirty forms                                                    | ⬜     |                                           |
| Dark theme, per-tenant branding                                                         | ⬜     |                                           |
| Guardian/student portal, mobile apps                                                    | ⬜     | Additional clients of the same API        |

## 14. Security and privacy (KVKK)

| Item                                                                            | Status | Notes                                             |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| Threat model and controls documented                                            | ✅     | [SECURITY](architecture/SECURITY.md)              |
| Data minimization in events, logs (redaction) and audit entries                 | ✅     |                                                   |
| Encrypted national IDs with blind index; keys from the environment              | ✅     |                                                   |
| Problem+json errors without stack traces; stable error codes                    | ✅     |                                                   |
| Key management service (KMS) and key rotation procedure                         | ⬜     |                                                   |
| Data subject requests (access, rectification, erasure/anonymization) tooling    | ⬜     |                                                   |
| Retention schedule, privacy notice texts, VERBİS and data processing agreements | ⬜     | Requires legal review — compliance is not claimed |
| External penetration test                                                       | ⬜     | Before production pilots                          |

## 15. Observability and operations

| Item                                                                    | Status | Notes                                          |
| ----------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| Structured JSON logs with request ids and PII redaction                 | ✅     | [OBSERVABILITY](architecture/OBSERVABILITY.md) |
| Liveness and readiness endpoints                                        | ✅     |                                                |
| Request id shown to users in error states                               | ✅     |                                                |
| OpenTelemetry metrics and traces, dashboards, alerting                  | ⬜     |                                                |
| Error tracking (Sentry/GlitchTip)                                       | ⬜     |                                                |
| Container images, infrastructure as code, backups and disaster recovery | ⬜     | `infra/terraform` documents the plan           |

## 16. Testing

| Item                                                                               | Status | Notes                                |
| ---------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| Unit tests for authorization logic, contracts, finance domain, crypto, money/dates | ✅     | [TESTING](development/TESTING.md)    |
| Database-level RLS and isolation tests, API authorization matrix                   | ✅     |                                      |
| Finance integration tests (idempotency, reversal, invariants, webhooks)            | ✅     |                                      |
| Web component and catalog tests                                                    | ✅     |                                      |
| Playwright end-to-end: auth, role-based UI, the collections vertical slice         | ✅     | Runs in CI against production builds |
| Load and performance tests                                                         | ⬜     |                                      |

## 17. Suggested next steps

1. Multi-factor authentication and single-session revocation.
2. Notification channels with reminder rules for upcoming and overdue installments (outbox
   consumers + scheduled jobs).
3. Guardian management (edit, link, unlink) and student import.
4. Real payment provider adapter (first: iyzico or PayTR) and PDF receipts.
5. Admissions CRM (phase 2).
6. Container images, Terraform, OpenTelemetry, error tracking; then a production pilot after a
   legal review and a penetration test.
7. Academic structure management and attendance (phase 4).
