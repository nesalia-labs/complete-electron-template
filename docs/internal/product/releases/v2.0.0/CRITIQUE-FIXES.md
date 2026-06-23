# V2.0.0 — Adversarial Critique Fixes

**Date:** 2026-06-22
**Critics:** Architecture Critic, Release Planning Critic, Completeness Auditor, Effort Auditor
**Status:** Proposed fixes — awaiting Tech Lead approval

---

## Prologue

Four independent agents reviewed the V2.0.0 documentation from four angles: architecture decisions, release sequencing, completeness, and effort estimation. 9 Critical, 8 Major, and 9 Minor findings were raised. This document captures the **Critical fixes** that must be resolved before implementation begins, followed by Major fixes that should be resolved before each affected release ships.

---

## Critical Fixes

---

### CF-1: Remove `ON DELETE CASCADE` from `audit_log.project_id`

**Severity:** Critical
**Raised by:** Architecture Critic + Release Planning Critic

**Problem:**
```sql
-- features/05-project-architecture.md, §3.1
CREATE TABLE IF NOT EXISTS audit_log (
  ...
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ...
)
```

`ON DELETE CASCADE` means deleting a project silently erases all audit entries for that project. This destroys the data most needed after a deletion: what happened before the project disappeared. Regulators, auditors, and developers debugging corruption all get silence.

**What to do — Option A (soft delete, recommended):**

```sql
-- Add to projects table
deleted_at INTEGER REFERENCES audit_log(id),  -- NULL = active, set = deleted

-- Remove CASCADE from audit_log FK
project_id TEXT NOT NULL REFERENCES projects(id),  -- no CASCADE

-- In deleteProject procedure:
UPDATE projects SET deleted_at = unixepoch() WHERE id = ?;
-- Audit entries are preserved; queries filter WHERE deleted_at IS NULL
```

**What to do — Option B (sentinel value):**
Keep `audit_log.project_id` as text, set it to `'DELETED'` on project deletion. Simpler but loses project identity in audit entries.

**Decision needed:** Option A or B? Option A requires adding `deleted_at` to `projects` schema (migration). Option B is a one-line change.

**File to change:** `features/05-project-architecture.md` §3.1 (SQL), §3.2 (Drizzle), §5.1 (deleteProject flow), RELEASES.md V2.4.0 AC-6 (acceptance criterion wording).

---

### CF-2: Redesign oRPC context — `projectDb` is a singleton

**Severity:** Critical
**Raised by:** Architecture Critic + Completeness Auditor

**Problem:**
```typescript
// features/05-project-architecture.md, §5.2
context: {
  projectId: activeProjectId,  // exactly one project
  projectDb: activeProjectDb,  // exactly one DB handle
}
```

Every procedure can only access one project DB at a time. V2.1's cross-project search, V2.1's audit log across all projects, and any bulk export require querying multiple projects simultaneously. The current design makes these impossible without rewriting every procedure.

**What to do:**

Replace the singleton with a getter:

```typescript
context: {
  // Global DB (one handle, never changes)
  globalDb,

  // Project DB getter — pass a project ID to get a DB handle
  getProjectDb: (projectId: string) => {
    if (projectId === activeProjectId && activeProjectDb) return activeProjectDb
    // Lazy-open a project DB without closing activeProjectDb
    return initDatabase({ dataPath: getDbPath(projectId) })
  },

  // Active project (still needed for procedures that implicitly use the current project)
  activeProjectId,
}
```

**Key insight:** Keep `activeProjectDb` for ergonomics (most procedures use the current project), add `getProjectDb(id)` for V2.1 multi-project queries. Never close a project DB just because another one is opened — SQLite WAL handles concurrent reads.

**File to change:** `features/05-project-architecture.md` §5.2 (oRPC context), all procedures that currently use `context.projectDb`.

---

### CF-3: Write the V1 → V2 migration plan before V2.1 ships

**Severity:** Critical
**Raised by:** Architecture Critic + Release Planning Critic

