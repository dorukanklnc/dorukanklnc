# Security

> Status: living document. It describes the controls that are **implemented** in this repository
> and marks planned ones explicitly. It is an engineering document, not a compliance statement:
> legal conformity (KVKK, GDPR, PCI DSS, MEB rules) requires legal review and organizational
> measures beyond code — see §14.

Related: [MULTITENANCY](MULTITENANCY.md), [AUTHORIZATION](AUTHORIZATION.md),
[FINANCE_MODEL](FINANCE_MODEL.md), [OBSERVABILITY](OBSERVABILITY.md), ADRs 0003–0006, 0011, 0013.

## 1. Principles

1. **Isolation by construction.** A forgotten filter must not leak data: PostgreSQL row-level
   security (RLS) and tenant-scoped foreign keys back every application check.
2. **The server decides.** Identity, tenant, branch access and permissions are resolved on the
   server from the session. Nothing the client sends (organization id, branch id, role) is trusted.
3. **Least privilege everywhere.** Three database roles, scoped permissions, no superuser at
   runtime, the UI shows only what the member may use.
4. **Fail closed.** No tenant context means zero rows; unknown permissions are dropped; unknown
   error codes degrade to generic messages.
5. **Privacy by design.** Collect the minimum, encrypt the sensitive, log identifiers rather than
   content, audit access to personal data.

## 2. Threat model (summary)

| Actor / scenario                                      | Primary controls                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Anonymous attacker (credential stuffing, enumeration) | Rate limits, account lockout, enumeration-safe responses, argon2id                                                            |
| Member of tenant A probing tenant B (ID guessing)     | RLS, composite FKs, 404 for out-of-scope records, isolation tests                                                             |
| Lower-privileged member (teacher → finance)           | Scoped permissions on every route and query, hidden navigation, tests                                                         |
| Member escalating their own or others' access         | Anti-escalation on roles and assignments, last-owner and self-action rules                                                    |
| Cross-site attacks (XSS, CSRF, clickjacking)          | Nonce-based CSP, synchronizer CSRF token, `frame-ancestors 'none'`, SameSite                                                  |
| Forged or replayed payment notifications              | HMAC signature with timestamp tolerance, idempotent inbox, amount check                                                       |
| Compromised session                                   | Opaque server-side sessions, idle/absolute timeouts, logout everywhere, revocation on reset/suspension                        |
| Data exposure through logs or events                  | Log redaction, no request bodies, PII-free event payloads                                                                     |
| Platform staff overreach                              | Platform permissions are separate from tenant roles; no tenant data without a support session (planned, see AUTHORIZATION §8) |

## 3. Tenant isolation

Details in [MULTITENANCY](MULTITENANCY.md). In short:

- Shared schema with `organization_id` on every tenant-owned table; RLS **enabled and forced**.
- Tenant context (`app.org_id`, `app.user_id`, `app.branch_ids`) is set transaction-locally with
  `set_config(..., true)`; it cannot leak between pooled connections.
- Composite foreign keys `(organization_id, id)` (finance: `(organization_id, branch_id, id)`) make
  cross-tenant references impossible even for buggy code.
- Roles: `app_owner` (migrations; sees nothing at runtime because of `FORCE`), `app_runtime`
  (requests; tenant policies), `app_system` (pre-authentication and platform operations; explicit
  policies). The API **refuses to start** if a runtime role is a superuser, has `BYPASSRLS` or owns
  tables.
- Records outside the caller's tenant or scope return **404**, not 403, so IDs cannot be probed.
- Verified by database-level tests, an RLS coverage test over every tenant table and API isolation
  tests (see [TESTING](../development/TESTING.md)).

## 4. Authentication and sessions

| Control            | Implementation                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing   | argon2id, 19 MiB memory, 2 iterations, parallelism 1 (OWASP baseline)                                                                                                 |
| Password policy    | 10–128 characters; rejects common passwords, passwords containing the e-mail local part and low-variety strings. Breached-password screening (k-anonymity) is planned |
| Enumeration safety | Same status, code and message for unknown accounts and wrong passwords; a dummy hash equalizes timing; password reset always answers `202`                            |
| Lockout            | 10 consecutive failures lock the account for 15 minutes                                                                                                               |
| Sessions           | Opaque random tokens; only SHA-256 hashes are stored; idle timeout 12 h, absolute 7 days (configurable)                                                               |
| Revocation         | Logout, logout everywhere, password reset and member suspension revoke sessions immediately                                                                           |
| Cookies            | Session cookie `HttpOnly`, `SameSite=Lax`, `Path=/`; in production `Secure` with the `__Host-` prefix (host-only, no `Domain`)                                        |
| CSRF               | Synchronizer token: a readable CSRF cookie echoed in `x-csrf-token`; the API compares its hash with the session on every unsafe method                                |
| Password reset     | Single-use token, 30 minutes, hashed at rest; removed from the address bar on arrival                                                                                 |
| Invitations        | Single-use token, 7 days, hashed at rest; existing accounts must still sign in                                                                                        |
| Multi-factor auth  | **Planned** (TOTP for owners, accountants and platform staff)                                                                                                         |

