# CampusOS (working codename)

Multi-tenant education operations platform for private schools, colleges, academies, course
centers and education groups. The codename is temporary: the product name lives in the web message
catalogs (`app.name` in `apps/web/messages/*.json`) and in `apps/api/src/platform/brand.ts`.

> This folder is a self-contained pnpm monorepo. The repository root holds the owner's GitHub
> profile README, which is unrelated to the product.

## Quick start

```bash
cd multi-tenant
corepack enable            # pnpm 10 (see packageManager in package.json)
pnpm install
cp .env.example .env
pnpm infra:up              # PostgreSQL, Redis, MinIO, Mailpit (Docker)
pnpm db:migrate && pnpm db:seed
pnpm dev                   # web http://localhost:3000 · api http://localhost:4000/api/docs
```

Demo accounts are listed in [`docs/development/LOCAL_DEVELOPMENT.md`](docs/development/LOCAL_DEVELOPMENT.md).

No Docker? Only PostgreSQL 16+ is required. Run it in the browser with **GitHub Codespaces**
(Code → Codespaces → Create codespace; the dev container sets everything up) or use a locally
installed PostgreSQL — both are described in the same guide.

## Layout

```
apps/
  api/          NestJS 12 modular monolith (REST + OpenAPI) and background worker
  web/          Next.js 16 App Router application
packages/
  authorization/  permission catalog, scopes, role templates, pure authorization logic
  contracts/      Zod schemas and types shared by API and web
  ui/             design tokens and React component library
  eslint-config/  shared ESLint flat configs
  tsconfig/       shared TypeScript configs
infra/
  docker/       local dependencies (docker compose)
  terraform/    planned IaC (documentation only for now)
docs/
  architecture/ system design, multitenancy, authorization, finance, data model
  product/      MVP scope, design system
  decisions/    architecture decision records (ADRs)
  development/  local development and testing guides
```

Start with [`docs/README.md`](docs/README.md).
