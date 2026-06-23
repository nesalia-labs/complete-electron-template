# Plan: Upgrade Outdated Dependencies Roadmap

## Goal

Bring all 7 outdated packages to their latest major versions, sequenced to minimize risk and isolate failures.

## Context

`pnpm outdated:summary` (see `scripts/outdated.mjs`) reports 32 outdated packages, of which 7 have **major version** gaps. Both biggest ecosystem breaking changes — Electron 40 removing renderer clipboard access, and Vitest 4's complete mock-engine rewrite — **do not affect this project** (no `clipboard` usage in renderer; no `vi.fn`/`vi.mock` in any test).

Detailed changelogs per major version live in `docs/learnings/<package>/changelogs/<version>/CHANGELOG.md`. Step-by-step execution plans live alongside this roadmap:

- [`upgrade-deps-step-1-quick-wins.md`](upgrade-deps-step-1-quick-wins.md) — `@types/node` 22→26, `@electron-toolkit/utils` 3→4, `jsdom` 27→29, `vitest` 3→4
- [`upgrade-deps-step-2-vite-cluster.md`](upgrade-deps-step-2-vite-cluster.md) — `vite` 7→8, `@vitejs/plugin-react` 5→6
- [`upgrade-deps-step-3-electron-cluster.md`](upgrade-deps-step-3-electron-cluster.md) — `electron` 35→42 (7 majors)

## Scope

**In scope**:
- 7 major-version upgrades across `packages/db`, `packages/api`, `apps/desktop`, `apps/web`
- `engines.node` declaration in root `package.json`
- CI workflow updates (Node version matrix, `install-electron` pre-step)
- Verification: typecheck, tests, build, dev mode

**Out of scope**:
- Minors and patches from the 32 outdated packages (low-risk `pnpm update` pass)
- New features from the upgrades (we adopt only when needed, not eagerly)
- `posts` table implementation (separate ticket)

## Migration order & rationale

| Step | Package(s) | Effort | Rationale |
|------|-----------|--------|-----------|
| 1 | Quick wins (5 packages) | **3-4h** | Type-only changes + test config rewrites. Zero runtime behavior change. Catches type drift early. |
| 2 | vite 7→8 + plugin-react 5→6 | **1 day** | Bundler swap (esbuild+Rollup → Rolldown). Validated by build output, not typecheck. Gated by `electron-vite` compatibility — see Step 2 plan. |
| 3 | electron 35→42 (7 majors) | **3-5 days** | Native module rebuild at 40, supply-chain change at 42. Each major is its own commit for bisectability. Last because the toolchain is the slowest to validate. |

**Why this order**:
- Type-level fixes (Step 1) are isolated to compile output — no runtime behavior change.
- Test infrastructure upgrades happen before bundler upgrades, so any new test failures localize to vitest/jsdom, not Rolldown.
- Vite + plugin-react are bundled because they share a peer-dep boundary.
- Electron is last because a failed Electron bump should not block Step 1 or Step 2.

## Pre-flight verifications (do these before starting)

These 2 cheap checks gate the entire plan:

1. **electron-vite compatibility with Vite 8**
   ```bash
   pnpm view electron-vite versions --json | tail -20
   pnpm view electron-vite@latest peerDependencies
   ```
   - If `electron-vite@^6` exists with `vite: ^8` peer → Step 2 can run as planned.
   - Otherwise: pin `vite ^7` in `apps/desktop/electron.vite.config.ts`, bump only `apps/web` to Vite 8.

2. **TanStack compatibility with Vite 8 and Node 24**
   ```bash
   pnpm view @tanstack/react-start@latest peerDependencies
   pnpm view @tanstack/router-plugin@latest peerDependencies
   ```
   - Both must accept Vite 8 + Node 24 for Step 2 + Step 3 to work end-to-end.

## Effort & timeline

| Bucket | Effort | Cumulative |
|--------|--------|------------|
| Pre-flight checks | 30 min | 30 min |
| Step 1 (quick wins) | 3-4h | ½ day |
| Step 2 (vite cluster) | 1 day | 1½ days |
| Step 3 (electron 7 majors) | 3-5 days | ~1-2 weeks |
| **Total** | | **1-2 dev-weeks** |

## Risks (cross-cutting)

| Risk | Mitigation |
|------|------------|
| `electron-vite` lag (no Vite 8 support) | Pin Vite 7 in desktop side; bump only `apps/web`. See pre-flight. |
| TanStack Start/Router lag | Pre-flight check before Step 2. |
| `better-sqlite3` ABI rebuild on Electron 40 | `@electron/rebuild ^4.0.4` already in root `devDependencies`. Run `pnpm rebuild --filter desktop` after Electron 40. |
| CJS interop in Vite 8 (deps: `zod`, `i18next`, `recharts`, etc.) | Run a smoke build against the heaviest CJS consumer before committing. Set `legacy.inconsistentCjsInterop: true` if a consumer breaks. |
| Vitest 4 silently ignores old pool keys | Migrate `poolOptions.forks.singleFork` → top-level `maxWorkers: 1, isolate: false` in the same PR as the bump. No silent warnings — easy to ship broken. |

## Verification matrix

| Step | Verification |
|------|--------------|
| 1 | `pnpm -r typecheck && pnpm -r test` — all 52 tests still pass |
| 2 | `pnpm --filter web build && pnpm --filter desktop build` — both bundles emit. Cold-build time comparison. |
| 3 (per major) | `pnpm --filter desktop dev` (window opens) + manual smoke (create user, query, delete) + `pnpm --filter desktop build` |

## Out of scope (deferred)

- Adoption of new features (Vite Devtools, Vitest Browser Mode, expect.schemaMatching, etc.) — wait until a use case emerges.
- Minors + patches from the remaining 25 outdated packages — single `pnpm update` pass after majors land.
- Migration to Drizzle v1 RC — not until v1 is stable.
