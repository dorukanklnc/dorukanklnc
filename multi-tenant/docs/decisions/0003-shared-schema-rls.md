# ADR-0003: Shared database, shared schema, PostgreSQL row-level security

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Many small and medium tenants, a single team, and a hard requirement that one tenant's data is
never visible to another. We also need cross-tenant platform operations (provisioning, billing,
support) and cheap onboarding.

## Decision

- One PostgreSQL database and one schema for all tenants; tenant-owned rows carry
  `organization_id`.
- **RLS enabled and forced** on every tenant-owned table, with policies based on transaction-local
  session variables (`app.org_id`, `app.user_id`, `app.branch_ids`) set by the API for every
  tenant-scoped transaction.
- A **coarse branch boundary** in RLS for branch-owned tables, on top of application-level scopes.
- **Composite foreign keys** `(organization_id, id)` to make cross-tenant references impossible.
- An automated **coverage test** asserting every table with `organization_id` has forced RLS.

## Consequences

- Isolation does not depend on every query being written correctly.
- Every tenant data access must go through a transaction that sets the context (encapsulated in
  `TenantDatabase`); forgetting it returns zero rows rather than leaking data.
- Policies add a small per-query cost; indexes start with `organization_id`.
- Per-tenant backup/restore requires filtered exports (documented operational procedure).

## Alternatives considered

- **Schema per tenant** — migrations multiply with tenants, connection/search_path handling is
  error-prone, and cross-tenant platform queries become painful.
- **Database per tenant** — strongest isolation but expensive to operate at our scale; kept as a
  future option for enterprise/data-residency tenants via a routing table.
- **Application filtering only** — one missed `WHERE` is a breach.
