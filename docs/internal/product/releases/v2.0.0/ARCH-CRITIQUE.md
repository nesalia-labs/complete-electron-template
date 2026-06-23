# V2.0.0 Adversarial Architecture Critique

**Reviewer:** Architecture Critic
**Documents reviewed:** SPEC.md, RELEASES.md, features/05-project-architecture.md, features/02-settings-system.md
**Date:** 2026-06-22

---

## Finding 1: Audit Log Cascade Deletion — Critical Data Loss

**Severity:** Critical

**Description:**
The audit log table has `ON DELETE CASCADE` on its `project_id` FK reference. When a project is deleted (via `deleteProject`), the cascade silently erases every audit log entry for that project. This is documented as a feature ("deleting a project cascades to `audit_log` via FK" — AC-6), but it is architecturally catastrophic.

**Evidence:**
- `features/05-project-architecture.md`, lines 87-88:
  ```sql
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ```
- RELEASES.md V2.4.0 acceptance criterion: "Deleting a project removes it from the list" — no mention of audit preservation

**What breaks:**
- Compliance: Deleted projects leave no trace in the audit trail. Regulators or auditors asking "what happened to project X before deletion?" get silence.
- Debugging: A user reports "my data was corrupted in project X" — the project is deleted, the audit log is gone.
- Audit log API (V2.1 `getAuditLog`): If a project was deleted, querying with `projectId: null` (all projects) will never show entries for deleted projects.
- Cross-project queries (V2.1 selling point): "show all recent changes across all projects" silently excludes deleted projects.

**What to do:**
Remove `ON DELETE CASCADE`. Instead: when a project is deleted, set `project_id` to a sentinel value (e.g., `DELETED_PROJECT_保留`) or a `deleted_at` timestamp on the `projects` row, and retain the audit entries. Add a `projects` table migration: `ALTER TABLE audit_log DROP CONSTRAINT ...; ALTER TABLE audit_log ADD COLUMN project_id TEXT NOT NULL DEFAULT 'DELETED';` followed by a backfill.

---

## Finding 2: `withProject` is a Harmful No-Op

**Severity:** Major

**Description:**
`withProject` is presented as a schema helper that "enforces isolation" but it is a no-op — the function body is literally `return references // the project_id is implicit`. It adds conceptual weight with zero runtime effect. Worse, the comment "the project_id is implicit in the fact that we're in a project DB" conflates *file-path-based isolation* with *schema-level enforcement*, and the distinction matters for V2.1 multi-window mode.

**Evidence:**
- `features/05-project-architecture.md`, lines 184-188:
  ```typescript
  export function scopedToProject(references: ReturnType<typeof text>) {
    return references  // the project_id is implicit in the fact that we're in a project DB
    // Note: we don't add a FK reference here because project DBs don't have a projects table
    // The project DB is inherently scoped to one project (its filename encodes the project)
  }
  ```
- This is the entire function. There is no enforcement mechanism.

**What breaks:**
- In V2.1 multi-window mode, if the same project DB is opened by two windows simultaneously (explicitly allowed by the V2.1 spec), there is nothing preventing a developer from accidentally querying the wrong DB connection or joining across connections.
- The misleading comment implies safety where there is none. A developer reading this code could reasonably (and incorrectly) assume that `scopedToProject` provides some enforcement.
- The `scopedToProject` call site in `posts.ts` shows it being passed a `text` column — but it is never actually applied to any column. The function returns its input unchanged. It is dead weight.

**What to do:**
Either delete `withProject` / `scopedToProject` entirely, or implement actual enforcement. If project DBs genuinely don't need a `project_id` column (the file is the scope), document this explicitly and remove the confusing wrapper function. If you want enforcement, add a Drizzle middleware that automatically injects `WHERE project_id = ?` on every query against a project-scoped table.

---

## Finding 3: oRPC Context Leaks `activeProjectDb` as a Singleton — Breaks Multi-Project Queries

**Severity:** Critical

**Description:**
The oRPC handler context exposes `projectDb` as a single `activeProjectDb` variable set by the most recent `openProject` call. There is exactly one `projectDb` in context at any time. This is fundamentally incompatible with any procedure that needs to query **two projects simultaneously** — which is required for V2.1 cross-project search and the audit log API.

**Evidence:**
- `features/05-project-architecture.md`, lines 312-322:
  ```typescript
  context: {
    projectId: activeProjectId,  // null if no project is open
    projectDb: activeProjectDb,  // null if no project is open
  }
  ```
- The `getAuditLog` procedure (lines 493-511) uses `context.globalDb.db` — not `projectDb`. It works around the limitation by only querying global DB. But V2.1 cross-project queries (selling point of the hybrid architecture) cannot work this way.

