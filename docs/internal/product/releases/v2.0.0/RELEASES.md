# V2.0 Release Plan

**Version:** 2.x series
**Date:** 2026-06-22
**Status:** Proposed
**Branch target:** `dev`

---

## Overview

V2.0 is decomposed into 4 independent releases. Each release is **compilable, testable, and user-visible on its own**. No release leaves the app in a broken state.

**Dependency chain:**
```
V2.1.0  (Architecture Foundation)
  └── V2.2.0  (Settings System)
        └── V2.3.0  (Sidebar + Theming)
              └── V2.4.0  (Projects Page)
```

V2.1 must land before V2.2. V2.2 must land before V2.3. V2.3 must land before V2.4. Within a release, individual features can be implemented in parallel by separate agents.

---

## Release Summary

| Release | Name | Features | Effort | User-visible |
|---|---|---|---|---|
| **V2.1.0** | Architecture Foundation | F5 | ~10–16h | No — infrastructure only |
| **V2.2.0** | Settings System | F2 | ~8–13h | Yes — language + theme toggle |
| **V2.3.0** | Sidebar + Theming | F1 + F3 | ~10–14h | Yes — navigation + dark mode |
| **V2.4.0** | Projects Page | F4 | ~8–11h | Yes — create/open/delete projects |
| **Total** | | | **~36–54h** | |

---

## V2.1.0 — Architecture Foundation

**Target:** First buildable release. Sets up the persistence backbone for every future feature.

### Motivation

Everything in V2 is built on two foundations:
1. **`electron-store`** — typed, persisted, survives restarts
2. **Hybrid DB** — `global.db` (metadata) + per-project `data.db` (user content)

These foundations must exist before any feature can store data. Implementing them later would require rewriting every feature that touches persistence.

### Features

| ID | Feature | Spec |
|---|---|---|
| F5 | [Project Architecture](../features/05-project-architecture.md) | Hybrid DB: `global.db`, per-project `data.db`, `withProject` helpers, `nanoid` IDs, `electron-store` |

### What ships in V2.1.0

- `electron-store` configured in `apps/desktop/src/main/settings.ts`
- `global.db` with `projects`, `audit_log`, `project_templates` tables
- `schema/global/` Drizzle module
- `schema/project-base.ts` with `withProject()` helpers
- `initProjectDb` / `openProject` / `closeProject` in main process
- oRPC context with `globalDb`, `projectDb`, `store`, `mainProcess` services
- No UI changes — the app looks identical to V1

### File inventory

```
apps/desktop/src/main/settings.ts          NEW
apps/desktop/src/main/index.ts           MODIFIED  (globalDb, openProject, closeProject)
packages/db/src/schema/global/
  index.ts                             NEW
  projects.ts                           NEW
  audit-log.ts                         NEW
  project-templates.ts                  NEW
packages/db/src/schema/project-base.ts  NEW
packages/db/src/schema/project/
  index.ts                             NEW
  users.ts                             MODIFIED  (use primaryId, timestamps)
  posts.ts                             MODIFIED  (use primaryId, timestamps)
packages/db/drizzle/                   NEW  (migrations for global tables)
packages/api/src/routes/settings.ts      NEW  (getSettings, updateSettings — no UI yet)
packages/api/src/routes/index.ts         MODIFIED
packages/api/src/routes/projects.ts      NEW  (listProjects, createProject — no UI yet)
packages/api/src/routes/index.ts         MODIFIED
```

### Effort

| Phase | Estimate |
|---|---|
| `electron-store` setup + global DB | 2–3h |
| Drizzle schema: `global/` + `project-base/` | 2–3h |
| Migrations | 1–2h |
| Main process: `openProject`/`closeProject` wiring | 2–3h |
| oRPC context: `globalDb`/`projectDb` in handler | 1–2h |
| oRPC procedures: `getSettings`, `updateSettings`, `listProjects`, `createProject` | 2–3h |
| **Total** | **10–16h** |

### Acceptance criteria

- [ ] `electron-store` writes `config.json` in `userData`
- [ ] `global.db` exists with `projects`, `audit_log`, `project_templates` tables
- [ ] `client.getSettings()` returns correct defaults via oRPC
- [ ] `client.updateSettings({ key: 'language', value: 'fr' })` persists to `config.json`
- [ ] `client.createProject({ name: 'Test', rootPath: '/tmp/test' })` creates `global.db` entry + `.electron-template/data.db`
- [ ] `client.listProjects()` returns the created project
- [ ] `pnpm --filter api test` green
- [ ] `pnpm --filter db test` green
- [ ] App still launches and renders the V1 demo page (no regressions)

