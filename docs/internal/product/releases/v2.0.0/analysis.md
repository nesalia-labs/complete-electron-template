# V2.0.0 Needs Analysis

**Date:** 2026-06-22
**Author:** Tech Lead
**Status:** Final — all architectural decisions resolved (see §7)
**Source:** Deep research — internal codebase audit + web research (adversarially verified)
**Branch:** `refactor/shadcn-monorepo-migration`

---

## 1. Context

V1 of `complete-electron-template` is a single-page demo app with two routes, a top-bar `LanguageSwitcher`, TanStack Devtools, and no layout chrome. V2 introduces a sidebar navigation shell, a settings system (language, theme, project-level preferences), and the architectural foundation for multi-workspace desktop apps built on the template.

This document is the **needs analysis** — it defines *what* V2 must support and *why*, with trade-offs surfaced for decisions that belong to the product owner. The implementation plan (the *how*) follows in a separate document.

---

## 2. V1 Starting Point

```
apps/web/src/routes/
├── __root.tsx       ← top-bar layout (LanguageSwitcher + Outlet + TanStack Devtools)
└── index.tsx        ← single demo page (oRPC ping + user creation)

packages/ui/         ← 53 shadcn components, no sidebar, no settings components
apps/web/src/i18n/   ← i18next 26.2.0, HTTP backend, en/fr/es, module-load side-effect
Tailwind CSS v4      ← no theming, no dark mode, no data-theme toggle
Settings             ← none
```

TanStack Router 1.167.4 is already installed. oRPC + MessagePort bridge is already wired between main and renderer. The DB factory pattern (`initDatabase`) and the API closure factory (`createRouter(db)`) are established patterns that V2 must not regress.

---

## 3. Feature Axes

### 3.1 Sidebar Layout

#### V1 → V2 change

```
V1:  __root.tsx (top-bar + Outlet)
     └── index.tsx (single page)

V2:  __root.tsx (TanStack Devtools shell — unchanged)
     └── _app.tsx (app shell)
         ├── _sidebar.tsx (shadcn v4 Sidebar)
         │   ├── index.tsx       (/ — Projects list)
         │   ├── projects.$id.tsx (/projects/:id — Project detail)
         │   └── settings.tsx    (/settings — Global settings)
         └── (future: nested routes per project)
```

TanStack Router v1 layout routes via `_app.tsx` and `_sidebar.tsx` (underscore prefix = layout route group convention). Multiple layout groups can coexist at the same tree level.

#### Why shadcn v4 Sidebar

shadcn v4 (`shadcn 4.7.0`, already in use) ships a **first-party `Sidebar` primitive** (`shadcn add sidebar`). It handles:
- Collapsible mode (VS Code-style resize)
- Icon-only collapsed mode with `Tooltip` on hover
- Overlay mode (mobile)
- Header, footer, content, nav, and section slots
- Keyboard navigation

This is not a custom CSS Grid solution. It replaces it.

#### Component inventory

| Component | Status | Action |
|---|---|---|
| `Sidebar` | Missing | `pnpm ui:add sidebar` (shadcn v4) |
| `SidebarHeader` | Part of Sidebar | shadcn `Sidebar` includes header slot |
| `SidebarNav` | Part of Sidebar | shadcn `Sidebar` includes nav slot |
| `SidebarFooter` | Part of Sidebar | shadcn `Sidebar` includes footer slot |
| `NavigationMenu` | Available | Reuse for sidebar sections if needed |
| `Collapsible` | Available | Reuse for collapsible sidebar sections |
| `ScrollArea` | Available | Sidebar content scroll |
| `Separator` | Available | Sidebar section dividers |
| `Command` + `CommandDialog` | Available (`cmdk` dep) | `⌘K` palette — one evening's work |
| `Avatar` | Available | User avatar in sidebar header |
| `Button` + `buttonVariants` | Available | Nav items with active state variant |
| `Tooltip` | Missing | `pnpm ui:add tooltip` (needed for collapsed sidebar) |
| `Select` | Missing | `pnpm ui:add select` (needed for settings forms) |
| `Switch` | Missing | `pnpm ui:add switch` (needed for on/off settings) |
| `Tabs` | Missing | `pnpm ui:add tabs` (needed for settings page layout) |

#### Architecture decision

