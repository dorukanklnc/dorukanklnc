# Terraform (planned)

Infrastructure-as-code is intentionally **not** implemented yet. The MVP runs locally with
Docker Compose (`infra/docker`) and does not require any cloud account.

When the first hosted environment is created, this directory will contain modules for:

| Module       | Purpose                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `network`    | VPC, private subnets, security groups                                   |
| `database`   | Managed PostgreSQL (encrypted at rest, PITR backups, the three DB roles) |
| `cache`      | Managed Redis for BullMQ and rate limiting                              |
| `storage`    | S3 bucket(s) with public access blocked, SSE, lifecycle rules            |
| `compute`    | Container services for `api`, `worker` and `web`                        |
| `secrets`    | Secret manager entries consumed as environment variables                 |
| `observability` | OTLP collector, log retention, alerting                              |

Rules that already apply:

- No secrets in source control; everything is injected through the environment.
- The application database roles (`app_owner`, `app_runtime`, `app_system`) are provisioned
  here, never by the application. `app_runtime` and `app_system` must not be superusers and must
  not have `BYPASSRLS`; the API refuses to start otherwise.
