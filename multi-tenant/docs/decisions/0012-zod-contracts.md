# ADR-0012: Zod contracts shared between API and web

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Request/response shapes must stay in sync between web and API, validation must happen on the server
and should give instant feedback on the client.

## Decision

`@repo/contracts` holds Zod 4 schemas and inferred types. The API validates bodies/queries with a
Zod pipe and documents them in OpenAPI via `z.toJSONSchema`. The web uses the same schemas in React
Hook Form (with Zod's Turkish locale for messages).

## Consequences

- One definition per contract; type errors surface on both sides when a contract changes.
- OpenAPI is generated from the same schemas (no class-validator DTO duplication).

## Alternatives considered

- class-validator DTOs — duplicated with frontend validation; decorator-heavy.
- OpenAPI-first codegen — good for public APIs; heavier workflow for an internal contract.
