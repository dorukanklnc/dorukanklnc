# ADR-0010: Transactional outbox for domain events

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Side effects (notifications, reminders, analytics, future integrations) must happen reliably after
a change commits, without dual-write problems and without putting Kafka in the request path.

## Decision

- Domain events are inserted into `outbox_events` in the **same transaction** as the change.
- A worker relays pending events with `FOR UPDATE SKIP LOCKED`, dispatches them to in-process
  handlers (and BullMQ jobs), marks them published, retries with backoff, and moves poison events
  to `failed` after a maximum number of attempts.
- Event shape: `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, `organization_id`,
  `payload` (ids, amounts, dates — no unnecessary PII), `metadata` (request id, actor).
- Later, Debezium can stream the same table into Kafka/Redpanda (outbox event router) without
  application changes.

## Consequences

- At-least-once delivery; handlers must be idempotent (dedupe keys).
- The outbox table needs retention cleanup.

## Alternatives considered

- Publishing to a broker inside the request — dual-write inconsistency.
- Event sourcing — powerful but disproportionate for an MVP.

## Implementation notes (2026-10-06)

- The relay lives in `apps/api/src/worker` (entrypoint `dist/worker.js`, `pnpm dev:worker`).
- Instead of in-process handlers, the relay hands each event to an `OutboxPublisher` port:
  `log` (default; one structured log line per event) or `bullmq` (queue `domain-events`, job id =
  outbox id so re-deliveries are deduplicated). Business handlers will consume that queue; none
  exist yet.
- Batches of `WORKER_OUTBOX_BATCH_SIZE` (default 50) rows; retry delay `min(2^attempts, 3600)`
  seconds; parked as `failed` after `WORKER_OUTBOX_MAX_ATTEMPTS` (default 10).
- Retention cleanup of published rows is not implemented yet.