**Problem:**
SPEC.md §9 defers the migration doc: "`docs/plans/v2-migration.md` (to be written before V2.0 ships)." This doc does not exist. The V1→V2 structural change (single `data.db` → per-project `data.db`) means existing users lose their data silently on upgrade.

**What to do:**

Write `docs/plans/v2-migration.md` as a **blocking prerequisite** for V2.1. The migration strategy:

```
On first launch after V2 upgrade:
1. Check if legacy data.db exists (V1 location)
2. If exists:
   a. Prompt user: "Migrate your existing data to V2?" [Migrate] [Start Fresh]
   b. "Migrate": create a default project, migrate users + posts to new schema, delete legacy file
   c. "Start Fresh": delete legacy file, proceed with empty app
3. If not exists: proceed normally
```

The migration must be **automated** — users cannot be expected to manually export SQLite files.

**File to create:** `docs/plans/v2-migration.md`

**Blocker for:** V2.1.0 implementation must not begin until this is written.

---

### CF-4: Wire `closeProject()` to `before-quit`

**Severity:** Critical
**Raised by:** Completeness Auditor

**Problem:**
`openProject()` and `closeProject()` are defined in `05-project-architecture.md` §5.1 but nowhere is `closeProject()` registered on `app.on('before-quit')`. The main process has no lifecycle hook for closing the active project DB.

**Consequences:**
- `better-sqlite3` holds a file lock on the active project's `data.db` until the process exits
- On Windows, a locked `.db` file cannot be backed up by external tools
- On crash without clean quit, the WAL journal file may not be checkpointed, risking corruption

**What to do:**

```typescript
// apps/desktop/src/main/index.ts
app.on('before-quit', () => {
  closeProject()  // closes activeProjectDb, checkpoints WAL, releases lock
  globalDb.close()  // closes global.db
})

app.on('will-quit', () => {
  // Final cleanup if needed
})
```

Also add: on next launch, detect a dirty shutdown (WAL not checkpointed) and run `PRAGMA wal_checkpoint(TRUNCATE)` before opening the DB.

**File to change:** `features/05-project-architecture.md` §5.1 (main process wiring).

---

### CF-5: `electron-store` schema extension strategy

**Severity:** Critical
**Raised by:** Architecture Critic + Completeness Auditor

**Problem:**
`GlobalSettings` has 4 hardcoded fields. `updateSettings` accepts `z.unknown()`. No migration path for existing `config.json` when a new setting is added. This fractures on the second feature flag.

**What to do:**

Introduce schema versioning and discriminated union:

```typescript
// apps/desktop/src/main/settings.ts
import Store from 'electron-store'
import { z } from 'zod'

const settingsSchema = z.object({
  version: z.literal(1),
  language: z.enum(['en', 'fr', 'es']).default('en'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  sidebarCollapsed: z.boolean().default(false),
  recentProjects: z.array(z.string()).max(10).default([]),
  // v2: featureFlags: z.record(z.string(), z.boolean()).default({}),
})

type GlobalSettings = z.infer<typeof settingsSchema>

const store = new Store<GlobalSettings>({
  name: 'config',
  defaults: { version: 1, language: 'en', theme: 'system', sidebarCollapsed: false, recentProjects: [] },
  // Migration on load
  onLoad: (store) => {
    if (!store.version || store.version < 1) {
      return { version: 1 as const, ...defaults }
    }
    return store
  },
})
```

`updateSettings` procedure now validates against the specific key's schema, not `z.unknown()`:

```typescript
export const updateSettings = os
  .input(z.object({
    key: z.enum(['language', 'theme', 'sidebarCollapsed', 'recentProjects']),
    value: z.union([z.string(), z.boolean(), z.array(z.string())]),
  }))
  .handler(({ input }) => {
    store.set(input.key, input.value)
    return { success: true }
  })
```

**Files to change:** `features/05-project-architecture.md` §4.1, `features/02-settings-system.md` §4.3, `features/02-settings-system.md` §4.4.