### Out of scope

- Settings UI (V2.2)
- Sidebar (V2.3)
- Projects page UI (V2.4)
- TanStack Query hooks
- Audit log UI
- Project templates UI

---

## V2.2.0 — Settings System

**Target:** Settings page. The app remembers language and theme across restarts.

### Motivation

V2.1 exposes `getSettings`/`updateSettings` but there's no UI to use them. V2.2 adds the Settings page with `@tanstack/react-query` hooks, the i18n integration, and the language/theme persistence. This is the first **user-visible new capability** of V2.

### Prerequisites

- ✅ V2.1.0 must be merged

### Features

| ID | Feature | Spec |
|---|---|---|
| F2 | [Settings System](../features/02-settings-system.md) | `electron-store` persistence, `useSettings`/`useUpdateSetting` hooks, Settings page |

### What ships in V2.2.0

- `@tanstack/react-query` added to `apps/web`
- `useSettings()` / `useUpdateSetting()` hooks
- Settings page at `/settings` (three tabs: Language / Appearance / Projects)
- Language persisted to `electron-store` — survives restart
- Theme persisted to `electron-store` — survives restart
- `LanguageSwitcher` removed from `__root.tsx` (replaced by Settings page)
- `i18n.init()` moved out of module-load side-effect

### New components (shadcn)

| Component | Command |
|---|---|
| `Tabs` | `pnpm ui:add tabs` |
| `Switch` | `pnpm ui:add switch` |

### File inventory

```
apps/web/src/hooks/useSettings.ts       NEW
apps/web/src/hooks/useUpdateSetting.ts NEW  (or inline in useSettings.ts)
apps/web/src/components/settings/
  index.ts                            NEW
  language-select.tsx                  NEW
  theme-select.tsx                    NEW
apps/web/src/routes/settings.tsx       NEW
packages/ui/src/components/tabs.tsx   NEW  (shadcn add)
packages/ui/src/components/switch.tsx NEW  (shadcn add)
packages/ui/src/components/index.ts   MODIFIED
apps/web/src/routes/__root.tsx        MODIFIED  (remove LanguageSwitcher)
apps/web/src/i18n/index.ts           MODIFIED  (remove module-load init side-effect)
apps/web/package.json                 MODIFIED  (add @tanstack/react-query)
packages/api/src/routes/settings.ts  MODIFIED  (add getSettings, updateSettings)
```

### Effort

| Phase | Estimate |
|---|---|
| TanStack Query integration | 1–2h |
| `useSettings`/`useUpdateSetting` hooks | 1–2h |
| Settings page + LanguageSelect | 2–3h |
| i18n flow: remove module-load side-effect, integrate with settings | 1–2h |
| `LanguageSwitcher` removal | 30min |
| Polish: Toaster confirmations, form validation | 1h |
| **Total** | **7–11h** |

### Acceptance criteria

- [ ] `/settings` page renders with three tabs
- [ ] Changing language to "Français" updates all strings immediately
- [ ] Reloading the page keeps "Français" as the language
- [ ] `config.json` contains `language: "fr"` after change
- [ ] `useSettings()` and `useUpdateSetting()` work with TanStack Query cache
- [ ] No `i18n.init()` side-effect on module load
- [ ] `pnpm --filter web typecheck` green
- [ ] `pnpm --filter web build` green

### Out of scope

- Sidebar navigation (V2.3)
- Theming (V2.3)
- Projects page (V2.4)
- Theme application in CSS (V2.3)

---

## V2.3.0 — Sidebar + Theming

**Target:** The app looks like a real product. Sidebar navigation, dark mode, and `⌘K` command palette.

### Motivation

V2.2 has a working Settings page but the app still looks like the V1 demo. V2.3 replaces the V1 top-bar with the sidebar layout and ships the full theming system. After V2.3, the app has a recognizable product identity.

### Prerequisites

- ✅ V2.2.0 must be merged

### Features

| ID | Feature | Spec |
|---|---|---|
| F1 | [Sidebar Navigation](../features/01-sidebar-navigation.md) | shadcn v4 Sidebar, `_app`/`_sidebar` layout routes, collapse state |
| F3 | [Theming](../features/03-theming.md) | Light/Dark/System, `.dark` class, `applyTheme`, OS preference listener |

