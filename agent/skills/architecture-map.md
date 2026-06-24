---
description: A walkthrough of apps/ and packages/ — what kinds of issues come from each area of the monorepo, grounded in real file paths. Use this to route an issue to the right owner and pick the right `type:*` / `effort:*` label.
---

# Architecture Map

The repo is a pnpm workspace with two apps and four shared packages:

```
complete-electron-template/
├── apps/
│   ├── desktop/         Electron desktop app (main + preload)
│   └── web/             TanStack Router SPA (renderer only — no SSR)
└── packages/
    ├── api/             oRPC server router (the contract)
    ├── db/              Drizzle ORM + better-sqlite3 (data layer)
    ├── sdk/             Type-only AppRouter re-export for the renderer
    └── ui/              shadcn components + Tailwind v4
```

When triaging, the **first question after classification is "where in the
tree does this land?"** The answer shapes who picks it up, what `effort:*`
to assign, and which `architecture-map` section to cite in the comment.

---

## `apps/desktop` — Electron desktop app

The desktop app is the main target. Two process surfaces:

### Main process (`apps/desktop/src/main/`)

- `index.ts` — Electron `app` lifecycle, `BrowserWindow` creation,
  `RPCHandler` from `@orpc/server/message-port` bridging the oRPC router
  to the renderer over a `MessagePort`. Wires `initDatabase()` +
  `runMigrations()` at boot.
- `settings.ts` — the Electron-side `electron-store`-backed settings
  registry (see the F2 settings architecture ADR for the design).
- `projects.ts` — Electron-side handlers for the recent-projects IPC.

### Preload (`apps/desktop/src/preload/`)

- `index.ts` — preload script. Per the security model this is a
  `MessagePort` forwarder only; it does **not** expose Node APIs to the
  renderer.

### Typical issue types filed here

- `BrowserWindow` `webPreferences` regressions (context isolation,
  sandbox, `nodeIntegration`, `preload` path).
- IPC / MessagePort bridge failures (a procedure called from the
  renderer times out or never resolves).
- Electron lifecycle bugs: second-instance, macOS dock activation,
  window state persistence, `before-quit` cleanup.
- `electron-builder` packaging issues (codesign, notarize, asar
  unpacking rules in `electron-builder.json`).
- `electron.vite.config.ts` build regressions — main, preload, and
  renderer bundles are produced from one config.

### Effort signals

- A single-file preload or main change → `effort: s`.
- New IPC channel end-to-end (preload + main + oRPC + UI consumer) → `effort: m`.
- A platform-packaging or signing issue that needs a Mac/Windows machine → `effort: m` minimum, often `effort: l`.

---

## `apps/web` — TanStack Router SPA

Renderer-side SPA, file-based routing, no SSR. Key entry points:

- `src/main.tsx` — `createRoot` + `RouterProvider`. **Critical**: the
  oRPC client (via `initORPC` in `src/lib/orpc.ts`) must be awaited here
  before first render; do not push it into a route's `useEffect`.
- `src/router.tsx` — router config.
- `src/routes/` — file-based routes. `_app.settings.tsx` and
  `_app.settings.$section.tsx` are the v2 settings routes; `_app.index.tsx`
  is the home.
- `src/components/` — local components grouped by feature (`headers/`,
  `settings/`, `sidebars/`).
- `src/hooks/` — `useRecentProjects`, `useSettings`, `useUpdateSetting`
  (consumed by both web and desktop-side consumers via the SDK).
- `src/lib/orpc.ts` — the oRPC client init.
- `src/lib/theme-init.ts` — initial theme application to avoid FOUC.
- `src/settings/app-settings.ts` — edit-time settings extension registry
  (the F2/F3 edit-time extensibility point).
- `src/i18n/` — i18next setup + `locales/`.
- `src/styles.css` — Tailwind v4 entry with `@source` directives.

### Typical issue types filed here

- TanStack Router typegen drift (`routeTree.gen.ts` not regenerated).
- React 19 hydration / Suspense boundary errors.
- shadcn component regressions (a Radix primitive stops working after a
  bump — usually pinned in `packages/ui`).
- oRPC client init race conditions (the bootstrap-at-boot rule).
- i18n missing keys (`languages.ts` out of sync with `locales/`).
- Settings panel section rendering / persistence bugs.

### Effort signals

- Component tweak or i18n string fix → `effort: xs` to `s`.
- A new route + its loader + its settings section → `effort: m`.

---

## `packages/api` — oRPC server router

The contract surface. Everything the renderer can call goes through here.

- `src/index.ts` — exports `createRouter(db, settingsStore)` and the
  inferred `AppRouter` type.
- `src/routes/` — procedure groups: `system/`, `users/`, `projects.ts`,
  `settings.ts`, plus the F2 `src/settings/` subdirectory.

### Typical issue types filed here

- Zod schema drift: input shape on the client doesn't match the server,
  producing a runtime parse error in `RPCHandler`.
