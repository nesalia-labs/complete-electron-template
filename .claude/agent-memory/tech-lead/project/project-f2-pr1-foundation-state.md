---
name: project-f2-pr1-foundation-state
description: PR 1 of Settings System — registry, electron-store stub, oRPC procedures, hooks. Built 2026-06-23.
metadata:
  type: project
---

# F2 (Settings) PR 1 — Foundation — State

PR 1 of the Settings System landed on `feat/v2-settings-system` on 2026-06-23.

## What ships in PR 1

- `packages/api/src/settings/` — registry, schemas, built-in entries, singleton. No Drizzle.
- `packages/api/src/routes/settings.ts` — `getSettings`, `updateSetting` procedures. Validate against registry schema, refuse globalDb keys with `BAD_REQUEST`. Closure factory over `AppStore`.
- `packages/api/src/routes/index.ts` — `createRouter(db, store)` now takes 2 args.
- `apps/desktop/src/main/settings.ts` — in-memory `InMemoryStore` stub satisfying `AppStore`. Seeded from registry defaults.
- `apps/desktop/src/main/index.ts` — passes the store to `createRouter`.
- `apps/web/src/hooks/{useSettings,useUpdateSetting}.ts` — TanStack Query hooks with optimistic update + rollback + sonner toast.
- `apps/web/src/main.tsx` — adds `QueryClientProvider` + `<Toaster />`.
- i18n: `settings.errors.saveFailed` key added to en/fr/es (in both `src/i18n/locales/` and `public/i18n/locales/`). `nav` keys synced between the two directories to fix the existing drift.
- Round-trip test: `packages/api/tests/settings/registry.test.ts` — 12 tests (6 registry, 6 oRPC). Uses real `MessageChannel` + `RPCHandler` + `RPCLink`.

## What is deliberately NOT in PR 1

- No real `electron-store` install — stub keeps the API shape identical. PR 3 swap.
- No settings UI components (shadcn tabs, controls). PR 3.
- No theme application. PR 2/3.
- No `recent_projects` table or `projects.updateRecent` procedure. PR 4.
- No `LanguageSwitcher` migration. PR 5.
- No `descriptionKey` i18n keys — only `errors.saveFailed` exists. PR 3 must add the rest (per MF-6).
- No new shadcn components (no tabs, no switch). PR 3.

## Why: full scope & acceptance criteria
- [[project-f2-settings-architecture]] — the approved architecture for F2+F3 merged.
- [[project-v2-direction]] — the V2 release direction.
- `/docs/internal/product/releases/v2.0.0/CRITIQUE-FIXES.md` — CF-5 (typed updateSettings) and MF-5 (round-trip tests) are addressed by PR 1.

## How to apply

When picking up PR 2 (theme application) or PR 3 (settings UI), the registry, store, and procedures are stable. Don't refactor them — extend:
- PR 3 creates `apps/web/src/settings/app-settings.ts` and spreads it with `builtInSettings` to build a consumer registry. Use `createSettingsRegistry([...builtInSettings, ...appSettings])`.
- PR 3 also replaces the `InMemoryStore` stub with a real `electron-store` instance. The `AppStore` interface stays the same.
- PR 4 adds `recent_projects` table and a `projects` domain with `updateRecent` procedure. `recentProjects` stays in the registry as a `GlobalDbEntry` placeholder.

## Test status
- `pnpm --filter @electron-template/api test` — 36 tests pass (12 new in `settings/registry.test.ts`).
- `pnpm --filter @electron-template/api typecheck` — clean.
- `pnpm --filter web typecheck` — clean (3 `as any` casts on settings hooks for TS 6 / oRPC client type workaround; same pattern as `apps/web/src/lib/orpc.ts:24` and `packages/api/tests/helpers.ts:50`).
- `pnpm --filter desktop typecheck` — clean.
- `pnpm --filter @electron-template/sdk typecheck` — clean.
