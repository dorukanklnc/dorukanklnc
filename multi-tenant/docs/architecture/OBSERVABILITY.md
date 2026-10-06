# Observability

> Status: logging, correlation ids, health checks and the audit trail are implemented. Metrics,
> distributed tracing, dashboards and alerting are designed here and planned.

## 1. Signals and their purpose

| Signal          | Question it answers                                     | Where                                       | Status                      |
| --------------- | ------------------------------------------------------- | ------------------------------------------- | --------------------------- |
| Structured logs | What happened in this request/job, and why did it fail? | stdout (JSON) → log platform                | Implemented                 |
| Audit trail     | Who did what to which record, when?                     | `audit_logs` table (append-only)            | Implemented                 |
| Health checks   | Can this instance take traffic?                         | `/api/health/live`, `/api/health/ready`     | Implemented                 |
| Metrics         | How fast, how often, how many errors?                   | OpenTelemetry → Prometheus-compatible       | Planned                     |
| Traces          | Where did the time go across web → API → DB/Redis?      | OpenTelemetry → OTLP collector              | Planned                     |
| Business KPIs   | Collection rate, overdue amounts, usage per tenant      | Product dashboards, later the data platform | Partial (in-app dashboards) |

Logs and the audit trail are deliberately separate: logs are operational, short-lived and may be
sampled; the audit trail is a product feature with tenant-visible, durable records.

## 2. Logging (implemented)

- **pino** writes one JSON object per line to stdout (`LOG_PRETTY=true` for humans locally).
- Every API request runs in an AsyncLocalStorage context. Log lines carry `requestId`, and once
  authenticated `userId` and `organizationId`, without passing loggers around.
- **Correlation:** a well-formed incoming `x-request-id` is honored, otherwise a UUIDv7 is issued;
  it is returned in the `x-request-id` response header, included in every problem document
  (`requestId`) and shown to users in error states ("İstek kimliği: …") so support can find the
  exact request. The Next.js server forwards it on server-side API calls.
- **Access log:** one line per request with method, matched route pattern (not the raw URL, so
  tokens in paths are not logged), status and duration; 4xx as `warn`, 5xx as `error`.
- **Redaction:** passwords, hashes, tokens, national IDs, cookies, authorization and CSRF headers
  are replaced with `[redacted]`. Request bodies and query strings are never logged.
- **Worker:** the outbox relay logs `component: worker`, delivery failures with attempt counts, and
  one line per relayed event (event type and ids only) with the log publisher.
- Levels: `fatal`, `error` (5xx, failed jobs), `warn` (4xx, retries), `info` (lifecycle, access),
  `debug` (batch details). Production default: `info`.

## 3. Health checks (implemented)

| Endpoint                | Meaning                                                             | Use                       |
| ----------------------- | ------------------------------------------------------------------- | ------------------------- |
| `GET /api/health/live`  | The process is running                                              | Container liveness probe  |
| `GET /api/health/ready` | Both database pools (`app_runtime`, `app_system`) answer `SELECT 1` | Readiness / load balancer |

Health endpoints are public, unversioned and excluded from rate limiting. Planned additions:
Redis and queue checks in readiness, and a worker heartbeat (oldest pending outbox age).

## 4. Metrics (planned)

Instrumentation with the OpenTelemetry SDK (auto-instrumentation for HTTP, Express, `pg`, ioredis)
exporting via OTLP; Prometheus-compatible scraping in self-hosted setups.

| Metric                                              | Type            | Labels                      | Alert idea                               |
| --------------------------------------------------- | --------------- | --------------------------- | ---------------------------------------- |
| `http.server.duration`                              | histogram       | route, method, status class | p95 > 1 s for 10 min                     |
| `http.server.errors`                                | counter         | route, code                 | 5xx rate > 1 % for 5 min                 |
| `auth.login.failures`, `auth.lockouts`              | counter         | —                           | spike vs. baseline (credential stuffing) |
| `ratelimit.rejections`                              | counter         | route                       | sustained rejections                     |
| `db.pool.waiting`, `db.query.duration`              | gauge/histogram | pool                        | waiting > 0 for 5 min                    |
| `outbox.pending.count`, `outbox.oldest.age.seconds` | gauge           | —                           | oldest > 5 min                           |
| `outbox.delivery.failures`, `outbox.failed.count`   | counter/gauge   | event type                  | any parked (`failed`) event              |
| `payments.recorded`, `payments.reversed`            | counter         | method                      | reversals ratio anomaly                  |
| `webhooks.rejected`                                 | counter         | provider, reason            | any signature failures burst             |

Tenant identifiers are **not** metric labels (cardinality and privacy); per-tenant analysis
belongs to logs and the data platform.

## 5. Tracing (planned)

- W3C Trace Context from the browser request through the Next.js server (server components and
  the `/api` proxy) to the API, PostgreSQL and Redis; the request id is attached as a span attribute
  so logs and traces join.
- Outbox events carry the originating request id in `metadata.requestId`; the worker continues the
  trace when relaying, linking asynchronous work to the user action.
- Span attributes never include personal data (no names, e-mails, national IDs, amounts with
  student context).

## 6. Error tracking (planned)

A self-hostable error tracker (e.g. Sentry/GlitchTip) for the web client and the API with:
PII scrubbing on the client side, source maps uploaded at build time, release tagging, and the
request id as a tag. Until then, unexpected client errors are logged to the console and API errors
appear in the logs with their request id.

## 7. Dashboards and alerting (planned)

- **Service:** request rate, error rate, latency percentiles, saturation (CPU, memory, pool usage).
- **Security:** failed logins, lockouts, rate-limit rejections, CSRF failures, webhook signature
  failures.
- **Finance operations:** payments recorded per hour, reversals, outbox lag and parked events,
  payment-provider availability.
- Alerts route to on-call with runbooks for: database unavailable, outbox lag, elevated 5xx,
  webhook failures, certificate expiry.

## 8. Runbook notes

- **"Kullanıcı bir hata görüyor":** ask for the request id shown in the error state, search logs by
  `requestId`; the audit trail shows the business action if it happened.
- **Outbox backlog:** `SELECT status, count(*), min(available_at) FROM outbox_events GROUP BY
status;` as `app_system`. Parked rows (`failed`) keep `last_error`; after fixing the cause, set
  `status = 'pending', available_at = now()` to retry. Consumers are idempotent by outbox id.
- **Locked account:** wait 15 minutes or reset the password (resets the failure counter).