## 5. Authorization

Details in [AUTHORIZATION](AUTHORIZATION.md).

- Permissions are `resource.action` with a scope (`own`, `assigned`, `branch`, `organization`),
  granted through roles; the catalog lives in `@repo/authorization` and is shared by API and web.
- A global guard resolves session → CSRF → membership → route requirements on every request;
  services add scope predicates to every query (e.g. a teacher's students via class assignments).
- Disabled modules remove their permissions entirely.
- Anti-escalation: nobody can grant a permission or scope they do not hold, through roles or member
  assignments; the last owner cannot be removed; members cannot change their own access.
- The web app hides what is not permitted (navigation, actions, columns, tabs) and renders a "no
  access" state for direct URLs, but **the API is the only enforcement point**.

## 6. Web application

| Control                 | Implementation                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content Security Policy | Per-request nonce with `'strict-dynamic'` for scripts; `default-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` behind TLS. `style-src 'unsafe-inline'` is required by component positioning (style attributes); script injection stays blocked |
| Security headers        | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment off), HSTS with preload in production; `X-Powered-By` removed                                                                                                           |
| Same-origin API         | The browser calls `/api/*` on the web origin (proxied), so no CORS is configured anywhere                                                                                                                                                                                                                                                              |
| Open redirects          | `?next=` accepts only relative in-app paths (never `//host`, schemes or the login page)                                                                                                                                                                                                                                                                |
| Token storage           | No tokens in `localStorage`; the session cookie is unreachable from scripts                                                                                                                                                                                                                                                                            |
| Auth boundaries         | Sign-in, sign-out, organization switch and session expiry use full page navigations, discarding all cached data of the previous session or tenant                                                                                                                                                                                                      |
| Client storage          | Recently opened records live in `sessionStorage`, keyed by user and organization, cleared on sign-out; table column preferences contain no personal data                                                                                                                                                                                               |
| Rendering               | React escaping only; no `dangerouslySetInnerHTML`; server components fetch the session with only the session cookie forwarded                                                                                                                                                                                                                          |

## 7. API hardening

- `helmet` defaults (CSP for JSON responses, `nosniff`, frameguard, `Cross-Origin-Resource-Policy:
same-origin`); request bodies limited to 1 MB; raw bodies kept only for webhook signatures.
- Every input is validated with Zod schemas shared with the web (`@repo/contracts`); unknown fields
  are stripped, IDs must be UUIDs.
- Errors are RFC 9457 problem documents with stable codes and a request id — never stack traces or
  SQL. PostgreSQL constraint violations map to domain error codes.
- Swagger/OpenAPI is disabled in production by default.
- Identifiers are UUIDv7. They are not secret: authorization never relies on unguessable IDs.

## 8. Data protection

- **National ID numbers** (T.C. kimlik no) are encrypted with AES-256-GCM (versioned `v1:` format
  for key rotation), searchable through an HMAC-SHA-256 blind index, and displayed masked
  (`•••••••1234`). Revealing the full value is an explicit action gated by
  `students.sensitive.read` and recorded in the audit log (ADR-0013).
- Keys come from the environment today; the API refuses development keys in production. A KMS
  (envelope encryption, rotation runbook) is planned before production use.
- In transit: TLS at the load balancer and to managed PostgreSQL/Redis (deployment
  responsibility). At rest: managed-service disk encryption and encrypted backups (deployment).
- Event payloads (outbox) carry identifiers, amounts and dates, not names or contact details.
- Fixtures and demo data are fictional; real personal data must never be loaded outside production.

## 9. Audit trail

- Append-only `audit_logs`: `app_runtime` may only insert; there are no update/delete grants or
  policies. Entries record actor (user, system, support, webhook), action, resource, branch, field
  changes, request id and time.
- Recorded: sign-ins and failures, lockouts, logout(s), organization switches, password changes and
  resets, member and role changes, student changes and national-ID reveals, agreements, charges,
  payments, reversals, payment links, branch and organization changes.
