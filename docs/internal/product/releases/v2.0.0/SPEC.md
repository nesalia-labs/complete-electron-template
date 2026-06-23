# V2.0.0 Specification

**Version:** 2.0.0
**Date:** 2026-06-22
**Status:** Approved
**Branch target:** `dev`

---

## 1. Overview

V2.0 transforms `complete-electron-template` from a single-page demo app into a real desktop application shell with sidebar navigation, persistent settings, theming, and project management.

> **TL;DR:** Sidebar layout, settings (language + theme) persisted via `electron-store` + oRPC, light/dark/system theme, Projects page with per-project SQLite databases.

---

## 2. Features

| ID | Feature | Package | Status | Release |
|---|---|---|---|---|
| F5 | [Project Architecture](features/05-project-architecture.md) | `packages/db`, `apps/desktop` | Spec approved | V2.1.0 |
| F2 | [Settings System](features/02-settings-system.md) | `apps/desktop`, `apps/web`, `packages/api` | Spec approved | V2.2.0 |
| F1 | [Sidebar Navigation](features/01-sidebar-navigation.md) | `apps/web`, `packages/ui` | Spec approved | V2.3.0 |
| F3 | [Theming](features/03-theming.md) | `apps/web`, `packages/ui` | Spec approved | V2.3.0 |
| F4 | [Projects Page](features/04-projects-page.md) | `apps/web`, `packages/api`, `packages/db` | Spec approved | V2.4.0 |

**See [RELEASES.md](RELEASES.md) for the full release sequencing, effort breakdown, and acceptance criteria per release.**

**Total estimated effort:** ~36–54h

---

## 3. Architecture Decisions (Final)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Settings scope | Apps built with the template | Single-workspace V2.0, multi-workspace V2.1 |
| D2 | Settings storage | `electron-store` (main process) | Shared across windows, survives restart |
| D3 | Settings sync | Read on mount | Simple, sufficient for V2.0 |
| D4 | DB architecture | Hybrid (global.db + per-project data.db) | Best isolation + cross-project queries |
| D5 | TanStack Query | Re-add `@tanstack/react-query` | Required for `useSettings`/`useProjects` |
| D6 | Theme flash | `useEffect` in `_app.tsx` | Sufficient for CSR; SSR-ready inline script deferred |

---

## 4. Technical Summary

### 4.1 Persistence Architecture

```
electron-store (config.json)      → language, theme, sidebarCollapsed, recentProjects
global.db (userData/global.db)   → projects, audit_log, project_templates
{projectRoot}/.electron-template/data.db  → users, posts (per project)
```

### 4.2 New Route Tree

```
apps/web/src/routes/
__root.tsx                    ← TanStack Devtools (unchanged)
_app.tsx                      ← App shell: settings init, theme/i18n
_sidebar.tsx                 ← Layout: shadcn v4 Sidebar + <Outlet />
  index.tsx                  ← /  → Projects list
  settings.tsx               ← /settings  → Settings page (Tabs)
  projects.$id.tsx           ← /projects/:id  → V2.1
```

### 4.3 oRPC Procedures Added

| Procedure | Context used | Purpose |
|---|---|---|
| `getSettings` | `store` | Read global preferences |
| `updateSettings` | `store` | Write global preference |
| `listProjects` | `globalDb` | List all projects |
| `createProject` | `globalDb`, `projectDb` | Create project + init DB |
| `deleteProject` | `globalDb` | Delete project metadata |
| `openProject` | `globalDb`, `projectDb`, `store` | Open project, init DB, update recent |
| `getAuditLog` | `globalDb` | V2.1 — audit trail across projects |

### 4.4 Components Added (shadcn)

| Component | Command |
|---|---|
| `Sidebar` | `pnpm ui:add sidebar` |
| `Tooltip` | `pnpm ui:add tooltip` |
| `Tabs` | `pnpm ui:add tabs` |
| `Switch` | `pnpm ui:add switch` |

Existing components used: `Card`, `Button`, `Input`, `Dialog`, `AlertDialog`, `Select`, `NativeSelect`, `Avatar`, `ScrollArea`, `Separator`, `Toaster` (sonner), `Command`, `CommandDialog` (cmdk).

### 4.5 Dependencies Added

| Package | Version | Reason |
|---|---|---|
| `@tanstack/react-query` | `^5.x` | Settings + project query/mutation hooks |
| `@electron-template/ui` (existing) | workspace:* | All UI components |
| `nanoid` | `^5.x` | Collision-free project/record IDs |

---

## 5. Files Summary