---

## Major Fixes

---

### MF-1: Delete `withProject()` / `scopedToProject()`

**Severity:** Major
**Raised by:** Architecture Critic + Completeness Auditor

The entire function body is `return references`. It provides zero enforcement. Delete it. If project DBs don't need `project_id` (the file path is the scope), document this explicitly and remove the confusing wrapper.

**Files to change:** `features/05-project-architecture.md` §4.1 (function definition), `features/05-project-architecture.md` §4.2 (call sites in `users.ts`, `posts.ts`).

---

### MF-2: Enable WAL + backup on `global.db`

**Severity:** Major
**Raised by:** Architecture Critic

`global.db` has no WAL mode, no backup, no compaction. It is the single source of truth for all projects. If it corrupts, the app is dead.

**What to add to `initDatabase` for `global.db`:**

```typescript
// After opening the connection
db.exec(`PRAGMA journal_mode=WAL;`)
db.exec(`PRAGMA synchronous=NORMAL;`)
// Backup on startup
const backupPath = join(userData, 'global.db.backup')
if (existsSync(join(userData, 'global.db'))) {
  copyFileSync(join(userData, 'global.db'), backupPath)
}
```

Also: add a compaction trigger when `audit_log` exceeds 10k rows.

**File to change:** `features/05-project-architecture.md` §5.1.

---

### MF-3: Merge F2 + F3 into V2.2 (or document the gap)

**Severity:** Major
**Raised by:** Release Planning Critic

F2 (Settings) is in V2.2. F3 (Theming) is in V2.3. The Settings page's "Appearance" tab (Theme cards) exists in V2.2 but the theme **does not apply to CSS** until V2.3. V2.2 ships a broken Theme tab.

**Two options:**

**Option A (recommended):** Merge F2 + F3 into V2.2. The sidebar layout (`_app.tsx`, `_sidebar.tsx`) and the theme application are in the same `_app.tsx`. Theming IS a setting. Ship them together.

**Option B:** Keep them split, but add a cross-release AC in V2.3: "Setting theme to Dark in Settings page, reloading, checking `document.documentElement.classList` shows `dark`." This explicitly tests the V2.2→V2.3 integration.

**Decision needed:** Option A (simplify) or Option B (document the gap)?

---

### MF-4: Add cross-release integration ACs

**Severity:** Major
**Raised by:** Release Planning Critic

No acceptance criterion spans two releases. Before V2.4 ships, add:

1. Create project → appears in sidebar "Recent Projects" (V2.4 writes → V2.3 reads)
2. Set theme to Dark → sidebar is dark (V2.2 writes → V2.3 CSS applies)
3. Collapse sidebar → restart → still collapsed (V2.3 writes → V2.1 store)

**File to change:** `RELEASES.md` — add a "Pre-V2.4 Integration Checklist" section.

---

### MF-5: Add round-trip tests to V2.1

**Severity:** Major
**Raised by:** Release Planning Critic

V2.1 AC-3 says "`client.getSettings()` returns correct defaults" — but never tests writing then reading back. Add:

- `client.updateSettings({ key: 'language', value: 'fr' })` → `client.getSettings()` returns `language: 'fr'`

This validates the full electron-store read/write cycle before V2.2 builds UI on top.

**File to change:** `RELEASES.md` V2.1.0 acceptance criteria.

---

### MF-6: Document all 7 missing translation keys

**Severity:** Major
**Raised by:** Completeness Auditor

The new UI strings (`settings.title`, `projects.new`, etc.) are referenced throughout but not verified to exist in `en/fr/es/common.json`. Add to V2.2 AC:

- "All new i18n keys are defined in `en/common.json`, `fr/common.json`, `es/common.json`"

The keys to verify:
- `settings.title`, `settings.description`, `settings.language`, `settings.appearance`, `settings.projects`
- `settings.theme.light`, `settings.theme.dark`, `settings.theme.system`
- `projects.title`, `projects.description`, `projects.new`, `projects.search`
- `projects.delete.title`, `projects.delete.description`
- `common.cancel`, `common.delete`