- Never recorded: passwords, password hashes, tokens, full national IDs, card data.
- Retention: planned per-tenant policy (default proposal: 10 years for financial records, 2 years for
  authentication events) — requires legal confirmation.

## 10. Logging and personal data

- Structured JSON logs (pino) with request id, user id and organization id for correlation.
- Redacted paths: passwords, hashes, tokens, national IDs, `authorization`/`cookie` headers, the CSRF
  header and `set-cookie`. Request bodies are never logged.
- Logs are an operational tool with short retention (proposal: 30 days hot, 90 days archive);
  they are not a substitute for the audit trail.

## 11. Payments

- **No card data touches CampusOS.** Online payments use hosted checkout pages of the provider
  (iyzico, PayTR, Stripe… through adapters; a mock provider locally). Target scope: PCI DSS SAQ A
  — to be confirmed with the chosen provider.
- Webhooks: HMAC-SHA-256 signature over `timestamp.body` with constant-time comparison and a
  5-minute timestamp tolerance; an inbox table with a unique `(provider, provider_event_id)` makes
  processing idempotent; the paid amount must equal the payment intent.
- Manual payment recording requires an `Idempotency-Key`; replays return the original payment,
  reuse with different data is rejected (409). Payments are immutable; corrections are reversals.

## 12. Rate limiting and proxies

| Endpoint                               | Limit (per client address) |
| -------------------------------------- | -------------------------- |
| `POST /auth/login`                     | 10 / minute                |
| `POST /auth/password/forgot`           | 5 / minute                 |
| `POST /auth/password/reset`            | 10 / minute                |
| `GET /auth/invitations/:token`         | 20 / minute                |
| `POST /auth/invitations/:token/accept` | 10 / minute                |
| Everything else                        | 300 / minute               |

- Counters are in memory (single instance) or Redis (`RATE_LIMIT_STORE=redis`, required with more
  than one API instance). Account lockout (§4) protects individual accounts independently.
- **Client address and proxies:** `TRUST_PROXY=true` trusts exactly one hop. The Next.js rewrite
  proxy forwards `X-Forwarded-For` without appending to it, so the trusted hop count must match the
  real chain. Recommended production topology: the load balancer routes `/api/*` straight to the
  API (one trusted hop) and overwrites client-supplied forwarding headers. Misconfiguration lets
  clients spoof their address and weakens per-address limits.

## 13. Secrets, dependencies and the supply chain

- `.env` files are never committed (`.gitignore`); `.env.example` holds development values only.
  CI uses throwaway credentials for its ephemeral database. Production secrets belong in a secret
  manager (planned with the IaC in `infra/terraform`).
- Exact dependency versions, a frozen lockfile in CI, and an allowlist of packages permitted to
  run install scripts (`onlyBuiltDependencies`).
- Planned: automated dependency updates (Renovate), dependency and container scanning, SAST in CI,
  a penetration test before the first production tenant.

## 14. KVKK / GDPR: technical measures and open legal questions

The platform processes personal data of students (often minors), guardians and staff on behalf of
schools. Under KVKK the school is typically the data controller and the platform operator a data
processor. Technical measures implemented:

| Principle                         | Measure                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Data minimization                 | Only fields needed for operations; national ID optional; events and logs without content                         |
| Purpose limitation / need-to-know | Role- and scope-based access (teachers see no finance, accounting sees no guidance data)                         |
| Confidentiality                   | Encryption of national IDs, TLS, RLS, hashed credentials and tokens                                              |
| Accountability                    | Append-only audit trail including reveals of sensitive fields                                                    |
| Integrity                         | Database constraints and triggers for financial data; immutable payments                                         |
| Storage limitation                | Archive instead of hard delete for operational records; retention jobs **planned**                               |
| Data subject rights               | Export and erasure/anonymization workflows **planned** (financial records may need to be retained under tax law) |

**Requires legal review before production** (not decided in code):

- Controller/processor roles, the data processing agreement and sub-processor list.
- Privacy notices (aydınlatma metni) and consent where required (e.g. communication channels,
  photos); parental consent for minors.
- Data residency and cross-border transfers (hosting region, e-mail/SMS/WhatsApp providers).
- Retention periods per record type (education records, financial records under tax law,
  authentication logs).
- VERBİS registration obligations of the schools; breach notification procedures (72 hours).
- Whether national ID numbers are needed at all for each tenant's use cases.
- PCI DSS scope confirmation with the payment provider; e-invoice/e-archive obligations.