### What ships in V2.3.0

- **Sidebar** (shadcn v4 `Sidebar` component)
- **`_app.tsx`** — app shell, applies theme/i18n on mount
- **`_sidebar.tsx`** — layout route with sidebar nav
- **Sidebar nav items:** Projects, Settings
- **Sidebar collapse:** persisted to `electron-store` (from V2.1)
- **Theming:** `ThemeSelect` on Settings page works
- **Dark mode:** `.dark` class applied to `<html>`, all components styled
- **System theme:** `prefers-color-scheme` listener updates theme in real-time
- **`⌘K` palette:** commands: Go to Projects, Go to Settings, Toggle Sidebar
- **`ThemeSelect` component** active and functional

### New components (shadcn)

| Component | Command |
|---|---|
| `Sidebar` | `pnpm ui:add sidebar` |
| `Tooltip` | `pnpm ui:add tooltip` |

### File inventory

```
apps/web/src/routes/_app.tsx            NEW
apps/web/src/routes/_sidebar.tsx       NEW
apps/web/src/routes/__root.tsx        MODIFIED  (simplify: devtools only)
apps/web/src/lib/theme.ts              NEW
apps/web/src/components/settings/
  theme-select.tsx                   MODIFIED  (now functional with full theming)
packages/ui/src/components/sidebar.tsx NEW  (shadcn add)
packages/ui/src/components/tooltip.tsx NEW  (shadcn add)
packages/ui/src/components/index.ts   MODIFIED
```

### Effort

| Phase | Estimate |
|---|---|
| `theme.ts`: `getEffectiveTheme`, `applyTheme` | 30min |
| `_app.tsx`: settings init, theme/i18n application | 1–2h |
| `_sidebar.tsx`: layout route + shadcn Sidebar setup | 2–3h |
| Sidebar nav items + active state | 1h |
| Sidebar collapse + persistence | 1h |
| `⌘K` command palette: keyboard listener + commands | 1–2h |
| Theming: CSS `.dark` block, `ThemeSelect` integration | 1–2h |
| System preference: `matchMedia` listener | 1h |
| Mobile: sidebar overlay mode | 1h |
| **Total** | **10–14h** |

### Acceptance criteria

- [ ] Sidebar is visible on the left on desktop
- [ ] Clicking nav items navigates without full page reload
- [ ] Active route is visually highlighted in sidebar
- [ ] Collapsing sidebar reduces it to icon-only mode with tooltips
- [ ] Collapsed state persists after reload
- [ ] `⌘K` opens command palette
- [ ] "Go to Settings" in palette navigates to `/settings`
- [ ] Theme card on Settings page works: Light/Dark/System all apply immediately
- [ ] `<html class="dark">` present when Dark mode is selected
- [ ] Switching OS dark mode while "System" is selected updates the app
- [ ] No flash of wrong theme on cold start
- [ ] TanStack Devtools still visible in `__root.tsx` (not hidden by sidebar)

### Out of scope

- Projects page (V2.4)
- Project detail routes (`/projects/:id`)
- Per-project settings

---

## V2.4.0 — Projects Page

**Target:** The app has a real use case. Users can create projects, each with an isolated SQLite database.

### Motivation

V2.3 has a beautiful product shell but no real functionality. V2.4 replaces the V1 demo (`oRPC ping + user creation`) with a real Projects page. This is the **payoff release** — the moment where V2 becomes a product that does something useful.

### Prerequisites

- ✅ V2.3.0 must be merged

### Features

| ID | Feature | Spec |
|---|---|---|
| F4 | [Projects Page](../features/04-projects-page.md) | Projects list, create/delete projects, folder picker, per-project DB |

### What ships in V2.4.0

- **Projects list** at `/` (replaces V1 demo page)
- **Empty state** with illustrated CTA on first launch
- **`CreateProjectDialog`** — name, description, folder picker via native dialog
- **Project cards** — name, description, `updatedAt`, last accessed
- **Open project** — initializes per-project `data.db` in main process
- **Delete project** — removes from `global.db`, keeps `.electron-template/` on disk
- **`recentProjects`** in `electron-store` — sidebar shows recent projects
- **V1 demo removal** — `client.ping()` demo replaced by real functionality
- **Audit log entries** created on every `createUser`, `deleteUser`, `createProject`

### File inventory

