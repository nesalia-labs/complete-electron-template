---
name: ci-cd-workflows
description: 17 modular CI/CD workflows, one-action-per-workflow principle
type: learning
---

# CI/CD Workflow Patterns

**Total:** 17 workflow files in `.github/workflows/`

**Per-package:** Each package has 3 workflows: `lint-*.yml`, `typecheck-*.yml`, `build-*.yml`
- `packages/sdk` (build, lint, typecheck)
- `packages/api` (build, lint, typecheck)
- `packages/db` (build, lint, typecheck) — build includes `drizzle-kit check`

**Per-app:**
- `apps/web`: lint, typecheck, build, test
- `apps/desktop`: lint, typecheck, build, release-desktop

**Release flow:**
- Triggered by `v*` tags
- Builds SDK → web → copies web assets to desktop → electron-builder
- Creates GitHub Release via `softprops/action-gh-release`

**Conventions:**
- Uses `pnpm --filter <package>` to scope to specific workspace member
- Ubuntu latest runner, Node 20
- pnpm 9 with `--frozen-lockfile`