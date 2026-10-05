# ADR-0014: Product lives in the `multi-tenant/` folder

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The repository `dorukanklnc/dorukanklnc` is the owner's GitHub profile repository; its root
`README.md` is rendered on the GitHub profile. The owner asked for the product to live in a folder
named `multi-tenant`.

## Decision

The whole monorepo lives in `multi-tenant/`. The root `README.md` remains the profile README. CI
workflows live in the root `.github/workflows` (GitHub requirement) and run with
`working-directory: multi-tenant`.

## Consequences

- All commands run from `multi-tenant/`.
- Moving the product to a dedicated repository later is a `git subtree split --prefix multi-tenant`.