```
packages/api/src/routes/projects.ts       MODIFIED  (openProject, deleteProject)
apps/web/src/hooks/useProjects.ts       NEW
apps/web/src/hooks/useCreateProject.ts  NEW  (or inline)
apps/web/src/hooks/useDeleteProject.ts NEW  (or inline)
apps/web/src/routes/index.tsx           MODIFIED  (replace demo → Projects list)
apps/web/src/components/projects/
  index.ts                             NEW
  project-card.tsx                     NEW
  create-project-dialog.tsx            NEW
  delete-project-dialog.tsx            NEW
  empty-state.tsx                      NEW
apps/web/package.json                   MODIFIED  (add nanoid)
packages/db/drizzle/0001_projects.sql  NEW  (global.db: projects table)
```

### Effort

| Phase | Estimate |
|---|---|
| `useProjects`, `useCreateProject`, `useDeleteProject` hooks | 1h |
| Projects list page | 1–2h |
| Project card component | 1h |
| `CreateProjectDialog` with folder picker | 2–3h |
| `openProject` / `closeProject` / `closeProject` main process wiring | 1h |
| `deleteProject` with AlertDialog confirmation | 1h |
| Empty state illustration | 30min |
| V1 demo removal (migrate `index.tsx`) | 1h |
| **Total** | **8–11h** |

### Acceptance criteria

- [ ] Projects list renders on `/`
- [ ] Empty state shown on first launch
- [ ] "New Project" opens the dialog
- [ ] "Browse" opens native folder picker
- [ ] Creating a project creates `{root}/.electron-template/data.db`
- [ ] Creating a project adds it to the list
- [ ] Deleting a project removes it from the list
- [ ] `config.json` updated in `recentProjects` on open
- [ ] Audit log entry created in `global.db` for every write operation
- [ ] `pnpm --filter db migrate` green
- [ ] `pnpm --filter api test` green
- [ ] App looks like a real product (not a demo)

### Out of scope

- Project detail routes (`/projects/:id`) — V2.5
- Per-project settings — V2.5
- Full-text search — V2.5
- Project templates UI — V2.5
- Multi-window — V2.6+

---

## Prerequisites — What Must Land First

Before V2.1.0 development begins, these V1 remediation PRs must be merged to `dev`:

| PR | Item | Blocks |
|---|---|---|
| #1 | `fix-imports.mjs` → tsconfig paths | All (wrong import paths break the build) |
| #2 | SSR half-wiring resolved (C3) | F2 (i18n side-effect conflict with SSR) |
| #5 | Node 22.13 across CI | All (wrong Node version in CI) |

See `docs/plans/template-audit-remediation.md` §6 for the full V1 remediation sequence.

---

## Quality Gates (All Releases)

Every release must pass before merging to `dev`:

- `pnpm install --frozen-lockfile` clean
- `pnpm --filter web typecheck` green
- `pnpm --filter api typecheck` green
- `pnpm --filter db typecheck` green
- `pnpm --filter api test` green
- `pnpm --filter db test` green
- `pnpm build:web` succeeds
- `pnpm build:desktop` succeeds (Windows x64)
- Manual: app launches, no console errors
- Manual: settings persist across restart
- Manual: sidebar navigation works
- Manual: dark mode applies to all components

---

## Post-V2.4: What's Next

| Release | Content |
|---|---|
| V2.5 | Project detail routes (`/projects/:id`), per-project settings, FTS5 search |
| V2.6 | Multi-window (each project in its own window), collaboration |
| V2.7 | Audit log UI, project export/import, templates gallery |

---

## Changelog Format

Each release adds a `CHANGELOG.md` entry:

```markdown
## [2.4.0] — YYYY-MM-DD

### Added
- **Projects Page**: create, open, and delete projects with isolated SQLite databases

### Changed
- Replaced V1 demo page with Projects list

### Fixed
- [from V1 audit]
```

The `release-manager` agent owns the changelog and version bump for each release.

---

## Related Documents

| Document | Description |
|---|---|
| `SPEC.md` | Full product spec with all features |
| `features/01-sidebar-navigation.md` | F1 spec |
| `features/02-settings-system.md` | F2 spec |
| `features/03-theming.md` | F3 spec |
| `features/04-projects-page.md` | F4 spec |
| `features/05-project-architecture.md` | F5 spec |
| `docs/plans/template-audit-remediation.md` | V1 remediation — must land first |
