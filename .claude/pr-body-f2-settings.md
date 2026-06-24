## Summary

Implements the V2.2 Settings System (F2) merged with Theming (F3). Settings persist across app restarts, the page is auto-generated from a typed registry, and downstream consumers extend by editing a single file.

Shipped as a 12-commit series on `feat/v2-settings-system`:

- F2+F3 merged into V2.2 (avoids the MF-3 "Theme tab that doesn't apply" gap)
- Settings registry as single source of truth
- Multi-page settings UI driven by the registry
- Real electron-store persistence (writes to `<userData>/settings.json`)
- Recent projects backed by a real `global.db` table (not a setting)
- Two post-merge fixes surfaced by manual testing

## Architecture

**Registry** lives in `packages/api/src/settings/` and is exposed via the sub-path `@electron-template/api/settings` (renderer-safe exception — see `packages/api/CLAUDE.md`). The module is Drizzle-free and tree-shakes correctly when imported from the renderer.

**Defaults** are derived from the registry at boot. The `electron-store` schema is built by composition: `z.object(Object.fromEntries(registry.map(s => [s.key, s.schema])))`.

**Per-key validation** (CF-5): `updateSetting({ key, value })` runs `value` against `registry.find(s => s.key === key).schema` before persisting. No `z.unknown()` escape hatch.

**Extensibility** (D4): consumers add entries to `apps/web/src/settings/app-settings.ts`. Sub-nav, route, UI, and oRPC validation all update automatically — no other file edits required.

**UI**: multi-page layout (`_app.settings.tsx` + `._index.tsx` + `.$section.tsx`) with internal sub-nav (two-column inside `/settings`, not in the app sidebar). GenericControl dispatches on `entry.control.type` to `select` / `cards` / `switch` / `number` / `text` / `project-list`.

## By PR

| PR | What |
|---|---|
| docs | F2 architecture decisions memory |
| **PR 1** Foundation | registry + electron-store + oRPC procedures + 12 round-trip tests + TanStack Query hooks |
| **PR 2** Theming | zero-flash first paint via `index.html` inline script + localStorage mirror; `matchMedia` listener for `system` follow |
| **PR 3** UI | multi-page layout + auto-generated GenericControl + 19 i18n keys (en/fr/es) |
| **PR 4** Recent projects | `recent_projects` table in `global.db` + projects oRPC domain + opt-in backup + `closeProject` lifecycle hook (CF-4, MF-2) |
| **PR 5** Polish | swap InMemoryStore stub for real `electron-store` + remove LanguageSwitcher from AppHeader |

## Post-merge fixes

Two bugs surfaced only during manual end-to-end testing (would not have been caught by unit tests or CI):

- **`95cf5be`** — `initORPC()` was only called inside `_app.index.tsx`'s `useEffect`. Landing directly on `/settings/...` threw "ORPC client not initialized" on every hook. **Fixed** by awaiting `initORPC()` in `apps/web/src/main.tsx` before `createRoot().render()`.
- **`0065277`** — `useUpdateSetting` persisted language to electron-store but never called `i18n.changeLanguage()`. **Fixed** by adding a `useEffect` in `_app.tsx` that syncs `i18n.language` with `settings.language` on every settings change (same pattern as the theme sync).

## Critical fixes addressed

From `docs/internal/product/releases/v2.0.0/CRITIQUE-FIXES.md`:

- **CF-4** closeProject on `before-quit` — PR 4
- **CF-5** typed updateSetting per key — PR 1 (registry schema validation)
- **MF-2** WAL + backup for `global.db` — PR 4 (opt-in via `{ backup: true }`)
- **MF-3** F2 + F3 merged in V2.2 — architecture decision
- **MF-5** round-trip tests — PR 1 (12 tests), PR 4 (7 tests); real `MessageChannel` + `RPCHandler` + `RPCLink`, no mocks
- **MF-6** all i18n keys present — PR 3
- **m8** `updateMultipleSettings` removed — use `Promise.all([updateSetting(...)])` if batch is needed

## Acceptance criteria (V2.2)

| # | Criterion | Verified |
|---|---|---|
| AC-1 | dark class applied before first paint | inline script in `index.html` |
| AC-2 | changing language updates all translated strings | manual (DevTools) |
| AC-3 | language persists across app restarts | manual + integration test |
| AC-4 | setting theme to "Dark" applies `class="dark"` to `<html>` | manual |
| AC-5 | "System" follows OS dark mode | manual + matchMedia listener |
| AC-6 | `client.getSettings()` returns correct defaults | Vitest round-trip |
| AC-7 | `client.updateSetting({ key, value })` persists to disk | manual |
| AC-8 | `config.json` is human-readable JSON | manual |
| AC-9 | `/settings` renders 3 sections | manual |
| AC-10 | adding entry to `app-settings.ts` auto-appears | manual |
| AC-11 | unknown key returns 404 ORPCError | Vitest |
| AC-12 | schema mismatch returns 400 ORPCError | Vitest |
| AC-13 | all `settings.*` i18n keys defined in en/fr/es | manual + grep |
| AC-14 | opening a project upserts `recent_projects` row | manual + integration test |
| AC-15 | deleting a project cascades to `recent_projects` | integration test (F5 wires real delete) |

