# Local development

Everything runs without paid third-party accounts. The only required service is
**PostgreSQL 16+**: payments use the built-in mock provider, rate limiting runs in memory and
e-mails are written to the API log by default. Docker Compose is the quickest way to get
PostgreSQL (plus the optional Redis, MinIO and Mailpit); without Docker, use GitHub Codespaces
(§2.2) or a locally installed PostgreSQL (§2.3).

## 1. Prerequisites

| Tool             | Version                             | Notes                                                          |
| ---------------- | ----------------------------------- | -------------------------------------------------------------- |
| Node.js          | 22 LTS (see `.nvmrc`)               | `nvm use` or `fnm use`                                         |
| pnpm             | 10.28 (see `packageManager`)        | `corepack enable` installs the pinned version                  |
| PostgreSQL       | 16 or newer (tested with 16–18)     | Via Docker (§2.1), Codespaces (§2.2) or a local install (§2.3) |
| Docker           | 24+ with Compose v2                 | Optional                                                       |
| A modern browser | Chrome, Edge, Firefox, Safari 16.4+ |                                                                |

## 2. First run

### 2.1 With Docker

```bash
cd multi-tenant
corepack enable
pnpm install
cp .env.example .env          # development defaults; never commit .env
pnpm infra:up                 # PostgreSQL 17, Redis 7, MinIO, Mailpit
pnpm db:reset                 # roles + database + migrations + demo data
pnpm dev                      # API on :4000, web on :3000 (watch mode)
```

Open <http://localhost:3000> and sign in with one of the demo accounts below.

### 2.2 In the browser with GitHub Codespaces (nothing to install)

The repository contains a dev container (`.devcontainer/` at the repository root) with
PostgreSQL 17.

1. On GitHub, open the repository and select the branch to run.
2. **Code → Codespaces → Create codespace on _branch_.**
3. The first start takes a few minutes: dependencies are installed, the database is created with
   demo data and the apps are built (`.devcontainer/setup.sh`). Then the API and the web app
   start (`.devcontainer/start.sh`) and port 3000 opens in a new browser tab. If it does not, open
   the **Ports** tab and click the address of port 3000. If the port is missing or the page
   fails, run `bash .devcontainer/start.sh` in a terminal: it finishes an interrupted setup, stops
   leftovers of an earlier start and prints the address once the app answers.
4. Sign in with a demo account (§3).

The forwarded address is private to your GitHub account. Codespaces stop after 30 minutes of
inactivity and use the free monthly allowance of personal accounts; stop or delete the codespace
from <https://github.com/codespaces> when you are done. The app runs from production builds there;
for live code changes stop it (<kbd>Ctrl</kbd>+<kbd>C</kbd> in its terminal) and run `pnpm dev`.

### 2.3 With a locally installed PostgreSQL

**macOS and Linux, one command:** with Node.js 22+ installed and PostgreSQL running (steps 1–2),
`bash scripts/local-setup.sh` in `multi-tenant/` enables pnpm, installs dependencies, creates
`.env` (detecting the Postgres.app/Homebrew superuser), creates the demo database, builds, starts
the app and opens <http://localhost:3000>. Afterwards `pnpm start` is enough. Step by step:

1. Install Node.js 22 LTS or newer from <https://nodejs.org>, then run `corepack enable`.
2. Install PostgreSQL 16 or newer:
   - **Windows:** the installer from <https://www.postgresql.org/download/windows/>; give the
     `postgres` user the password `postgres` (or use your own in `DATABASE_ADMIN_URL`).
   - **macOS:** [Postgres.app](https://postgresapp.com) or `brew install postgresql@17`; both create
     a superuser named after your macOS account without a password, so set
     `DATABASE_ADMIN_URL=postgres://<your-user>@localhost:5432/postgres`.
   - **Linux (Debian/Ubuntu):** `sudo apt install postgresql`, then
     `sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`.
3. In `multi-tenant/`:

   ```bash
   pnpm install
   cp .env.example .env    # adjust DATABASE_ADMIN_URL if your superuser differs
   pnpm db:reset           # creates the three application roles and the database
   pnpm dev
   ```

Only `DATABASE_ADMIN_URL` needs a superuser; `db:reset` creates the application roles itself.
Redis, MinIO and Mailpit are not needed with the default `.env`.

### 2.4 Addresses on your machine

| Service              | URL                                                                       |
| -------------------- | ------------------------------------------------------------------------- |
| Web app              | <http://localhost:3000>                                                   |
| API (proxied by web) | <http://localhost:3000/api/v1/…> (direct: <http://localhost:4000/api/v1>) |
| OpenAPI / Swagger    | <http://localhost:4000/api/docs> (disabled in production)                 |
| Health               | <http://localhost:4000/api/health/live>, `/api/health/ready`              |
| Mailpit (e-mails)    | <http://localhost:8025> (Docker only; set `MAIL_DRIVER=smtp`)             |
| MinIO console        | <http://localhost:9001> (Docker only; not used by the app yet)            |

The browser only talks to the web origin; `/api/*` is proxied to the API so session cookies stay
first-party (ADR-0011).

## 3. Demo data and accounts

All demo accounts use the password **`Demo!Parola2026`**. The data is fictional and generated
deterministically by `apps/api/src/platform/database/seed`; never load real personal data.

**Atlas Akademi** (`atlas`, two branches: Kadıköy `KDK`, Ataşehir `ATS`)

| E-mail                     | Name         | Role                         | Branch access                                     |
| -------------------------- | ------------ | ---------------------------- | ------------------------------------------------- |
| `sahip@atlas.test`         | Elif Aydın   | Kurum Yöneticisi (owner)     | All                                               |
| `mudur@atlas.test`         | Murat Şahin  | Okul Müdürü (principal)      | All                                               |
| `muhasebe@atlas.test`      | Zeynep Kaya  | Muhasebe (accountant)        | Kadıköy                                           |
| `ogretmen@atlas.test`      | Can Demir    | Öğretmen (teacher)           | Kadıköy — homeroom 9-A, Matematik in 9-A and 10-A |
| `ogrenciisleri@atlas.test` | Ayşe Yıldız  | Öğrenci İşleri               | Kadıköy, Ataşehir                                 |
| `subemuduru@atlas.test`    | Burak Öztürk | Şube Müdürü (branch manager) | Ataşehir                                          |
| `davetli@atlas.test`       | —            | Pending invitation           | —                                                 |

**Nova Koleji** (`nova`, one branch: Çankaya `CNK`)

| E-mail               | Name         | Role       | Branch access |
| -------------------- | ------------ | ---------- | ------------- |
| `sahip@nova.test`    | Selin Arslan | Owner      | All           |
| `muhasebe@nova.test` | Emre Koç     | Accountant | All           |
| `ogretmen@nova.test` | Deniz Aksoy  | Teacher    | Çankaya       |

**Cross-tenant and platform**

| E-mail                   | Purpose                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `danisman@campusos.test` | Member of both tenants (principal in Atlas, student affairs in Nova): organization switching |
| `platform@campusos.test` | Platform administrator: tenant provisioning, no tenant data                                  |

Things to try:

- Sign in as `ogretmen@atlas.test`: only assigned students, no finance anywhere (open `/finance`
  directly to see the "no access" state).
- Sign in as `muhasebe@atlas.test`: the collections dashboard, Kadıköy data only.
- Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> and type `gunes`: Turkish-insensitive search finds “Güneş”.
- On a student's **Finans** tab: create a payment plan, record a payment, create a payment link and
  complete the mock checkout, then reverse the payment from its receipt.

## 4. Everyday commands

Run from `multi-tenant/`.

| Command                        | What it does                                                            |
| ------------------------------ | ----------------------------------------------------------------------- |
| `pnpm dev`                     | Builds shared packages, then API and web in watch mode                  |
| `pnpm start`                   | API and web from production builds (run `pnpm build` first)             |
| `pnpm dev:worker`              | Outbox relay worker in watch mode (optional locally)                    |
| `pnpm db:migrate`              | Applies pending migrations (as `app_owner`)                             |
| `pnpm db:seed`                 | Loads demo data into an empty database                                  |
| `pnpm db:reset`                | Drops and recreates the database, migrates and seeds (development only) |
| `pnpm db:generate`             | Generates a Drizzle migration from schema changes                       |
| `pnpm lint` / `pnpm typecheck` | All workspaces                                                          |
| `pnpm test`                    | Unit + integration tests (needs PostgreSQL)                             |
| `pnpm test:e2e`                | Playwright end-to-end suite (see [TESTING](TESTING.md))                 |
| `pnpm format`                  | Prettier                                                                |
| `pnpm check`                   | Everything CI runs: format, lint, typecheck, tests, build               |
| `pnpm infra:up` / `infra:down` | Start/stop the Docker dependencies                                      |

## 5. Configuration

`.env.example` documents every variable. The important ones:

| Variable                                 | Purpose                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | `app_runtime` — request handling, RLS enforced                                           |
| `DATABASE_SYSTEM_URL`                    | `app_system` — pre-authentication lookups, platform operations, worker                   |
| `DATABASE_MIGRATION_URL`                 | `app_owner` — migrations only                                                            |
| `DATABASE_ADMIN_URL`                     | Superuser, used only by `db:reset` and the test setup                                    |
| `FIELD_ENCRYPTION_KEY`, `FIELD_HASH_KEY` | National-ID encryption and blind index. Development defaults are refused in production   |
| `MAIL_DRIVER`                            | `console` (log), `smtp` (Mailpit locally) or `memory` (tests)                            |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORE` | Throttling on/off; `memory` or `redis`                                                   |
| `TRUST_PROXY`                            | Trust one proxy hop for the client address (see [SECURITY](../architecture/SECURITY.md)) |
| `OUTBOX_PUBLISHER`                       | Worker destination: `log` or `bullmq`                                                    |
| `API_INTERNAL_URL` (web)                 | Where the Next.js server reaches the API                                                 |

The API refuses to start in production with development secrets, a non-SMTP mail driver, or a
database role that is a superuser, has `BYPASSRLS` or owns tables.

## 6. Database workflow

1. Change the Drizzle schema in `apps/api/src/platform/database/schema`.
2. `pnpm db:generate` creates the table migration in `apps/api/drizzle`.
3. Security objects (RLS policies, grants, triggers, functions) live in hand-written SQL
   migrations next to the generated ones. Every new tenant-owned table needs RLS — the
   `rls-coverage` test fails otherwise.
4. `pnpm db:migrate`, then `pnpm test`.

## 7. Troubleshooting

| Symptom                                            | Fix                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API exits with "Invalid environment configuration" | Compare `.env` with `.env.example`                                                                       |
| API exits with an unsafe database role error       | The runtime/system URLs must use `app_runtime` / `app_system`, never `postgres`                          |
| Login says "Çok fazla deneme yaptınız"             | Rate limit (10 sign-ins per minute per address). Wait a minute or set `RATE_LIMIT_ENABLED=false` locally |
| Account locked                                     | 10 wrong passwords lock an account for 15 minutes; `pnpm db:reset` restores the demo data                |
| Web shows "Sunucuya ulaşılamadı"                   | The API is not running on `API_INTERNAL_URL`                                                             |
| Port already in use                                | `lsof -i :3000` / `:4000` and stop the old process                                                       |
