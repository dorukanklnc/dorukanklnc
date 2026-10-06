# Multitenancy

> Decision records: [ADR-0003 shared schema + RLS](../decisions/0003-shared-schema-rls.md),
> [ADR-0004 database roles](../decisions/0004-database-roles.md).

## 1. Model

One application instance and one PostgreSQL database serve every tenant. A **tenant is an
organization** (a school, a college, an academy or an education group). Tenant-owned rows carry an
`organization_id` column.

```
Platform
└── Organization (tenant)            organizations
    ├── Branch / campus              branches
    ├── Members (users in this org)  memberships ── users (global identity)
    ├── Roles & permissions          roles, role_permissions, membership_roles
    └── Domain data                  students, guardians, payments, …  (organization_id, branch_id)
```

- **Users are global identities.** One person (e-mail) can belong to several organizations, each
  through a separate **membership** with its own roles, branch access and status.
- **Branches belong to one organization.** Most operational data belongs to a branch
  (`branch_id`); some data is organization-level (guardians, roles, settings).
- **The active organization is part of the server-side session.** It is chosen at login (or via
  the organization switcher) and verified against an active membership. Requests never carry an
  organization id that the server would trust.

## 2. Defense in depth

Isolation is enforced in four independent layers. Any one of them prevents cross-tenant reads.

| Layer                        | Mechanism                                                        | Protects against                                           |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Context resolution        | Tenant derived from the session's active membership              | Client tampering with `organization_id`                    |
| 2. Application authorization | Permission + scope checks, scope predicates in every query       | Unauthorized access _within_ a tenant (branch, assignment) |
| 3. Row-level security        | `FORCE ROW LEVEL SECURITY` + policies on every tenant table      | Forgotten filters, IDOR, raw SQL mistakes                  |
| 4. Relational integrity      | Composite FKs `(organization_id, x_id) → x(organization_id, id)` | A row in tenant A referencing a row of tenant B            |

## 3. Database roles

| Role          | Used by                                                                                                                       | RLS behaviour                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app_owner`   | Migrations only. Owns all objects.                                                                                            | Tables use `FORCE ROW LEVEL SECURITY`; `app_owner` has no policies, so even accidental use at runtime sees **no rows** (fail closed). |
| `app_runtime` | API request handling.                                                                                                         | Tenant policies: `organization_id = app.current_org_id()` and, for branch-owned tables, the branch boundary.                          |
| `app_system`  | Worker, platform administration, pre-authentication flows (login, invitation acceptance, password reset), session validation. | Explicit permissive policies (`TO app_system USING (true)`).                                                                          |

- Neither runtime role is a superuser or has `BYPASSRLS`; the API verifies this at startup and
  refuses to boot otherwise. The check also rejects a runtime role that owns tables.
- Using role-specific policies instead of `BYPASSRLS` works on every managed PostgreSQL offering
  and keeps the privileged surface explicit and greppable (`SystemDatabase` is injected only into
  a short list of services).
- Sensitive columns are protected with column privileges: `app_runtime` cannot read
  `users.password_hash`, cannot read or modify sessions, and can only `INSERT` into
  `outbox_events`. Audit logs are append-only for every role (no `UPDATE`/`DELETE` grants plus a
  blocking trigger). Payments and allocations cannot be deleted by any runtime role.

## 4. Session variables and policies

Every tenant-scoped transaction begins with:

```sql
SELECT set_config('app.org_id',     $1, true),   -- active organization
       set_config('app.user_id',    $2, true),   -- authenticated user
       set_config('app.branch_ids', $3, true);   -- '*' or comma-separated branch uuids
```

`true` makes the settings transaction-local, so a pooled connection never carries tenant context
into another request. Helper functions (schema `app`) read them:

```sql
app.current_org_id()  → uuid  (NULL when unset)
app.current_user_id() → uuid
app.branch_allowed(branch_id uuid) → boolean   -- '*' → true; NULL branch → true (org-level rows)
```

Policy templates applied by the security migration:

```sql
-- organization-owned tables
CREATE POLICY tenant_isolation ON <table> TO app_runtime
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());

