# CampusOS documentation

CampusOS is a working codename. Start with the product scope, then the system architecture; use
the development guides to run the system locally.

## Product

| Document                                                | What it answers                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| [MVP scope](product/MVP_SCOPE.md)                       | Who we sell to, modules A–N with status, role experiences, user flows       |
| [Design system](product/DESIGN_SYSTEM.md)               | Tokens, components, tables, forms, states, accessibility, writing, renaming |
| [Implementation checklist](IMPLEMENTATION_CHECKLIST.md) | What is built, partial and planned, area by area                            |

## Architecture

| Document                                                   | What it answers                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| [System architecture](architecture/SYSTEM_ARCHITECTURE.md) | Containers, modular monolith, request lifecycle, async processing          |
| [Multitenancy](architecture/MULTITENANCY.md)               | Tenant model, RLS, database roles, branch scoping, future chains           |
| [Authorization](architecture/AUTHORIZATION.md)             | Permission catalog, scopes, roles, anti-escalation, enforcement points     |
| [Finance model](architecture/FINANCE_MODEL.md)             | Agreements, plans, receivables, payments, allocation, reversal, invariants |
| [Data model](architecture/DATA_MODEL.md)                   | Tables, keys, constraints and their purpose                                |
| [Security](architecture/SECURITY.md)                       | Threat model, controls, KVKK measures, open legal questions                |
| [Observability](architecture/OBSERVABILITY.md)             | Logs, audit trail, health checks; planned metrics, tracing, alerting       |
| [Data platform](architecture/DATA_PLATFORM.md)             | Future analytics: CDC, lakehouse, warehouse, privacy downstream            |

## Decisions

Architecture decision records live in [`decisions/`](decisions/README.md). A change that alters
one of them adds a new ADR that supersedes the old one.

## Development

| Document                                              | What it answers                                                |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| [Local development](development/LOCAL_DEVELOPMENT.md) | Setup, demo accounts, commands, configuration, troubleshooting |
| [Testing](development/TESTING.md)                     | Test suites, what they cover, running end-to-end tests         |

## Conventions for these documents

- English for documentation, code and commit messages; the product UI is Turkish by default.
- Each document states its status (implemented, partial, design only). When behavior changes,
  the document changes in the same commit.
- No real personal data in examples; demo data is fictional.
- Compliance is never claimed by documentation alone; items needing legal review are listed in
  [Security](architecture/SECURITY.md).
