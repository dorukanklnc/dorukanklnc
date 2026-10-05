# ADR-0001: Modular monolith for the backend

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The MVP has one team, a strongly relational domain (students ↔ guardians ↔ agreements ↔
installments ↔ payments) and strict consistency needs (a payment, its allocations, its audit
record and its domain event must commit together). Operational simplicity matters more than
independent scalability at this stage.

## Decision

Build the API as a **modular monolith** in NestJS 12: one deployable (`api`) plus a worker entry
point from the same codebase. Modules are domain-oriented (`core/*`, `education/*`, `finance/*`),
own their tables, expose services for writes, and publish domain events through the transactional
outbox. Pure domain logic lives in framework-free `domain/` files.

## Consequences

- Single database transactions across modules; no distributed transactions.
- One build, one deploy, one place to debug.
- Module boundaries must be policed by convention and code review (lint rules can be added later).
- Extracting a service later means moving a module's tables and replacing direct service calls
  with its outbox events/API — designed for, not free.

## Alternatives considered

- **Microservices from day one** — operational cost, distributed consistency and slower delivery
  with no current scaling need.
- **Serverless functions** — awkward for long-lived connections with RLS session state and for
  background workers.