-- branch-owned tables (students, payments, receivables, …)
CREATE POLICY tenant_isolation ON <table> TO app_runtime
  USING (organization_id = app.current_org_id() AND app.branch_allowed(branch_id))
  WITH CHECK (organization_id = app.current_org_id() AND app.branch_allowed(branch_id));

-- privileged role
CREATE POLICY system_access ON <table> TO app_system USING (true) WITH CHECK (true);
```

When no tenant context is set, `app.current_org_id()` is `NULL`, the comparison is never true and
the query returns nothing — **fail closed**.

Special cases:

- `organizations`: visible when `id = app.current_org_id()` or the user has a membership in it
  (needed for the organization switcher); updatable only for the active organization.
- `memberships`: visible for the active organization _or_ for the current user's own memberships.
- `users` (global): visible when it is the current user or a member of the active organization;
  `password_hash` is never readable by `app_runtime` (column privileges).
- `sessions`, `password_reset_tokens`: no `app_runtime` access at all.
- `outbox_events`: `app_runtime` may only insert rows for the active organization.

## 5. Branch boundary in RLS

Fine-grained scopes (`assigned`, `own`, per-permission branch lists) are enforced by the
application. RLS adds a **coarse outer boundary** for branch-owned tables:

- `'*'` when the membership has all-branch access **or** holds any permission at organization scope;
- otherwise the membership's assigned branch ids.

So a branch-restricted accountant cannot read another branch's payments even if a query forgets
its branch predicate. Organization-level tables (e.g. guardians) are bounded by tenant only and
are filtered by the application through their links to branch-owned records.

## 6. Composite foreign keys

Every tenant-owned table declares `UNIQUE (organization_id, id)`. Child tables reference parents
through `(organization_id, parent_id)`:

```sql
FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id)
```

This makes "allocation of tenant A's payment to tenant B's installment" unrepresentable, regardless
of application bugs.

## 7. Operating rules

**Adding a tenant-owned table (checklist)**

1. `organization_id uuid NOT NULL` + `UNIQUE (organization_id, id)`; `branch_id` if the data is
   branch-owned.
2. Composite FKs for every reference to another tenant-owned table.
3. Indexes start with `organization_id` (most queries filter by it).
4. Register the table in the RLS migration (organization or branch template).
5. Grant the minimal privileges to `app_runtime` / `app_system`.
6. The **RLS coverage test** fails if any table with an `organization_id` column lacks forced RLS.
7. Add isolation tests for any non-trivial access path.

**Background jobs** run as `app_system` and must pass an explicit organization id to every
query; jobs that act on behalf of a tenant open a tenant transaction (`app_runtime` semantics are
emulated by setting the same session variables) whenever they execute tenant business logic.

**Support access** by platform staff is never implicit: a time-boxed support session with a
reason is required, it is visible to the tenant, and every action is audited with the support
session id ([AUTHORIZATION §8](AUTHORIZATION.md#8-platform-staff-and-support-access)).

## 8. Future: chains, franchises, white-label

The model already supports multi-branch organizations with branch-scoped permissions. Planned
extensions, none of which require a rewrite:

- **Organization groups** (`organization_groups`, `organizations.group_id`): headquarters-level
  reporting across several organizations that remain isolated tenants. Group users get
  memberships in each organization or a group-level read model fed by the outbox.
- **White-label**: `organizations.slug` already exists for subdomain routing
  (`atlas.example.com`); branding settings live in `organizations.settings`; design tokens are
  CSS variables that can be overridden per tenant.
- **Dedicated databases for enterprise tenants or data residency**: a tenant routing table maps
  an organization to a connection; the schema and RLS stay identical.
- **Other verticals** (clinic or hotel chains) reuse TenantCore (organizations, branches,
  memberships, roles, audit, outbox, files, notifications) with a different domain layer.

## 9. Tests that prove isolation

Located in `apps/api/test/security`:

- Tenant A cannot list, read, update or guess the UUID of tenant B's students and payments
  (API and raw `app_runtime` SQL).
- Inserting a row for another organization fails the RLS `WITH CHECK`.
- A branch-scoped member cannot read another branch's records (API and RLS boundary).
- Without tenant context the runtime role sees zero rows.
- Every table with `organization_id` has RLS enabled and forced (catalog query).
- Composite FKs reject cross-tenant references.
