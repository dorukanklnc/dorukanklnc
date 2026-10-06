# Authorization

> Decision record: [ADR-0007 RBAC with scopes](../decisions/0007-rbac-with-scopes.md).
> Source of truth for the catalog: [`packages/authorization`](../../packages/authorization/src).

## 1. Principles

- **Deny by default.** No permission, no access. Unknown permission keys or invalid scopes are
  dropped when a permission set is built (fail closed).
- **Server-side only.** The API resolves the tenant, the member, their roles and their branch
  access from the session. Anything the client sends about identity, tenant, branch access or
  permissions is ignored.
- **Least privilege, explicitly modelled.** Permissions are granular (`resource.action`) and every
  grant carries a scope. Built-in roles encode product decisions such as "teachers never see
  finance" and those decisions are unit-tested.
- **Same rules everywhere.** HTTP endpoints, search, exports, dashboards, background jobs acting on
  behalf of a member and future AI assistants all go through the same permission set and scope
  predicates.

## 2. Model

```
permission = RESOURCE.ACTION      e.g. finance.payments.create
grant      = permission @ SCOPE    e.g. finance.payments.create @ branch
role       = named set of grants   (organization-specific)
membership = user × organization   (+ roles, + branch access, + status)
```

The model is RBAC with ABAC-like conditions: the scope is a condition evaluated against attributes
of the record (its branch, its owner, whether it is reachable through an assignment).

### Scopes

| Scope          | Meaning                                                                                              | Typical use                                   |
| -------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `own`          | Records the member owns (e.g. leads assigned to them)                                                | Admissions officers                           |
| `assigned`     | Records reachable through an assignment: teacher → class → students (and their guardians)            | Teachers                                      |
| `branch`       | Records of the member's branches (`membership_branches`, or all branches when `all_branches = true`) | Accountants, branch managers, student affairs |
| `organization` | Every record of the organization                                                                     | Owners, principals, headquarters              |

"Selected branches" is the `branch` scope combined with a membership that has several branches.
`platform` is not a tenant scope — platform permissions are separate (§8).

`own` and `assigned` are different dimensions; a catalog test guarantees no permission supports
both, so "the broadest scope wins" is always well defined when roles are merged.

### Effective permissions

For a membership: union of grants of all its roles; per permission the broadest scope wins;
permissions of modules disabled for the organization are removed. The result is cached in the API
per `(membership_id, authz_version)`; any change to roles, role grants, branch access or
membership status increments `memberships.authz_version` (or the role's members' versions), which
invalidates the cache immediately.

## 3. Permission catalog

| Permission                     | Module         | Allowed scopes                 | Sensitivity |
| ------------------------------ | -------------- | ------------------------------ | ----------- |
| `students.read`                | students       | assigned, branch, organization | personal    |
| `students.create`              | students       | branch, organization           | personal    |
| `students.update`              | students       | branch, organization           | personal    |
| `students.archive`             | students       | branch, organization           | personal    |
| `students.sensitive.read`      | students       | branch, organization           | restricted  |
| `students.export`              | students       | branch, organization           | personal    |
| `guardians.read`               | students       | assigned, branch, organization | personal    |
| `guardians.write`              | students       | branch, organization           | personal    |
| `admissions.read`              | admissions     | own, branch, organization      | personal    |
| `admissions.write`             | admissions     | own, branch, organization      | personal    |
| `admissions.convert`           | admissions     | branch, organization           | personal    |
| `academics.read`               | academics      | assigned, branch, organization | standard    |
| `academics.manage`             | academics      | branch, organization           | standard    |
| `attendance.read`              | attendance     | assigned, branch, organization | personal    |
| `attendance.write`             | attendance     | assigned, branch, organization | personal    |
| `personnel.read`               | personnel      | branch, organization           | personal    |
| `personnel.manage`             | personnel      | branch, organization           | personal    |
| `finance.collections.read`     | finance        | branch, organization           | financial   |
| `finance.collections.write`    | finance        | branch, organization           | financial   |
| `finance.payments.read`        | finance        | branch, organization           | financial   |
| `finance.payments.create`      | finance        | branch, organization           | financial   |
| `finance.payments.reverse`     | finance        | branch, organization           | financial   |
| `finance.refunds.create`       | finance        | branch, organization           | financial   |
| `finance.reports.read`         | finance        | branch, organization           | financial   |
| `finance.kpis.read`            | finance        | branch, organization           | financial   |
| `finance.settings.manage`      | finance        | organization                   | financial   |
| `reports.operational.read`     | reports        | branch, organization           | standard    |
| `settings.organization.manage` | administration | organization                   | standard    |
| `settings.branches.manage`     | administration | organization                   | standard    |
| `settings.users.read`          | administration | branch, organization           | personal    |
| `settings.users.manage`        | administration | branch, organization           | personal    |
| `settings.roles.manage`        | administration | organization                   | standard    |
| `settings.integrations.manage` | administration | organization                   | restricted  |
| `audit.read`                   | administration | branch, organization           | personal    |

