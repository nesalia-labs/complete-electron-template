# V2.0.0 Features

This directory contains the detailed feature specifications for the V2.0.0 release of `complete-electron-template`.

---

## Feature Index

| # | Feature | ID | Status | Effort |
|---|---|---|---|---|
| 1 | [Sidebar Navigation](01-sidebar-navigation.md) | F1 | Proposed | 6–9h |
| 2 | [Settings System](02-settings-system.md) | F2 | Proposed | 8–13h |
| 3 | [Theming (Light / Dark / System)](03-theming.md) | F3 | Proposed | 4–5h |
| 4 | [Projects Page](04-projects-page.md) | F4 | Proposed | 8–11h |
| 5 | [Project Architecture](05-project-architecture.md) | F5 | Proposed | 10–16h |

**Total estimated effort (V2.0.0):** ~36–54h

---

## Feature Dependencies

```
F5 (Project Architecture)   ← Foundation: must land first
  └── F4 (Projects Page)
        └── F2 (Settings System)
              └── F1 (Sidebar Navigation)  →  F3 (Theming)

F5 establishes the DB architecture (global.db + per-project data.db).
F4 (Projects) requires F5 for the schema and F2 for persistence.
F3 (Theming) requires F2 (settings) for theme persistence.
F1 (Sidebar) requires F2 for sidebar collapse persistence.
```

Execution order: **F5 → F2 → F1 → F3 → F4** (F5 first as the foundation; F1+F2 can run in parallel once F5 is done).

---

## Cross-Feature Decisions

All decisions resolved — see `SPEC.md` §3.

| Decision | Resolution |
|---|---|
| **D1** | ✅ `@tanstack/react-query` added (needed for F1, F2, F4) |
| **D2** | ✅ `useEffect` in `_app.tsx` for settings initialization |
| **D3** | ✅ Hybrid: `global.db` + per-project `data.db` |
| **D4** | ✅ `useEffect` for theme (CSR); inline `<script>` deferred |

---

## Rollup: Files to Create / Modify (V2.0.0)

| Package | New | Modified | Count |
|---|---|---|---|
| `apps/desktop` | `settings.ts` | `main/index.ts` | ~2 files |
| `apps/web` | `_app.tsx`, `_sidebar.tsx`, `settings.tsx`, `index.tsx`, `lib/theme.ts`, `hooks/useSettings.ts`, `hooks/useProjects.ts`, `components/settings/*.tsx` | `__root.tsx`, `router.tsx` | ~10 files |
| `packages/api` | `routes/settings.ts`, `routes/projects.ts` | `routes/index.ts` | ~3 files |
| `packages/db` | `schema/global/`, `schema/project-base.ts`, `schema/project/`, migrations, templates | `schema/index.ts`, existing migrations | ~8 files |
| `packages/ui` | `sidebar.tsx`, `tooltip.tsx`, `tabs.tsx`, `switch.tsx` | `components/index.ts` | ~5 files |
| **Total** | **~27** | **~5** | **~32 files** |

---

## Out of Scope for V2.0.0

- Multi-window (each project in its own window)
- Per-project settings
- Custom primary color picker
- Project-level feature flags
- Real-time collaboration
- Export / import projects
- macOS code signing, notarization, auto-update

---

## Related Documents

- [Analysis](../analysis.md) — Product context, trade-offs, open decisions D1–D3
- [V1 Audit Remediations](../../../internal/plans/template-audit-remediation.md) — Must land before V2.0 work begins
- [Security ADR](../../../internal/security.md) — Electron security posture (V2 builds on this)
- [IPC Contract ADR](../../../internal/ipc-contract.md) — oRPC bridge architecture