- Missing or wrong procedure (the renderer asks for something that
  doesn't exist).
- AppRouter type breakages (the type-only re-export in `packages/sdk`
  goes red).
- Contract changes that need a coordinated client + server bump.

### Effort signals

- Adding a new Zod field → `effort: xs`.
- A new procedure group → `effort: m`.
- Renaming or restructuring a top-level namespace → `effort: l`, almost
  always paired with a proposed migration plan in the triage comment.

---

## `packages/db` — Drizzle ORM + better-sqlite3

The data layer. Two surfaces:

- `src/client.ts` — `initDatabase({ dataPath, backup })` and
  `closeSqlite()`. **Factory pattern, no module globals** — every
  caller gets its own handle. Critical for test isolation.
- `src/migrator.ts` — `runMigrations(handle)` — applied at desktop
  boot in `apps/desktop/src/main/index.ts`.
- `src/schema/` — table definitions. Currently
  `recent-projects.ts` and `recent-projects-repository.ts` (plus
  `index.ts` barrel); the F2 settings live in the renderer-side
  `app-settings.ts` and the desktop-side `electron-store` registry, not
  here.
- `drizzle/` — generated SQL migrations (committed):
  `0000_marvelous_hawkeye.sql`, `0001_wonderful_the_enforcers.sql`.

### Typical issue types filed here

- Migration reversibility: a migration breaks on a populated `global.db`.
- Migration idempotency: `runMigrations` rerunning on an already-applied
  schema produces an error.
- `initDatabase` factory misuse: someone caches the handle at module
  scope and the tests break.
- Schema column rename without a back-compat alias — breaks older
  clients reading the SQLite file directly.

### Effort signals

- A new table → `effort: s` to `m` (table + repository + Drizzle schema
  + migration + UI consumer).
- A destructive schema change (column drop, type change) → `effort: m`
  minimum, almost always `effort: l` with a multi-step plan.

---

## `packages/sdk` — type-only AppRouter re-export

Pure type surface for the renderer. No runtime code.

- `src/router.ts` — re-exports the `AppRouter` type from
  `@electron-template/api`.
- `src/index.ts` — public surface.

### Typical issue types filed here

- Type-only breakage: a rename in `packages/api` is not propagated
  here and the renderer's oRPC client loses inference.
- Accidentally importing runtime code from `packages/api` into the
  renderer (must remain type-only to keep the renderer bundle clean).

Almost always `effort: xs`. Fix is a one-line re-export.

---

## `packages/ui` — shadcn components + Tailwind v4

Shared component library, consumed by `apps/web`.

- `src/components/` — shadcn primitives (button, input, card, dialog,
  sidebar, sonner, etc.). New components are added here, not in
  `apps/web/src/components/`.
- `src/hooks/use-mobile.ts` — the one shared hook.
- `src/lib/utils.ts` — `cn()` and other helpers.
- `src/styles/globals.css` — Tailwind v4 theme variables + `@source`
  directives.
- `index.ts` — public surface (what the renderer imports).

### Typical issue types filed here

- Tailwind v4 `@source` directive drift across workspace boundaries
  (Tailwind v4 does not cross workspace boundaries — see the shadcn
  monorepo pattern ADR).
- A Radix primitive bump that breaks a shadcn wrapper.
- Class-variance-authority variant regressions on a shared component.
- Missing component in `index.ts` (added to `components/` but not
  re-exported).

### Effort signals

- A new shadcn component → `effort: s`.
- A cross-package style migration (e.g. Tailwind v4 → v5 when it ships)
  → `effort: l` and almost always paired with a feature-flag rollout.

---

## Cross-cutting flows worth knowing

These recur across the tree and are worth naming when you see them in
an issue body:

- **Settings end-to-end**: `apps/web/src/settings/app-settings.ts` →
  `packages/api/src/routes/settings.ts` → `apps/desktop/src/main/settings.ts`
  → `electron-store`. A regression anywhere in that chain looks like a
  settings bug to the user; the fix lives wherever the chain broke.
- **Recent projects end-to-end**: `apps/web/src/hooks/useRecentProjects.ts`
  → `packages/api/src/routes/projects.ts` → `apps/desktop/src/main/projects.ts`
  → `packages/db/src/schema/recent-projects.ts`.
- **i18n**: `apps/web/src/i18n/languages.ts` → `apps/web/src/i18n/locales/<lang>/...`.
  A missing locale is `type: docs`, `effort: xs` to `s`.
- **Build / CI**: every `apps/*` and `packages/*` has its own
  `lint-*`, `typecheck-*`, `build-*`, `test-*` workflow — one
  workflow per action, per the CI/CD philosophy in `CLAUDE.md`. A
  failing workflow name tells you exactly which gate tripped.

---

## Anti-patterns (when triaging)

- Don't file an Electron IPC issue against `packages/api`. IPC is the
  transport; the procedure contract lives in `packages/api`, the wiring
  lives in `apps/desktop`.
- Don't file a renderer-only visual bug against `packages/ui` unless
  the component is genuinely broken at the package level — most visual
  regressions are `apps/web/src/components/...` local code.
- Don't propose `packages/sdk` as the place to fix a runtime bug. It's
  type-only by design.