## Verification

```bash
pnpm --filter @electron-template/api test    # 43 tests pass (36 baseline + 7 new)
pnpm --filter web typecheck                  # clean
pnpm --filter @electron-template/api typecheck # clean
pnpm --filter @electron-template/ui typecheck # clean
pnpm --filter desktop typecheck              # clean
pnpm --filter web build                      # clean
pnpm --filter desktop build                  # clean
```

## Repo hygiene (chore commits, end of series)

Three chore commits at the end of the series address a pre-existing inconsistency: the repo gitignored `apps/*/dist` but tracked `packages/*/dist` (77 files committed). Each `tsc` run regenerated those files, causing merge conflicts and churn for no value (the source of truth is `packages/*/src`).

- **`1ec6e6c`** — `chore(gitignore): exclude packages/*/dist/ build outputs`
- **`6d2e2b7`** — `chore(repo): untrack 77 packages/*/dist/ build artifacts`
- **`0652804`** — `chore(repo): build workspace packages after install (postinstall)`

The postinstall is required because consumers (`apps/web`, `apps/desktop`) import from `@electron-template/api` which resolves to `dist/index.js`. Without the postinstall, a fresh clone + `pnpm install` would leave `packages/api/dist/` empty and every `import` would fail.

## Manual smoke test (V2.2 acceptance)

1. `pnpm install` (first time only, triggers the new `postinstall` rebuild)
2. `pnpm run dev:desktop`
3. Click **Settings** → **Appearance** → **Dark** — `<html>` gets `class="dark"` immediately, no error toast
4. Reload → still dark (persists via electron-store)
5. Click **Settings** → **General** → switch language to **Français** — all UI text updates immediately
6. Reload → still in French
7. Click **Settings** → **Projects** → empty state
8. From DevTools console: `await window.orpc.touchRecentProject({ projectId: 'demo', projectName: 'Demo' })`
9. Reload → "Demo · less than a minute ago" appears

## Files changed

- **New**: `packages/api/src/settings/*` (4 files), `apps/desktop/src/main/{settings,projects}.ts`, `apps/web/src/lib/theme-init.ts`, `apps/web/src/settings/app-settings.ts`, `apps/web/src/components/settings/**` (10 files), `apps/web/src/hooks/{useSettings,useUpdateSetting,useRecentProjects}.ts`, `apps/web/src/routes/_app.settings.{tsx,$section.tsx,index.tsx}`, `packages/db/src/schema/recent-projects*.ts`, `packages/db/drizzle/0001_wonderful_the_enforcers.sql`
- **Modified**: `packages/api/CLAUDE.md`, `packages/api/package.json`, `packages/api/src/routes/index.ts`, `packages/api/tests/helpers.ts`, `packages/db/src/{client,migrator,schema/index,index}.ts`, `apps/desktop/{package.json, src/main/index.ts}`, `apps/web/{package.json, src/{main,routes/_app,components/headers/app-header,components/settings/controls/project-list-control}.tsx}`, i18n locales (en/fr/es, both src/ and public/)
- **Deleted**: `apps/web/src/components/language-switcher.tsx`

## Notes for reviewers

- **Sub-path import**: `@electron-template/api/settings` is a renderer-safe exception. The main entry remains renderer-forbidden. Documented in `packages/api/CLAUDE.md`.
- **electron-store schema**: deliberately not passed (its `schema` option expects JSON Schema, not Zod). Validation happens at the oRPC boundary.
- **`opened_at` unique index**: footgun for concurrent calls within the same millisecond. Acceptable for V2.2; downgrade to non-unique if F5 introduces bulk import.
- **date-fns locale**: `formatDistanceToNow` called without locale option. The i18n `{{time}}` interpolation handles the "ago" wording for now.
- **better-sqlite3 rebuild**: first install after this PR triggers a rebuild against Electron 35's ABI via the new `postinstall` script. Subsequent installs are no-ops until Electron major version changes.

Refs: `docs/internal/product/releases/v2.0.0/features/02-settings-system.md`, `docs/internal/product/releases/v2.0.0/CRITIQUE-FIXES.md`
