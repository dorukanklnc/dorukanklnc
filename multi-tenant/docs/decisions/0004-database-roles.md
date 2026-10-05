# ADR-0004: Three database roles instead of BYPASSRLS

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Some code paths legitimately need cross-tenant access: background workers, platform provisioning,
login (finding a user's memberships), invitation acceptance and password reset (token lookups
before a tenant is known), session validation. Superusers and `BYPASSRLS` roles skip RLS entirely
and are not available on every managed PostgreSQL service.

## Decision

- `app_owner` owns the schema and runs migrations; tables use `FORCE ROW LEVEL SECURITY` and
  `app_owner` has no policies, so accidental runtime use sees nothing.
- `app_runtime` handles requests; it only gets tenant policies.
- `app_system` gets explicit permissive policies (`TO app_system USING (true)`) and is used through
  a dedicated `SystemDatabase` provider injected only into a short list of services.
- The API refuses to start if a runtime role is a superuser, has `BYPASSRLS`, or owns tables.
- Column/table privileges narrow both roles further (no password hashes for `app_runtime`,
  insert-only outbox, append-only audit log, no deletes of financial records).

## Consequences

- Works on any PostgreSQL ≥ 13 including managed offerings.
- Privileged access is explicit and reviewable (`grep SystemDatabase`).
- Two connection pools in the API process (the system pool is small).

## Alternatives considered

- `BYPASSRLS` role for workers — not portable; invisible privilege.
- A session flag that relaxes policies — any SQL injection could set it.