**What breaks:**
- V2.1 cross-project search: "find this post across all projects" requires opening N project DBs simultaneously. The singleton `projectDb` cannot support this.
- V2.1 audit log with project context: If a procedure needs to correlate project-level data (posts in project A) with global audit entries, it must hold two DB connections at once. The current context only provides one `projectDb`.
- Any bulk operation over multiple projects (e.g., "export all projects") would require refactoring every procedure to accept a `projectDb` as a parameter, which leaks the DB connection abstraction to the API layer.
- `openProject` in main process (lines 276-297) closes the previous `activeProjectDb` before opening the new one. There is no mechanism to keep two project DBs open concurrently.

**What to do:**
Redesign the context so procedures receive a `projectDbGetter: (projectId: string) => DB` function rather than a singleton. This is a non-breaking change for existing single-project procedures and enables multi-project queries. Alternatively, pass an array of open project DBs with a maximum (e.g., max 5 concurrent).

---

## Finding 4: `electron-store` Schema is Untyped Beyond 4 Keys — Will Fracture

**Severity:** Major

**Description:**
The `GlobalSettings` interface has exactly 4 fields (`language`, `theme`, `sidebarCollapsed`, `recentProjects`). The Zod schemas in the settings procedure are similarly narrow. But V2.1 adds per-project settings, V2.2 adds collaboration flags, V2.5 adds feature flags. The architecture has no plan for extending `electron-store` schema without either (a) stuffing everything into one growing `GlobalSettings` interface or (b) creating per-project `electron-store` instances that multiply the file count.

**Evidence:**
- `features/02-settings-system.md`, lines 114-130:
  ```typescript
  interface GlobalSettings {
    language: 'en' | 'fr' | 'es'
    theme: 'light' | 'dark' | 'system'
    sidebarCollapsed: boolean
    recentProjects: string[]
  }
  ```
- SPEC.md §6 (Out of Scope): "Per-project settings (V2.1)" — acknowledged as a gap.
- RELEASES.md V2.5: "Per-project settings" — deferred to V2.5.

**What breaks:**
- The Zod schemas are hardcoded per key. Adding a new setting requires modifying `settings.ts` procedures, the `GlobalSettings` interface, and the defaults — all in the same PR. No migration path for existing `config.json` files.
- `updateSettings` accepts `z.unknown()` for the value, which strips type safety entirely. `updateMultipleSettings` is `z.record(z.unknown())`. There is no schema evolution strategy.
- If per-project settings are added in V2.1 as a second `electron-store` instance (e.g., `project-{id}/config.json`), you now have N+1 store files with no unified API surface.
- `recentProjects` is capped at 10 in the schema but nothing enforces this in the store's actual JSON — a manual edit can break the cap.

**What to do:**
Adopt a discriminated-union settings namespace in `electron-store`:
```typescript
interface GlobalSettings {
  version: 1,
  language: string,
  theme: string,
  sidebarCollapsed: boolean,
  recentProjects: string[],
  featureFlags: Record<string, boolean>,  // V2.1+
}
```
Or, for per-project settings, add a `projectSettings: Record<string, PerProjectSettings>` top-level key rather than separate store files. Use Zod schema versioning and a `migrate()` call on store load.

---

## Finding 5: `global.db` is the Single Point of Failure for the Entire App

**Severity:** Major

**Description:**
`global.db` is the canonical source of truth for which projects exist, their on-disk paths, audit logs, and templates. It is opened once at app startup and never closed until app exit. If `global.db` becomes corrupted (power loss during write, disk full, SQLite locking bug), the app cannot list projects, cannot audit, cannot open anything. There is no backup, no WAL mode configuration documented, and no recovery procedure.

**Evidence:**
- `features/05-project-architecture.md`, lines 264-270:
  ```typescript
  const globalDb = initDatabase({
    dataPath: join(app.getPath('userData'), 'global.db'),
  })
  runGlobalMigrations(globalDb.db)  // projects, audit_log, project_templates
  ```
  No WAL mode. No backup. No `PRAGMA journal_mode=WAL`.
- Anti-patterns table (line 525): "Not closing the project DB on `closeProject`" is listed — but the same concern is not raised for `globalDb`.

**What breaks:**
- SQLite in rollback journal mode (default) is vulnerable to corruption on power loss.
- No `PRAGMA synchronous=NORMAL` or `PRAGMA journal_mode=WAL` means no durability guarantee beyond the OS.
- `audit_log` grows indefinitely. No retention policy. A busy system could accumulate millions of rows in `global.db` — and since it is never closed or compacted, the file grows and read performance degrades.
- No backup. If `global.db` is corrupted, the user loses all project registry information. The per-project `data.db` files are intact but the app has no way to discover them.