| Decision | Option A | Option B |
|---|---|---|
| Sidebar collapse | Fixed-width (240px, simpler) | Collapsible + icon mode (VS Code-style) |
| **Recommendation** | | **B** — shadcn v4 Sidebar ships this out of the box; use it |

---

### 3.2 Settings System

#### Three layers of settings

```
Global (app-level)
├── Language        ← stored in electron-store, IPC to renderer
├── Theme           ← stored in electron-store, IPC to renderer
└── (future: window size, keyboard shortcuts)

Workspace (project-level)
├── Project name / metadata
├── Per-project database path
├── Feature flags (future)
└── API endpoint overrides (future)

Session (per-window, ephemeral)
├── Sidebar collapsed state
├── Active tab
└── Temporary UI filters
```

#### Where to persist — architectural fork

| Option | Layer | Sync across windows | Survives restart | Use case |
|---|---|---|---|---|
| `electron-store` | Main process | Yes (via IPC) | Yes | Global preferences (language, theme) |
| `localStorage` | Renderer | No | Yes | Ephemeral UI state only |
| `better-sqlite3` | Main process | Yes (via IPC) | Yes | App data (users, posts) — already in `packages/db` |
| CSS `data-theme` | DOM | No | No | Theme application only (not storage) |

**Recommendation:**
- Global preferences → `electron-store` (main process, typed via oRPC procedures)
- App data → `better-sqlite3` via `packages/db` (existing, unchanged)
- Ephemeral UI state → React `useState` + URL search params

