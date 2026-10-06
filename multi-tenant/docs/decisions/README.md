# Architecture decision records

| ADR                                        | Title                                                         | Status   |
| ------------------------------------------ | ------------------------------------------------------------- | -------- |
| [0001](0001-modular-monolith.md)           | Modular monolith for the backend                              | Accepted |
| [0002](0002-monorepo-and-toolchain.md)     | pnpm monorepo and toolchain versions                          | Accepted |
| [0003](0003-shared-schema-rls.md)          | Shared database, shared schema, PostgreSQL row-level security | Accepted |
| [0004](0004-database-roles.md)             | Three database roles instead of BYPASSRLS                     | Accepted |
| [0005](0005-drizzle-and-sql-migrations.md) | Drizzle ORM with generated and hand-written SQL migrations    | Accepted |
| [0006](0006-server-side-sessions.md)       | Server-side sessions with opaque tokens                       | Accepted |
| [0007](0007-rbac-with-scopes.md)           | RBAC with scoped permissions                                  | Accepted |
| [0008](0008-money-integer-minor-units.md)  | Money as integer minor units with explicit currency           | Accepted |
| [0009](0009-unified-receivables.md)        | One receivables table for installments and charges            | Accepted |
| [0010](0010-transactional-outbox.md)       | Transactional outbox for domain events                        | Accepted |
| [0011](0011-same-origin-bff-routing.md)    | Same-origin routing between web and API                       | Accepted |
| [0012](0012-zod-contracts.md)              | Zod contracts shared between API and web                      | Accepted |
| [0013](0013-field-level-encryption.md)     | Field-level encryption for national ID numbers                | Accepted |
| [0014](0014-repository-location.md)        | Product lives in the `multi-tenant/` folder                   | Accepted |

New decisions copy [TEMPLATE.md](TEMPLATE.md) and take the next number.
