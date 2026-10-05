# ADR-0013: Field-level encryption for national ID numbers

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Turkish schools must record national ID numbers (TC Kimlik No) of students and guardians — highly
sensitive personal data of minors. Disk encryption alone does not protect against database dumps,
over-broad queries or support access.

## Decision

- Encrypt national IDs with **AES-256-GCM** in the application (key from `FIELD_ENCRYPTION_KEY`,
  versioned with a key id prefix for rotation).
- Store an **HMAC-SHA-256 blind index** (`*_hash`, key `FIELD_HASH_KEY`) for exact-match search and
  uniqueness, and the last four digits for masked display.
- Decrypt only for members with `students.sensitive.read`; otherwise show `•••••••1234`.

## Consequences

- No range/partial search on national IDs (acceptable; exact match is the real use case).
- Key management becomes an operational responsibility (secret manager, rotation procedure).

## Alternatives considered

- `pgcrypto` in the database — keys would travel in SQL statements and logs.
- Plain text with column privileges — does not protect backups/dumps.
