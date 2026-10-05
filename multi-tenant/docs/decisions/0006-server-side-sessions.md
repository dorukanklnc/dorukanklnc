# ADR-0006: Server-side sessions with opaque tokens

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Requirements: session revocation, logout everywhere, account disable with immediate effect, tenant
selection, rate limiting, no account enumeration, and a path to SSO/MFA.

## Decision

- Login with e-mail/password; passwords hashed with **argon2id** (OWASP parameters).
- On login the API creates a `sessions` row and returns an **opaque random token** (256 bits) in an
  `HttpOnly`, `SameSite=Lax`, `Secure` (production, `__Host-` prefix) cookie. Only the SHA-256 hash
  is stored.
- Sliding idle timeout (default 12 h) and absolute lifetime (default 7 days); every request
  validates the session against the database, so revocation is immediate (no refresh tokens
  needed).
- The active organization/membership is stored on the session and changed through an explicit
  endpoint that verifies membership.
- **CSRF**: synchronizer token issued at login, stored hashed on the session, delivered in a
  readable cookie and required in the `x-csrf-token` header for unsafe methods.
- Logout revokes the session; "logout everywhere", password change/reset and account disable
  revoke all sessions of the user.
- Login/reset/invitation endpoints are rate limited per IP and per account identifier and return
  identical responses for unknown accounts (constant-time comparison with a dummy hash).

## Consequences

- A database lookup per request (indexed by token hash; cacheable later).
- Same-origin deployment (ADR-0011) keeps cookies first-party.
- SSO/MFA plug in at session creation (`auth_method`, `mfa_verified_at` reserved on sessions).

## Alternatives considered

- **JWT access + refresh tokens** — revocation needs a denylist anyway; tokens in JS-accessible
  storage are an XSS risk; more moving parts for no benefit in a first-party web app.
