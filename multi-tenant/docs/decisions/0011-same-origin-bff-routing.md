# ADR-0011: Same-origin routing between web and API

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The session cookie must be first-party, CORS should be unnecessary, and server components need to
call the API with the user's session.

## Decision

The browser only talks to the web origin. Next.js rewrites `/api/:path*` to the API
(`API_INTERNAL_URL`) in development; in production a load balancer routes `/api/*` to the API
service. Server components forward the incoming cookies when calling the API internally.

## Consequences

- No CORS configuration; cookies are `SameSite=Lax` first-party.
- The API remains a normal REST service usable by other clients (mobile, integrations) with tokens
  later.

## Alternatives considered

- Separate API subdomain with CORS + credentials — more configuration and cookie edge cases.
- Full BFF re-implementing endpoints in Next.js — duplicated logic.