Sensitivity levels: `standard`, `personal` (personal data), `financial`, `restricted` (sensitive
identifiers, integration secrets). Restricted data is masked unless the specific permission is held
(e.g. national ID numbers show only the last 4 digits without `students.sensitive.read`).

## 4. Built-in roles

Each organization receives read-only copies of these templates. Customization happens by cloning a
built-in role into a custom role (so platform upgrades can evolve built-in roles safely).

| Permission                     | owner | principal | branch_manager | accountant | teacher | student_affairs | admissions_officer |
| ------------------------------ | :---: | :-------: | :------------: | :--------: | :-----: | :-------------: | :----------------: |
| `students.read`                |  org  |    org    |       br       |     br     |   asg   |       br        |         —          |
| `students.create`              |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `students.update`              |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `students.archive`             |  org  |     —     |       —        |     —      |    —    |       br        |         —          |
| `students.sensitive.read`      |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `students.export`              |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `guardians.read`               |  org  |    org    |       br       |     br     |   asg   |       br        |         —          |
| `guardians.write`              |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `admissions.read`              |  org  |    org    |       br       |     —      |    —    |       br        |        own         |
| `admissions.write`             |  org  |     —     |       —        |     —      |    —    |       br        |        own         |
| `admissions.convert`           |  org  |     —     |       —        |     —      |    —    |       br        |         —          |
| `academics.read`               |  org  |    org    |       br       |     —      |   asg   |       br        |         —          |
| `academics.manage`             |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `attendance.read`              |  org  |    org    |       br       |     —      |   asg   |       br        |         —          |
| `attendance.write`             |  org  |     —     |       br       |     —      |   asg   |        —        |         —          |
| `personnel.read`               |  org  |    org    |       br       |     —      |    —    |        —        |         —          |
| `personnel.manage`             |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `finance.collections.read`     |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.collections.write`    |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.payments.read`        |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.payments.create`      |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.payments.reverse`     |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.refunds.create`       |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.reports.read`         |  org  |     —     |       —        |     br     |    —    |        —        |         —          |
| `finance.kpis.read`            |  org  |    org    |       br       |     br     |    —    |        —        |         —          |
| `finance.settings.manage`      |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `reports.operational.read`     |  org  |    org    |       br       |     —      |    —    |       br        |         —          |
| `settings.organization.manage` |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `settings.branches.manage`     |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `settings.users.read`          |  org  |    org    |       br       |     —      |    —    |        —        |         —          |
| `settings.users.manage`        |  org  |     —     |       br       |     —      |    —    |        —        |         —          |
| `settings.roles.manage`        |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `settings.integrations.manage` |  org  |     —     |       —        |     —      |    —    |        —        |         —          |
| `audit.read`                   |  org  |    org    |       br       |     —      |    —    |        —        |         —          |

`org` = organization, `br` = branch, `asg` = assigned. Notable decisions:

- **Teacher**: assigned students and their guardians, class information and attendance only. No
  finance permission of any kind — enforced by a unit test and by API integration tests.
- **Accountant**: student identity (needed for collections) and the whole finance module within
  assigned branches; no academic, attendance, admissions or sensitive-identifier access.
