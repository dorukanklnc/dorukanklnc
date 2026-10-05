# ADR-0007: RBAC with scoped permissions

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Schools need fine-grained access: teachers see assigned students only, accountants see finance in
some branches, principals see aggregates, headquarters see everything. Simple admin/user roles are
insufficient; full ABAC policy engines are hard to explain to school administrators.

## Decision

- Permissions are `resource.action` keys defined in code (`@repo/authorization`) and synced to the
  database. Each grant has a **scope**: `own`, `assigned`, `branch`, `organization`.
- Roles are organization-specific sets of grants; built-in roles are copied from templates and are
  read-only; tenants clone them to customize.
- Effective permissions = union of role grants, broadest scope per permission.
- Enforcement: route guard (permission), query predicates (scope), record checks (scope),
  serializers (field masking), RLS (tenant + branch boundary), UI composition (hide, not disable).
- Anti-escalation: members can only grant what they hold.

## Consequences

- Product decisions (e.g. "teachers never see finance") are testable code.
- Adding a permission requires catalog entry, i18n label and tests.
- Per-branch role assignment and attribute conditions are future extensions.

## Alternatives considered

- **External policy engine (OPA/Cedar/OpenFGA)** — powerful, but adds infrastructure and a policy
  language; our scope model covers MVP needs and can be compiled to such an engine later.