**File to change:** `RELEASES.md` V2.2.0 acceptance criteria.

---

## Minor Fixes

| ID | Fix | Location |
|---|---|---|
| m1 | Remove `scopedToProject` dead code | `05-project-architecture.md` §4.1 |
| m2 | Remove `globalProjectDb` alias (duplicate of `globalDb`) | `05-project-architecture.md` §5.2 |
| m3 | Fix `like` and `desc` missing imports in `listProjects` code example | `04-projects-page.md` §4.3 |
| m4 | Define "Projects" tab in Settings page (currently empty in wireframe) | `02-settings-system.md` §3.1 |
| m5 | Verify `@custom-variant dark` line exists in `globals.css` | `03-theming.md` §5.2 |
| m6 | Clarify `NativeSelect` vs `Select` — pick one | `02-settings-system.md` §3.2 |
| m7 | Define `createProjectDatabase` function (currently called but undefined) | `04-projects-page.md` §4.3 |
| m8 | Clarify `updateMultipleSettings` purpose or remove it | `02-settings-system.md` §4.3 |
| m9 | Define first-launch empty state messaging | `04-projects-page.md` §3.1 |

---

## Effort Estimate Correction

| Release | Reported | Realistic | Reason |
|---|---|---|---|
| V2.1.0 | 10–16h | 15–24h | Dual-DB oRPC context wiring + migrations across 2 DB files |
| V2.2.0 | 8–13h | 8–14h | i18n side-effect removal is harder than it looks |
| V2.3.0 | 10–14h | 13–22h | Tailwind v4 CSS variables + shadcn v4 Sidebar compound patterns |
| V2.4.0 | 8–11h | 9–14h | V1→V2 migration + V2.3 regressions |
| **Total** | **36–54h** | **45–74h** | +9 to +20h |

**Top 3 risks that could blow the estimate:**
1. Dual-DB oRPC context wiring (V2.1) — novel, no precedent in this codebase
2. Tailwind v4 CSS variables for dark mode (V2.3) — CSS archaeology before feature work
3. V1→V2 migration (V2.1) — must be written before V2.1 begins, not estimated

---

## Decision Required From Product Owner

| Decision | Options | Impact |
|---|---|---|
| **CF-3** | Write migration doc now? Or ship V2 as clean-install? | Users with V1 data: migrate or lose |
| **CF-1** | Option A (soft delete) vs Option B (sentinel) for audit log | Migration needed vs one-line change |
| **CF-2** | Singleton `projectDb` + `getProjectDb(id)` function in context? | Enables V2.1 multi-project; breaking if done later |
| **MF-3** | Merge F2+F3 into V2.2? | Reduces release count, increases V2.2 effort |
| **CF-5** | Typed `updateSettings` per key vs `z.unknown()`? | Type safety vs ergonomics |

---

## Summary of Required Doc Changes

| File | Changes |
|---|---|
| `features/05-project-architecture.md` | CF-1 (cascade → soft delete), CF-2 (getProjectDb), CF-4 (before-quit), CF-5 (typed schema), MF-1 (delete `withProject`), MF-2 (WAL+backup), m2 (remove alias) |
| `features/02-settings-system.md` | CF-5 (typed settings), MF-3 (merge F2/F3), m4 (Projects tab), m6 (NativeSelect), m8 (remove `updateMultipleSettings`) |
| `features/03-theming.md` | m5 (verify CSS variant line) |
| `features/04-projects-page.md` | CF-1 (soft delete), CF-2 (getProjectDb), m3 (fix imports), m7 (define `createProjectDatabase`) |
| `RELEASES.md` | CF-3 (migration as blocker), MF-4 (cross-release ACs), MF-5 (round-trip tests), MF-6 (i18n keys), effort estimates corrected |
| `SPEC.md` | Update acceptance criteria with CF fixes |
| `docs/plans/v2-migration.md` | **Create** — CF-3 |
