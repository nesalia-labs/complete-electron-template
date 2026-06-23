---
name: project-f2-settings-architecture
description: Settings System (F2) architecture — merged with Theming (F3), registry location, recentProjects placement, extensibility model. Decisions made 2026-06-23.
metadata:
  type: project
---

# Settings System Architecture (F2 + F3 merged)

## Decisions (2026-06-23, user-approved)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Merge F2 (Settings) + F3 (Theming) into V2.2** | Theming = just a setting with this arch; merge is free. Avoids MF-3 gap (Theme tab that doesn't apply to CSS in V2.2 then ships in V2.3). |
| D2 | **Registry lives in `packages/api/src/settings/`** as `@electron-template/api/settings` sub-path | Renderer + main process both import. Module is Drizzle-free so Vite tree-shakes correctly. No new workspace package. |
| D3 | **`recentProjects` lives in `global.db`** (new `recent_projects` table), NOT in electron-store | Proper relational data with timestamps + referential cleanup on project delete. electron-store is for prefs. |
| D4 | **Edit-time extensibility** — consumers edit `apps/web/src/settings/app-settings.ts` | Rebuild required. Simplest, most teachable, no plugin runtime complexity. |

## Frontend architecture (B + Y + α, user-accepted by silence)

- **B. Multi-page with layout route** — `_app.settings.tsx` (layout) + `_app.settings.$section.tsx` (catch-all via TanStack Router `$param`) + `_app.settings.index.tsx` (redirect to first section).
- **Y. Sub-nav lives inside `/settings`** — two-column layout (sub-nav left + content right). App sidebar keeps one "Settings" item. No shadcn Sidebar sub-menus (the primitive doesn't natively support collapsible sub-menus without patching).
- **α. Auto-generated controls** — each entry has `control: { type: 'select' | 'switch' | 'cards' | 'number' | 'text' | 'project-list', ...props }`. Single `<GenericControl />` renders all. `render?: (value, onChange) => ReactNode` as escape hatch for custom UI.

## Why these decisions

- **Schema-first preserved** — Zod is the single source of truth. Registry entries have Zod schemas; electron-store schema is built by composition (`z.object(Object.fromEntries(registry.map(s => [s.key, s.schema])))`).
- **Type-safety preserved for app-added settings** — `updateSettings({ key, value })` validates `value` against `registry.find(s => s.key === key).schema`, not `z.unknown()`. CF-5 satisfied without giving up extensibility.
- **One file for consumers to edit** — `apps/web/src/settings/app-settings.ts`. Adding an entry makes it appear in sub-nav, route, UI, and oRPC validation automatically.

## File paths

| Concern | Path |
|---|---|
| Registry source | `packages/api/src/settings/{registry,built-in,schemas,index}.ts` |
| Consumer extension point | `apps/web/src/settings/app-settings.ts` |
| electron-store | `apps/desktop/src/main/settings.ts` (schema built from registry) |
| oRPC procedures | `packages/api/src/routes/settings.ts` (getSettings, updateSettings) |
| Routes | `apps/web/src/routes/_app.settings.{tsx,$section.tsx,index.tsx}` |
| UI | `apps/web/src/components/settings/{settings-sub-nav,settings-section-view}.tsx` |
| Controls | `apps/web/src/components/settings/controls/{generic-control,select-control,cards-control,switch-control,number-control,project-list-control}.tsx` |
| Hooks | `apps/web/src/hooks/{useSettings,useUpdateSetting}.ts` |
| Theme init | `apps/web/src/lib/theme-init.ts` (applies dark class before first paint) |
| recentProjects table | `packages/db/src/schema/recent-projects.ts` + migration in `packages/db/drizzle/` |
| TanStack Query | re-add `@tanstack/react-query` to `apps/web/package.json` + `QueryClientProvider` in `apps/web/src/main.tsx` |

## Critical fixes from CRITIQUE-FIXES.md addressed

| ID | How addressed |
|---|---|
| CF-5 (typed updateSettings) | Registry schema per-key validates `value`. `updateSettings` accepts `z.string()` for key (registry lookup), `z.unknown()` for value (validated against per-key schema inside handler). |
| MF-3 (merge F2+F3) | D1 above. |
| MF-5 (round-trip tests) | PR 1 must include a Vitest round-trip test: write → read → assert. |
| MF-6 (i18n keys) | PR 3 must verify all `settings.*` keys exist in en/fr/es `common.json`. |
| m8 (remove `updateMultipleSettings`) | Not implemented. If batch updates are needed, use `Promise.all([updateSettings(k1,v1), updateSettings(k2,v2)])`. |

## Open sub-questions (deferred to implementation)

| # | Question | Default | Notes |
|---|---|---|---|
| OQ-1 | Order of sections in sub-nav | Registry order (no explicit field) | YAGNI for V2.2 |
| OQ-2 | Hidden settings (`hidden: true`) | Not implemented | YAGNI for V2.2 |
| OQ-3 | Advanced settings (`advanced: true` → `<Accordion>`) | Not implemented | YAGNI for V2.2 |
| OQ-4 | i18n for control labels | `label: { key: 'settings.fields.x', default: 'Language' }` | Registry type stays i18n-first. Renderer calls `t()`. |
| OQ-5 | Theme before first paint | `localStorage` mirror + `<head>` inline script + sync to electron-store on app boot | Avoids 1-frame flash of wrong theme. |
| OQ-6 | Existing `LanguageSwitcher` in `AppHeader` | Remove; UI canonique = `/settings` tab | Spec F2 §5.4 says move it. |
| OQ-7 | i18n drift `src/` vs `public/` | Documented. Add pre-build copy script OR make public/ the source. | Pre-existing drift, not caused by F2. |

Related: [[project-v2-direction]], [[project-template-audit-2026-06-22]], [[reference/orpc-bridge]], [[feedback/investigate-before-recommending]]