**What to do:**
- Enable WAL mode: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`
- Add a compaction routine (e.g., `VACUUM` on app startup if `audit_log` exceeds 100k rows).
- Create a backup copy of `global.db` on each startup (copy to `global.db.backup`).
- Document a recovery procedure: if `global.db` is corrupted, scan `{projectRoot}/.electron-template/data.db` headers to rebuild the `projects` table.

---

## Finding 6: `deleteProject` Leaves `.electron-template/` On Disk — orphaned data with no recovery path

**Severity:** Minor

**Description:**
RELEASES.md V2.4.0 states: "Delete project — removes from `global.db`, keeps `.electron-template/` on disk". The rationale is presumably data safety (accidental deletion recovery). However, this creates orphaned data that has no UI to recover and no automated cleanup.

**Evidence:**
- RELEASES.md V2.4.0, line 325: "Delete project — removes from `global.db`, keeps `.electron-template/` on disk"
- SPEC.md §9 Migration Notes: "Migration strategy documented in `docs/plans/v2-migration.md` (to be written before V2.0 ships)" — and the v2-migration doc doesn't exist yet.

**What breaks:**
- Orphaned `data.db` files accumulate on disk with no UI to delete them or re-import them.
- If a user deletes a project, then reinstalls the app or moves computers, the orphaned data is permanently inaccessible.
- No "Trash" or "Recently Deleted" feature. Deletion is immediate and unrecoverable from the UI.

**What to do:**
Either (a) actually delete the `.electron-template/` directory on project deletion (irreversible but clean) or (b) implement a trash/soft-delete pattern: add a `deleted_at` column to `projects`, exclude deleted projects from the list by default, and add a "Restore" or "Permanently Delete" UI. Option (b) is the minimum for a production-quality app.

---

## Finding 7: V1 → V2 Migration Path is "Hand-Wavey" — Will Lose User Data

**Severity:** Critical

**Description:**
SPEC.md §9 states that V1 demo data is "not migrated" and users must "export manually". The migration doc (`docs/plans/v2-migration.md`) is explicitly marked "to be written before V2.0 ships" — meaning it does not exist yet. The V1 → V2 structural change moves `users`/`posts` from a single `data.db` to per-project `data.db`, but the migration path is "do it yourself."

**Evidence:**
- SPEC.md lines 165-183: Migration section, ending with: "Migration strategy documented in `docs/plans/v2-migration.md` (to be written before V2.0 ships)."
- This is a circular dependency: V2.0 ships with a migration plan that doesn't exist yet.

**What breaks:**
- Users with V1 data who upgrade lose their data silently. The quality gates (SPEC.md §8) include no migration test.
- No automated migration means V2.0 effectively ships as a clean-install for all existing users, alienating them.
- The migration path requires users to understand SQLite, the file layout, and the schema differences — this is not reasonable for a desktop app audience.

**What to do:**
Write `docs/plans/v2-migration.md` before V2.0 ships. Implement an automated migration: detect V1 `data.db`, prompt the user to either migrate it to a new default project or export as JSON, then remove the V1 file. Add a quality gate that runs the migration against a seeded V1 database.

---

## Finding 8: Project Path Resolution Uses `rootPath` Without Validation

**Severity:** Minor

**Description:**
`createProject` stores `rootPath` (user-provided) and derives `dbPath` from it. The `openProject` function trusts `dbPath` from the `projects` table without verifying the file exists or is readable before calling `initDatabase`.

**Evidence:**
- `features/05-project-architecture.md`, line 286:
  ```typescript
  const projectDir = dirname(project.dbPath)
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true })
  ```
  This creates the directory if missing, but does not validate the DB file itself.
- No code path checks that `project.rootPath` is a valid directory, that `project.dbPath` points to a readable SQLite file, or that the DB schema version is compatible.

**What breaks:**
- A manually edited `global.db` (or a partially written record from a crash) could point to a non-existent or corrupted `data.db`. `initDatabase` will create a new empty DB at that path rather than erroring.
- If a user moves a project folder (a natural operation), the `rootPath` becomes stale and `openProject` silently creates a new empty DB at the old path.

**What to do:**
Add validation in `openProject`: check that `project.dbPath` exists and is a valid SQLite file (try `PRAGMA integrity_check` or open and immediately close). If invalid, throw an error with a recovery suggestion rather than silently creating a new DB.

---

## Summary Table

| # | Finding | Severity | Fix Required |
|---|---|---|---|
| 1 | Audit log cascade deletion on project delete | Critical | Remove CASCADE, retain audit entries |
| 2 | `withProject` is a no-op that misleads | Major | Delete or implement real enforcement |
| 3 | Singleton `projectDb` breaks multi-project queries | Critical | Pass `projectDbGetter` function in context |
| 4 | `electron-store` schema has no extension strategy | Major | Versioned discriminated-union settings namespace |
| 5 | `global.db` is unbackuped, no WAL, single point of failure | Major | WAL mode, backup, compaction, recovery docs |
| 6 | `deleteProject` orphans data on disk | Minor | Soft-delete + trash UI, or actually delete |
| 7 | V1→V2 migration plan doesn't exist | Critical | Write `v2-migration.md`, implement automated migration |
| 8 | `rootPath`/`dbPath` not validated on `openProject` | Minor | Integrity check before `initDatabase` |
