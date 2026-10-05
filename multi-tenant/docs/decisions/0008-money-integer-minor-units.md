# ADR-0008: Money as integer minor units with explicit currency

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Floating point cannot represent decimal currency exactly. JavaScript has no native decimal type.

## Decision

Store amounts as `bigint` minor units in PostgreSQL and as safe integers (`Number.isSafeInteger`)
in TypeScript, always with an ISO-4217 `currency`. Percentages are basis points. Rounding is half
up, performed only in the finance domain functions. The API exchanges `amountMinor` + `currency`.

## Consequences

- Exact arithmetic with plain integers; no decimal library in hot paths.
- Upper bound ≈ 9×10¹⁵ minor units per value — far above any school amount.
- Currencies with 0 or 3 decimals are supported through an exponent table.

## Alternatives considered

- `NUMERIC(19,4)` + a decimal library — exact, but heavier in JS and easier to misuse (string/number
  conversions).
