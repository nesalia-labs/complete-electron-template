# Settings Registry & oRPC Wiring — Learnings

**Context:** PR 1 (Foundation) of the Settings System (F2+F3 merged). Implemented 2026-06-23.

## Registry is the single source of truth

- `packages/api/src/settings/` owns 3 files: `schemas.ts` (Zod), `built-in.ts` (entries), `registry.ts` (factory + singleton). No Drizzle imports in this directory — keeps it tree-shakable for the renderer.
- The `registry.ts` exports a discriminated union `RegistryEntry = SettingDefinition | GlobalDbEntry` keyed on the `source` field. `recentProjects` is the only `GlobalDbEntry` for now; the union exists so PR 3 (app extensions) and PR 4 (real recent-projects table) can extend without breaking the type.
- The `validate(key, value)` method runs `schema.safeParse` for real entries, returns `{ ok: false, error: { message: '...' } }` for globalDb entries. Callers (oRPC handlers) translate that into `ORPCError('BAD_REQUEST', ...)`.

## `AppStore` interface — minimal coupling

- Defined `AppStore` in `packages/api/src/routes/settings.ts` with just `get store()`, `get(key)`, `set(key, value)`. The interface is **defined in the api package, not the desktop package**, so the api never imports from desktop.
- The desktop `InMemoryStore` stub (`apps/desktop/src/main/settings.ts`) implements `AppStore` and is seeded with registry defaults via iteration over `settingsRegistry.entries` filtered to non-globalDb entries.
- PR 3 will replace `InMemoryStore` with a real `electron-store` instance, but the `AppStore` shape stays the same → no procedure changes.

## TS 6 / oRPC `as any` workaround now required in 3 places

- The established `as any` cast at `apps/web/src/lib/orpc.ts:24` (client creation) is not enough once the renderer calls **typed** procedure values like `client.getSettings(...)` because the procedure type is `DecoratedProcedure<...>` which is not callable in TS 6.
- The new settings hooks cast the result of `getORPCClient()` to `any` at the call site: `(getORPCClient() as any).getSettings({...})`. This is the same workaround used in the test suite (`tests/helpers.ts:50`) — the pattern is now consistent.
- **Don't remove any of these casts** without verifying oRPC has fixed the upstream TS 6 client type issue. See `packages/api/CLAUDE.md` for the full context.

## Test discipline preserved

- Settings round-trip test uses the real `MessageChannel` + `RPCHandler` + `RPCLink` stack (via the existing `createTestContext()` fixture). No mocking of the oRPC pipeline — catches real serialization bugs.
- The new test fixture (`tests/helpers.ts`) builds an in-memory `AppStore` seeded from registry defaults, then passes it to `createRouter(db, store)`. This exercises the same code paths the renderer will hit at runtime.

## `getSettings` input is `.optional()` (not required)

- I made the `input` schema `.optional()` so `getSettings()` with no args is a valid call. The body uses `input?.keys` to handle both undefined and defined inputs. This matches the contract from the original spec (`keys` is optional).
- Trade-off: callers must still pass an object in the test harness, but the oRPC client normalizes `getSettings()` → `getSettings({ keys: undefined })` automatically (see `useSettings.ts`).

## What PR 1 defers

- No real `electron-store` — the `InMemoryStore` stub has the same shape. PR 3 swap is a one-line import change.
- No `recentProjects` table or `projects.updateRecent` procedure — `recentProjects` is a `placeholder: true` globalDb entry; the UI shows it as a section but the data is empty for now. PR 4 fills it in.
- No settings UI, no theme application, no `LanguageSwitcher` migration. All PR 3+.
- i18n: only the `settings.errors.saveFailed` key is added (needed by the toast). All other settings.* keys are deferred to PR 3 (per MF-6 in `CRITIQUE-FIXES.md`).

## Open questions for PR 3

- `descriptionKey` for the built-in entries: I used `settings.fields.<x>Description` placeholders. PR 3 must add these keys to `en/fr/es/common.json` (current state has only `settings.errors.saveFailed`).
- The `placeholder: true` field on `GlobalDbEntry` — is it really needed? PR 3 UI may distinguish "this setting has a value" vs "this is a UI-only section" using `source === 'globalDb'` alone. Keeping `placeholder: true` for now; revisit in PR 3.
