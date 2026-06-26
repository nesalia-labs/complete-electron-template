# Code Analysis — 2026-06-26

Deep code sweep of the `complete-electron-template` monorepo. Six anomalies identified across packages.

## Methodology

- Sweep via Explore agent across 12 architectural dimensions (monorepo boundaries, oRPC contract, Electron main/preload, Drizzle, TanStack Router, shadcn monorepo, settings F2, eve agent, CI/CD, docs, tests, anomalies)
- Targeted deep reads on the load-bearing seams: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/projects.ts`, `apps/desktop/src/preload/index.ts`, `apps/web/src/lib/orpc.ts`, `apps/web/package.json`, `packages/db/src/schema/recent-projects.ts`
- Cross-referenced with existing memory (`docs/learnings/`, `docs/plans/template-audit-remediation.md`, tech-lead memory under `.claude/agent-memory/tech-lead/`)

## Anomalies

### 1. `apps/desktop/src/main/projects.ts` — zombie stub wired into lifecycle

**Type:** bug | **Effort:** xs | **Status:** filed as GitHub issue #30

The file is a 22-line stub exporting two no-op functions (`openProject()`, `closeProject()`). The functions are placeholders for the F5 (Projects page) feature, marked `TODO(PR5)`.

The stub is **not isolated** — `closeProject()` is imported at `apps/desktop/src/main/index.ts:8` and called from the `before-quit` lifecycle hook (line 135):

```ts
app.on('before-quit', () => {
  closeProject()  // no-op
  closeSqlite(handle)
})
```

A reader of `main/index.ts` would reasonably assume the app properly closes the active project on quit. In reality, no project state is touched and the call is dead.

**Recommended fix (option A — preferred):**
- Remove `closeProject` import at `main/index.ts:8`
- Remove the call from `before-quit` (line 135)
- Delete `projects.ts` or keep with the TODO
- Re-add wiring in the PR that implements F5 (real open/close)

**Related:** V2.0.0 spec `docs/internal/product/releases/v2.0.0/SPEC.md` (F5 — Projects page)

---

### 2. Double unique index on `recent_projects.openedAt`

**Type:** bug | **Effort:** xs | **Status:** logged here, not yet filed

File: `packages/db/src/schema/recent-projects.ts:33-35`

```ts
openedAtUniqueIdx: uniqueIndex('recent_projects_opened_at_unique').on(
  table.openedAt
)
```

Two problems:
1. **Functional:** the index would block legitimate re-touches of different projects in the same millisecond (only one row per `openedAt` value).
2. **Performance:** the doc-comment (lines 14-15) claims the index exists "so we can sort by it for the 'most recent' view without a separate scan", but a unique index on `openedAt` alone provides **no speedup** for `ORDER BY opened_at DESC LIMIT N`. SQLite needs a non-unique index (or a covering index with row data) to use the index for sorted range scans.

**Recommended fix:**
- Drop the `openedAt` unique index entirely.
- If query performance is a concern, add a non-unique `index('recent_projects_opened_at_idx').on(table.openedAt)`.
- Regenerate the Drizzle migration with `pnpm --filter @electron-template/db db:generate`.
- The `projectId` unique index at line 30-32 is correct (upsert target for `onConflictDoUpdate`) and should stay.

---

### 3. Dead `@orpc/server` dependency in `apps/web/package.json:20`

**Type:** tech debt | **Effort:** xs | **Status:** logged here

The web app declares `@orpc/server: ^1.14.3` in its `dependencies`, but only `@orpc/client` is imported (`apps/web/src/lib/orpc.ts:1, 19`). The `@orpc/server` import never executes in the renderer bundle.

**Why this matters:**
- Tree-shaking doesn't catch it because it's in `dependencies`, not `devDependencies`.
- Bumps install size and is a footgun: a developer might add a server-only import thinking the package is available, and the renderer would silently fail at build time.

**Recommended fix:**
- Move `@orpc/server` to `devDependencies` if needed for type checking only, or remove it entirely.

---

### 4. `as any` cast in `apps/web/src/lib/orpc.ts:24` — load-bearing TS 6 / oRPC workaround

**Type:** sharp edge | **Effort:** unknown (upstream) | **Status:** documented in package CLAUDE.md files, no action

```ts
// TypeScript 6 has compatibility issues with oRPC client types
// The runtime behavior is correct - this is a known upstream issue
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
client = createORPCClient(link) as any
```

The cast is **load-bearing**: TS 6's `DecoratedProcedure` (oRPC's client return type) lacks call signatures, so the typed client cannot be used directly. The `as any` bypasses type safety on the client side. The same workaround is used at `apps/web/src/routes/_app.index.tsx:26, 37` (demo route only).

**Documented in:** `packages/api/CLAUDE.md` and `packages/db/CLAUDE.md`. Will need a coordinated upgrade when oRPC ships call signatures.

**Why not memory:** this is a known sharp edge tracked in package-level CLAUDE.md files, and will be resolved by an upstream change, not by us. Nothing to action.

---

### 5. Inconsistent folder vs flat-file pattern in `packages/api/src/routes/`

**Type:** tech debt | **Effort:** s | **Status:** logged here

Domains in `packages/api/src/routes/` are organized inconsistently:
- **Folders** (with `index.ts` + handler files): `system/`, `users/`
- **Flat files**: `projects.ts`, `settings.ts`

**Why this matters:**
- The folder pattern is the established convention (factory closures with `create<Domain>Routes(db, store)`).
- Flat files are debt from the rapid V2.0.0 work where the settings domain grew out of the registry prototype.
- A new developer adding a third pattern (e.g., nested sub-folders) would be plausible without this being flagged.

**Recommended fix:**
- Migrate `projects.ts` and `settings.ts` to folder structure when either next needs a second handler. Do not touch the current single-handler files for the sake of consistency alone.

---

### 6. CI atomic principle violations: `build-desktop.yml` and `release-desktop.yml`

**Type:** known exception | **Effort:** l (would need full pipeline refactor) | **Status:** documented in `learnings/ci-atomic-principle.md`

The principle "one workflow file = one action" is violated by:
- `build-desktop.yml` (4 actions: SDK build → web build → desktop build → copy renderer)
- `release-desktop.yml` (6 actions across 2 jobs: build + publish)

**Why these are exceptions:** the desktop build depends on the build artifacts of `ui`, `sdk`, `api`, and `web` (the renderer bundles into the Electron binary). Splitting into separate per-package build workflows would require fragile cross-workflow `needs:` dependencies or sequential jobs in one file (which is what we have).

**Recommended treatment:** keep the monolith, but ensure each `run:` step has a clear `name:` label so the step that failed is obvious in the run log. This is already the case. No action needed — the exception is now documented in memory.

## Summary

| # | Title | Type | Effort | Status |
|---|---|---|---|---|
| 1 | projects.ts zombie stub wired into before-quit | bug | xs | GitHub issue #30 |
| 2 | Double unique index on recent_projects.openedAt | bug | xs | Logged, not yet filed |
| 3 | Dead @orpc/server dep in web | debt | xs | Logged |
| 4 | as any cast for TS 6 / oRPC | sharp edge | unknown | Documented, no action |
| 5 | Folder vs flat-file inconsistency in api/routes | debt | s | Logged |
| 6 | CI atomic violations in build-desktop + release-desktop | known exception | l | Documented in memory |

## Cross-references

- Existing audit: `docs/plans/template-audit-remediation.md` (2026-06-22) — covers 3 critical + 5 major findings from a separate review
- F2 settings architecture: `.claude/agent-memory/tech-lead/project/project-f2-settings-architecture.md` — context for anomaly #1 (F5 projects work)
- Tech-lead memory: `.claude/agent-memory/tech-lead/learnings/ci-atomic-principle.md` (newly created for anomaly #6)
- Tech-lead memory: `.claude/agent-memory/tech-lead/reference/orpc-bridge.md` (updated for context on anomaly #4)
- Tech-lead memory: `.claude/agent-memory/tech-lead/feedback/electron-security-model.md` (newly created)
- Tech-lead memory: `.claude/agent-memory/tech-lead/reference/package-boundary-rules.md` (newly created)