**Why not SQLite for settings:**
- Settings are key-value, not relational. No SQL needed.
- `electron-store` writes a single `config.json` — easy to inspect, migrate, back up.
- `better-sqlite3` stays reserved for *application data* (users, posts — the user's content), not *application preferences*.
- The oRPC `MessagePort` bridge is already wired — settings just become two more procedures.

#### Settings schema (electron-store)

```typescript
// apps/desktop/src/main/settings.ts
import Store from 'electron-store'

interface GlobalSettings {
  language: 'en' | 'fr' | 'es'
  theme: 'light' | 'dark' | 'system'   // system = prefers-color-scheme
  recentProjects: string[]              // project IDs, max 10
}

const store = new Store<GlobalSettings>({
  defaults: {
    language: 'en',
    theme: 'system',
    recentProjects: [],
  },
})
```

#### Settings persistence flow

```
electron-store (main)
        ↓ on app ready (oRPC startup)
renderer: client.getSettings(['language', 'theme'])
        ↓
renderer: apply theme
  const theme = (stored === 'system')
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : stored
  document.documentElement.classList.toggle('dark', theme === 'dark')
        ↓
renderer: apply language
  i18n.changeLanguage(stored)
```

#### The oRPC procedures

```typescript
// packages/api/src/routes/settings.ts
export const getSettings = os
  .input(z.object({ keys: z.array(z.string()).optional() }))
  .handler(({ input }) => store.get(input.keys ?? []))

export const updateSettings = os
  .input(z.object({ key: z.string(), value: z.unknown() }))
  .handler(({ input }) => {
    store.set(input.key, input.value)
    // Broadcast change to all windows via ipcMain broadcast
  })
```

The main process exposes these via the existing `RPCHandler` (the `start-orpc-server` IPC is already wired in `apps/desktop/src/main/index.ts`). The renderer calls `client.getSettings(...)` and `client.updateSettings(...)` over the same MessagePort used for `client.ping(...)` today.

---

### 3.3 i18n + Theme

#### Language

V1 already has:
- `i18next 26.2.0` with HTTP backend
- `LanguageSwitcher` component in `apps/web/src/components/`
- Translation files at `apps/web/public/i18n/locales/{en,fr,es}/common.json`
- Module-load side-effect in `apps/web/src/i18n/index.ts`

V2 changes:
1. **Persist to `electron-store`** — `i18n.changeLanguage(lang)` called on settings load, not module init
2. **Move `LanguageSwitcher`** — from the top bar to the sidebar header or `/settings` page
3. **Remove module-load side-effect** — `apps/web/src/i18n/index.ts` must not call `.init()` at import time; init moves into a `beforeLoad` guard or the router setup

#### Theme

Tailwind v4 CSS variable theming (shadcn default):

```css
/* packages/ui/src/styles/globals.css */
@theme {
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 3.9%);
  /* ... shadcn light defaults */
}

.dark {
  --color-background: hsl(0 0% 3.9%);
  --color-foreground: hsl(0 0% 98%);
  /* ... dark overrides */
}
```

Application:

```typescript
// In app layout route (_app.tsx or beforeLoad)
const theme = getEffectiveTheme(settings.theme) // 'light' | 'dark'
document.documentElement.classList.toggle('dark', theme === 'dark')
```

Three options for the user: `light`, `dark`, `system` (default). System detection:

```typescript
const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
```

---

### 3.4 Project-Specific Settings

#### Scope phases

| Phase | Scope | Description |
|---|---|---|
| **V2.0** | Single-workspace | One app, one project at a time. Global settings. Projects page lists + creates projects. Each project has its own SQLite DB. |
| **V2.1+** | Multi-workspace | Multiple projects open simultaneously. Per-project settings. Multi-window if needed. |

#### V2.0 Projects page

```
routes/
├── _app.tsx                 ← app shell (sidebar + content)
│   ├── _sidebar.tsx         ← sidebar nav (Projects, Settings)
│   │   ├── index.tsx        ← / (Projects list — redirect or card grid)
│   │   ├── projects.$id.tsx ← /projects/:id (Project detail — future)
│   │   └── settings.tsx     ← /settings (Global settings)
```

**Projects table** (new, in `packages/db/src/schema/`):

```typescript
// packages/db/src/schema/projects.ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),       // nanoid
  name: text('name').notNull(),
  description: text('description'),
  dbPath: text('db_path').notNull(),  // relative to project root
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
```

Each project has its own SQLite file at `{projectRoot}/.electron-template/data.db`. The main process resolves `dbPath` per project. Opening a project initializes a new `initDatabase({ dataPath })` for that project.

---

### 3.5 Command Palette (⌘K)

`cmdk 1.1.1` is already a dependency of `packages/ui`. `Command` and `CommandDialog` components are already built. The integration is:
1. A `CommandDialog` component wrapping the settings navigation
2. A global keyboard listener in `_app.tsx` for `⌘K` / `Ctrl+K`
3. Commands: navigate to settings, switch language, switch theme, create project, open recent project

This is a V2.0 feature because the component is already present — one evening's work.

---

## 4. New Route Tree

```
apps/web/src/routes/
├── __root.tsx                    ← TanStack Devtools shell (unchanged)
├── _app.tsx                      ← NEW: app shell, initializes settings, applies theme/i18n
│   ├── _sidebar.tsx              ← NEW: sidebar layout (shadcn v4 Sidebar)
│   │   ├── index.tsx             ← / (Projects list — V2.0 landing page)
│   │   ├── projects.$id.tsx      ← /projects/:id (V2.1)
│   │   └── settings.tsx          ← /settings (V2.0)
│   └── ... (future: project-specific routes)
```

**Note on `__root.tsx` vs `_app.tsx`:** `__root.tsx` stays at the top of the tree for TanStack Devtools. `_app.tsx` becomes the new root for the app's own navigation. The devtools panel lives in `__root.tsx` only — it must not be inside a layout route that can be collapsed or hidden.

---

## 5. New File Inventory (V2.0)

| File | Package | Purpose |
|---|---|---|
| `apps/desktop/src/main/settings.ts` | desktop | `electron-store` instance + typed defaults |
| `apps/web/src/routes/_app.tsx` | web | App shell, initializes settings, applies theme/i18n |
| `apps/web/src/routes/_sidebar.tsx` | web | Sidebar layout (shadcn v4 Sidebar + nav) |
| `apps/web/src/routes/settings.tsx` | web | Settings page (Tabs: Language / Appearance / Projects) |
| `apps/web/src/routes/index.tsx` | web | Projects list (replaces current demo page) |
| `apps/web/src/components/settings/` | web | Settings-specific components |
| `packages/ui/src/components/sidebar.tsx` | ui | `pnpm ui:add sidebar` |
| `packages/ui/src/components/select.tsx` | ui | `pnpm ui:add select` |
| `packages/ui/src/components/switch.tsx` | ui | `pnpm ui:add switch` |
| `packages/ui/src/components/tabs.tsx` | ui | `pnpm ui:add tabs` |
| `packages/ui/src/components/tooltip.tsx` | ui | `pnpm ui:add tooltip` |
| `packages/api/src/routes/settings.ts` | api | `getSettings`, `updateSettings` procedures |
| `packages/db/src/schema/projects.ts` | db | `projects` table + Zod types |

---

## 6. Architectural Diagram

```
userData/
├── config.json                        ← electron-store: language, theme, sidebarCollapsed, recentProjects
└── global.db                         ← projects table, audit_log, project_templates (all projects)

{projectRoot}/.electron-template/
└── data.db                           ← users, posts (per-project, isolated)

apps/desktop/
├── src/main/index.ts
│   ├── electron-store: store<GlobalSettings>
│   ├── globalDb: initDatabase({ userData/global.db })
│   ├── projectDb: initDatabase({ projectRoot/.electron-template/data.db })  ← swapped on openProject
│   └── start-orpc-server (existing)  ← carries settings + projects procedures
│
├── src/preload/index.ts
│   └── MessagePort bridge (existing)  ← oRPC for settings over IPC
│
apps/web/
├── src/routes/
│   ├── __root.tsx                    ← TanStack Devtools (unchanged)
│   ├── _app.tsx                      ← NEW: shell, settings init, theme/i18n
│   │   └── _sidebar.tsx              ← NEW: shadcn v4 Sidebar
│   │       ├── index.tsx             ← / (Projects list)
│   │       ├── projects.$id.tsx      ← /projects/:id (V2.1)
│   │       └── settings.tsx           ← /settings
│   └── routes/index.tsx               ← (current demo — replaced by Projects list)
│
packages/api/src/routes/
├── system/ ping.ts                   ← existing
├── users/                            ← existing (uses projectDb)
├── settings.ts                        ← NEW: getSettings, updateSettings (uses store)
└── projects.ts                        ← NEW: listProjects, createProject, deleteProject, openProject (uses globalDb)

packages/db/src/schema/
├── index.ts                          ← existing
├── global/                           ← NEW: projects, audit_log, project_templates
│   ├── index.ts
│   ├── projects.ts
│   ├── audit-log.ts
│   └── project-templates.ts
└── project/                          ← NEW: project-scoped schema helpers
    ├── index.ts
    └── project-base.ts

packages/db/src/schema/
├── index.ts                                     ← existing
└── projects.ts                                  ← NEW: projects table

packages/ui/src/components/
├── [existing 53 components]                     ← unchanged
├── sidebar.tsx                                  ← NEW (shadcn add)
├── select.tsx                                   ← NEW (shadcn add)
├── switch.tsx                                   ← NEW (shadcn add)
├── tabs.tsx                                     ← NEW (shadcn add)
└── tooltip.tsx                                   ← NEW (shadcn add)
```

---

## 7. Resolved Decisions

All decisions were resolved during the 2026-06-22 analysis session.

| # | Decision | Resolved | Rationale |
|---|---|---|---|
| **D1** | Settings scope | **A — Apps built with the template** | V2.0 is a single-workspace app. V2.1 adds multi-workspace. The settings system supports both from day one. |
| **D2** | Settings storage | **A — `electron-store`** | Shared across windows, survives restart, typed, human-readable `config.json`. `localStorage` rejected: per-window, no sync, browser-only. |
| **D3** | Settings sync across windows | **A — Read on mount** | Each window reads settings from `electron-store` on mount. No IPC broadcast in V2.0. Revisit in V2.1 (multi-window). |
| **D4** | DB architecture | **C — Hybrid (global + per-project)** | `global.db` (projects metadata, audit log, templates) + `{projectRoot}/.electron-template/data.db` (user content). Best isolation + best cross-project queries. Full rationale in `features/05-project-architecture.md`. |
| **D5** | Re-add `@tanstack/react-query`? | **Yes** | Needed for `useSettings`, `useProjects`, `useUpdateSetting`. Re-add as `@tanstack/react-query` (not the removed SSR-query phantom dep). |
| **D6** | Theme flash prevention | **A — `useEffect` in `_app.tsx`** | Sufficient for CSR. Inline `<script>` in `index.html` deferred until SSR is re-adopted. |

---

## 8. Related Documents

- `docs/internal/security.md` — Electron security posture (CSP, contextBridge, sandbox)
- `docs/internal/ipc-contract.md` — oRPC MessagePort bridge architecture
- `docs/internal/ssr-decision.md` — Why SSR was deferred in V1
- `docs/plans/template-audit-remediation.md` — V1 remediation plan (V2 builds on top of this)

---

## 9. Audit Trail

| Date | Event |
|---|---|
| 2026-06-22 | V2.0.0 needs analysis written from deep research (internal audit + web research) |