| Package | New | Modified | Deleted |
|---|---|---|---|
| `apps/desktop` | 1 (`settings.ts`) | 1 (`main/index.ts`) | 0 |
| `apps/web` | 9 (`_app.tsx`, `_sidebar.tsx`, `settings.tsx`, `index.tsx`, `lib/theme.ts`, `hooks/useSettings.ts`, `hooks/useProjects.ts`, `components/settings/*.tsx`) | 2 (`__root.tsx`, `router.tsx`) | 0 |
| `packages/api` | 2 (`routes/settings.ts`, `routes/projects.ts`) | 1 (`routes/index.ts`) | 0 |
| `packages/db` | 5 (`schema/global/`, `schema/project-base.ts`, `schema/project/`, migrations, templates) | 2 (`schema/index.ts`, existing migrations) | 0 |
| `packages/ui` | 4 (`sidebar.tsx`, `tooltip.tsx`, `tabs.tsx`, `switch.tsx`) | 1 (`components/index.ts`) | 0 |
| **Total** | **~22** | **~7** | **0** |

---

## 6. Out of Scope

- Multi-window (V2.1)
- Per-project settings (V2.1)
- Full-text search / FTS5 (V2.1)
- Audit log UI (V2.1)
- Project templates UI (V2.1)
- Custom primary color picker (V2.1)
- Collaboration / multi-user (V2.2+)
- macOS code signing, notarization, auto-update

---

## 7. Prerequisites (Must Land First)

V2.1.0 ships **after** these V1 remediation PRs are merged:

| PR | Item | Blocks |
|---|---|---|
| PR #1 | `fix-imports.mjs` → tsconfig paths | All (wrong import paths break the build) |
| PR #2 | SSR half-wiring resolved (C3) | V2.2 (i18n side-effect conflict) |
| PR #5 | Node 22.13 across CI | All (wrong Node version in CI) |

See `docs/plans/template-audit-remediation.md` §6 for the full V1 remediation sequence.

**Release sequence:** V2.1.0 → V2.2.0 → V2.3.0 → V2.4.0. See [RELEASES.md](RELEASES.md).

---

## 8. Quality Gates

All must pass before V2.0 ships to `staging`:

### Functional
- `pnpm install --frozen-lockfile` clean
- `pnpm --filter web typecheck` green
- `pnpm --filter api typecheck` green
- `pnpm --filter db typecheck` green
- `pnpm --filter api test` green
- `pnpm --filter db test` green
- `pnpm build:web` succeeds
- `pnpm build:desktop` succeeds (Windows x64)
- Manual: app launches, sidebar visible, theme toggle works, project can be created
- Manual: `config.json` is human-readable JSON in `userData`
- Manual: creating a project creates `{root}/.electron-template/data.db`
- Manual: `global.db` contains projects + audit_log tables

### UX (from UX-AUDIT.md)
- [ ] Every submit button has `disabled={isPending}` during submission
- [ ] `updateSettings` error calls `toast.error(t('errors.settingsWriteFailed'))`
- [ ] All 17 new i18n keys defined in `en/`, `fr/`, `es/common.json`
- [ ] No hardcoded English strings in JSX components
- [ ] Active sidebar nav item has `aria-current="page"`
- [ ] Theme card container has `role="radiogroup"` with `aria-label`
- [ ] Sidebar footer shows "⌘K to search" hint
- [ ] `Ctrl+N` opens CreateProjectDialog
- [ ] `Ctrl+,` navigates to `/settings`
- [ ] Sidebar collapse: CSS transition 200ms ease-in-out
- [ ] Theme switch: CSS transition 150ms ease
- [ ] Error dialog on stale `dbPath` with recovery options
- [ ] Dead i18n keys removed from `common.json` in V2.4.0

---

## 9. Migration Notes

### V1 → V2 Migration Path

Existing V1 demo data (`users`, `posts` in the default `data.db`) is **not migrated**. V2 ships with an empty project for new users. Users who have created data in V1 can export it manually before switching to V2.

The project DB structure changes from:
```
data.db  (V1 — single-project, no isolation)
```
to:
```
userData/
  global.db      (V2 — projects metadata)
  data.db        (V1 data — keep it, don't delete)

{projectRoot}/.electron-template/
  data.db        (V2 — per-project, isolated)
```

Migration strategy documented in `docs/plans/v2-migration.md` (to be written before V2.0 ships).

---

## 10. Related Documents

| Document | Description |
|---|---|
| `features/01-sidebar-navigation.md` | Full spec for F1 |
| `features/02-settings-system.md` | Full spec for F2 |
| `features/03-theming.md` | Full spec for F3 |
| `features/04-projects-page.md` | Full spec for F4 |
| `features/05-project-architecture.md` | Full spec for F5 |
| `features/README.md` | Feature index, dependencies, file count |
| `docs/plans/template-audit-remediation.md` | V1 remediation — must land before V2.0 |
| `docs/internal/security.md` | Electron security posture |
| `docs/internal/ipc-contract.md` | oRPC MessagePort bridge |
| `docs/internal/ssr-decision.md` | Why SSR was deferred |
