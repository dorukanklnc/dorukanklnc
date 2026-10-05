# ADR-0009: One receivables table for installments and charges

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Installments (from payment plans) and additional charges (books, uniform, trips) behave the same
for collections: due date, amount, outstanding, allocation, overdue, aging, reminders, statements.

## Decision

Use a single `receivables` table with `kind IN ('installment', 'charge')` and kind-specific CHECK
constraints (installments require a plan and sequence number). Allocations reference
`receivables` only.

## Consequences

- No polymorphic foreign keys; one implementation of allocation, overdue detection and aging.
- UI and API still expose installments and charges as separate views/filters.

## Alternatives considered

- Separate `installments` and `charges` tables — duplicated logic and nullable dual FKs on
  allocations.