- **Principal**: organization-wide academic and operational view; finance limited to aggregate KPIs.
  An organization can grant individual-account visibility by cloning the role and adding
  `finance.collections.read`.
- **Branch manager**: principal-level access bounded to assigned branches, plus user management for
  those branches.
- **Separation of duties**: payment reversal and refunds are separate permissions so an
  organization can remove them from the accountant role and keep them for a finance manager.

## 5. Enforcement layers

| Layer              | Where                                           | What                                                                               |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Route guard        | `@RequirePermission('finance.payments.create')` | 403 when the permission is missing entirely                                        |
| Scope predicates   | `ScopeFilters` in each module's queries         | `assigned`/`own`/`branch` translated into SQL `WHERE`/`EXISTS` clauses             |
| Record checks      | `isWithinScope()` after loading a single record | 404 when the record exists but is outside the scope                                |
| Field rules        | Serializers                                     | e.g. masked national ID without `students.sensitive.read`                          |
| Row-level security | PostgreSQL                                      | Tenant isolation and coarse branch boundary ([MULTITENANCY](MULTITENANCY.md))      |
| UI composition     | `@repo/authorization` in the web app            | Navigation items, actions and profile tabs are **not rendered** without permission |

**404 vs 403.** A missing permission for a whole feature returns `403 FORBIDDEN`. A record that is
outside the member's scope, or that belongs to another tenant, returns `404 NOT_FOUND` — the API
never confirms that an inaccessible record exists (prevents IDOR enumeration).

### Scope predicates (examples)

```sql
-- students.read @ assigned (teacher)
EXISTS (SELECT 1 FROM class_enrollments ce
          JOIN teacher_assignments ta ON ta.class_id = ce.class_id
         WHERE ce.student_id = students.id
           AND ce.status = 'active'
           AND ta.personnel_id = :actorPersonnelId)

-- finance.payments.read @ branch
payments.branch_id = ANY(:actorBranchIds)          -- skipped when all_branches = true
```

## 6. Administration rules

- **No privilege escalation.** A member can only grant permissions they hold, with a scope their
  own scope covers (`findEscalations`). Applies to editing roles and to assigning roles.
- **Branch-scoped user management.** With `settings.users.manage @ branch` a member can only manage
  memberships whose branches are a subset of their own and cannot grant all-branch access.
- **Dependencies.** Grants must satisfy `dependsOn` (e.g. `finance.payments.create` requires
  `finance.payments.read` and `finance.collections.read`).
- **Last owner protection.** An organization always keeps at least one active member with the
  owner role.
- Every change (role created/updated, permissions changed, member invited/suspended, roles assigned)
  is written to the audit log with before/after values.

## 7. Sensitive data categories

| Category                   | Examples                          | Rule                                                                                                                   |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Financial                  | balances, payments, agreements    | `finance.*` permissions only; never returned by non-finance endpoints (student profile omits the finance tab entirely) |
| Restricted identifiers     | national ID                       | Encrypted at rest (AES-256-GCM), searchable through a keyed hash, masked without `students.sensitive.read`             |
| Guidance / health (future) | counselling notes, health records | Separate permissions and note categories; never included in exports by default                                         |
| Personal data              | names, contact details            | Standard permission checks, PII redaction in logs, audited exports                                                     |

## 8. Platform staff and support access

Platform staff are users with `users.platform_role` (`platform_admin`, `platform_support`). Their
permissions (`platform.organizations.manage`, `platform.support.access`, `platform.audit.read`) are
**not** tenant permissions and do not grant access to tenant data by themselves.

Access to a tenant's data for support requires an explicit, time-boxed **support session**:
reason, ticket reference, expiry (max. 4 hours), recorded in `support_access_sessions`, visible to
the tenant's administrators, read-only by default, and every request made under it is audited with
the support session id in both the platform and the tenant audit logs.

## 9. Future extensions

- Role assignments per branch (`membership_roles.branch_id`) for people with different roles in
  different branches.
- Attribute conditions on grants (e.g. amount limits for payment reversal, time windows).
- API keys with explicit grant sets for integrations; SSO group → role mapping.
- Step-up authentication (MFA) for `restricted` permissions.
