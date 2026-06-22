---
name: project-v2-direction
description: V2.0.0 direction: sidebar layout, settings system, theming, project management. All decisions resolved. Full specs at docs/internal/product/releases/v2.0.0/SPEC.md.
metadata:
  type: project
---

# V2.0.0 Direction

**Date:** 2026-06-22
**Status:** Spec approved — implementation pending V1 remediation PRs
**Full spec:** `docs/internal/product/releases/v2.0.0/SPEC.md`

## What triggered this

V1 is a single-page demo app. The template audit (2026-06-22) created a clean foundation. V2 makes `complete-electron-template` feel like a real product from day one.

## The V2 vision

A desktop app shell with:
- **Sidebar navigation** (shadcn v4 Sidebar, collapsible, `⌘K` command palette)
- **Settings system** — language, theme persisted via `electron-store` + oRPC
- **Light/Dark/System theme** via Tailwind v4 CSS variables + `.dark` class
- **Projects page** — create/open/delete projects, each with isolated SQLite DB

## Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| Settings scope | Apps built with the template | Single-workspace V2.0, multi-workspace V2.1 |
| Settings storage | `electron-store` (main process) | Shared across windows, survives restart, typed |
| Settings sync | Read on mount | Simple, sufficient for V2.0 |
| DB architecture | **Hybrid: `global.db` + per-project `data.db`** | Best isolation + cross-project queries |
| TanStack Query | Re-add `@tanstack/react-query` | Required for `useSettings`/`useProjects` |
| Theme flash | `useEffect` in `_app.tsx` | Sufficient for CSR; inline `<script>` deferred |

## Persistence architecture

```
electron-store (config.json)          → language, theme, sidebarCollapsed, recentProjects
global.db (userData/global.db)       → projects, audit_log, project_templates (all projects)
{projectRoot}/.electron-template/
  data.db                           → users, posts (per project, isolated)
```

## Release sequence

| Release | Features | Effort | User-visible |
|---|---|---|---|
| V2.1.0 | F5: Architecture Foundation | ~10–16h | No |
| V2.2.0 | F2: Settings System | ~8–13h | Yes |
| V2.3.0 | F1: Sidebar + F3: Theming | ~10–14h | Yes |
| V2.4.0 | F4: Projects Page | ~8–11h | Yes |

**Total: ~36–54h**

Full release plan: `docs/internal/product/releases/v2.0.0/RELEASES.md`

## Prerequisites (must land first)

- PR #1: `fix-imports.mjs` → tsconfig paths
- PR #2: SSR half-wiring resolved (C3)
- PR #5: Node 22.13 across CI (M2)

See `docs/plans/template-audit-remediation.md` §6.

## Related

- [[project-template-audit-2026-06-22]] — V1 remediation plan
- [[feedback-template-philosophy]] — "shock standard": V2 must look like a real product
- [[project-shadcn-monorepo-pattern]] — shadcn v4 Sidebar confirmed first-party
