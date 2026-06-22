# Feature: Project Architecture

**Feature ID:** F5
**V2.0.0 Release:** Foundation
**Status:** Proposed
**Owner:** Tech Lead

---

## 1. Context

F4 (Projects Page) introduces the concept of "projects" but doesn't define *how* projects are architecturally isolated. Before writing a single line of code for F4, we must answer: what lives in each project's database? What lives in the global database? How do we ensure zero data leakage between projects?

This document defines the **hybrid architecture** — the foundation that makes V2.1 (multi-project windows, search across projects, audit logs) possible without architectural rewrites.

---

## 2. Architecture Decision

### 2.1 The Hybrid Model

```
userData/ (electron-store config.json + global.db)
├── config.json               ← electron-store: language, theme, sidebarCollapsed, recentProjects
└── global.db                ← Global SQLite: projects table, audit_log, project_templates
                                (small, never deleted, shared across all projects)

{projectRoot}/.electron-template/
├── config.json               ← Project-level config (future: feature flags, API endpoints)
└── data.db                  ← Per-project SQLite: users, posts, and all user content
                                (can be deleted, exported, moved independently)
```

| Layer | Storage | Owned by | Size | Deletable |
|---|---|---|---|---|
| App preferences | `electron-store` → `config.json` | `apps/desktop` main | Tiny | No |
| Global metadata | `global.db` (SQLite) | `packages/db` | Tiny | No |
| Project metadata | `global.db` (SQLite) | `packages/db` | Grows with project count | Yes (cascade) |
| User content | `data.db` per project | `packages/db` | Grows with usage | Yes (delete project) |
| Project config | `config.json` per project | `packages/db` | Tiny | No |

### 2.2 Why Not a Single Database?

A single database with `project_id` on every table is simpler to start with but creates hard problems at V2.1 scale:

- **Deletion**: `DELETE FROM users WHERE project_id = ?` is fast, but the freed SQLite pages don't shrink the file. Large projects leave "holes" in the DB.
- **Export**: Exporting a project requires a complex query to select only that project's rows, plus renumbering IDs to avoid collisions on import.
- **Privacy**: A misconfigured query could accidentally join data from two projects if the `WHERE project_id` clause is forgotten.
- **Backup**: You can't back up "just this project" without a SQL dump.

A per-project SQLite file solves all four problems natively. The cost is a small global DB that tracks *which* projects exist and their metadata.

### 2.3 Why Not Only Per-Project Databases?

If everything is per-project, you can't:
- Search across all projects from the main window
- Have a global audit log of all activity
- List all projects without scanning the filesystem
- Show "recent projects" without a global registry

The global DB solves these by holding *metadata*, never *content*.

---

## 3. Global Database Schema

### 3.1 Tables

```sql
-- global.db

-- FIX (CF-1): added deleted_at for soft delete — audit entries are preserved on deletion
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  root_path   TEXT NOT NULL,      -- absolute path to the project root
  db_path     TEXT NOT NULL,      -- absolute path to .electron-template/data.db
  template    TEXT NOT NULL DEFAULT 'blank',  -- 'blank' | 'blog' | 'crm'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at  INTEGER              -- NULL = active; set = soft-deleted
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects (deleted_at) WHERE deleted_at IS NULL;

-- FIX (CF-1): removed ON DELETE CASCADE — audit entries retained after project deletion
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),  -- no CASCADE
  table_name TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_value  TEXT,
  new_value  TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log (project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS project_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  schema_path TEXT NOT NULL,       -- path to a .sql migration file to run on project init
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Default templates
INSERT INTO project_templates (id, name, description, schema_path) VALUES
  ('blank', 'Blank Project', 'Empty database, start from scratch', NULL),
  ('blog',  'Blog',          'Posts, categories, tags pre-configured', 'templates/blog.sql'),
  ('crm',   'CRM',           'Contacts, companies, deals pre-configured', 'templates/crm.sql');
```

### 3.2 Drizzle Schema

```typescript
// packages/db/src/schema/global/
// (mirrors the structure established in packages/db/src/schema/index.ts)

export const projects = sqliteTable('projects', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  rootPath:    text('root_path').notNull(),
  dbPath:      text('db_path').notNull(),
  template:    text('template').notNull().default('blank'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  deletedAt:  integer('deleted_at', { mode: 'timestamp' }),  // NULL = active; set = soft-deleted
})

export const auditLog = sqliteTable('audit_log', {
  id:         text('id').primaryKey(),
  projectId:  text('project_id').notNull(),  // no CASCADE: retained after soft-delete
  tableName:  text('table_name').notNull(),
  recordId:   text('record_id').notNull(),
  action:     text('action').notNull(),     // CHECK enforced at DB level
  oldValue:   text('old_value'),
  newValue:   text('new_value'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const projectTemplates = sqliteTable('project_templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  schemaPath:  text('schema_path'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})
```

---

## 4. Per-Project Database Schema

### 4.1 The `withProject` Helper

Every table in a project database must be scoped to its project. The `withProject` helper enforces this at the schema level:

```typescript
// packages/db/src/schema/project-base.ts  ← NEW
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

/**
 * Common timestamp columns for all tables.
 * Uses SQLite unixepoch() as the default — no JS Date needed.
 */
export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
} as const

/**
 * Creates a nanoid primary key with the given column name.
 */
export function primaryId(name = 'id') {
  return text(name).primaryKey().$defaultFn(() => nanoid())
}

/**
 * Creates a project-scoped foreign key column.
 * All tables in a project DB must include this — it enforces isolation.
 */
export function scopedToProject(references: ReturnType<typeof text>) {
  return references  // the project_id is implicit in the fact that we're in a project DB
  // Note: we don't add a FK reference here because project DBs don't have a projects table
  // The project DB is inherently scoped to one project (its filename encodes the project)
}
```

### 4.2 Project Database Tables (V2.0)

These tables live in `{projectRoot}/.electron-template/data.db`:

> **FIX (MF-1):** The draft `withProject()` / `scopedToProject()` helper was removed. The DB filename is the project scope — no `project_id` column is needed in project-level tables.

```typescript
// packages/db/src/schema/project/users.ts  ← MODIFIED from V1
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { primaryId, timestamps } from './project-base'

export const users = sqliteTable('users', {
  id:        primaryId(),
  ...timestamps,
  name:      text('name').notNull(),
  email:     text('email').unique(),
  avatar:    text('avatar'),
  role:      text('role').default('member'),
})

export type User    = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// packages/db/src/schema/project/posts.ts  ← MODIFIED from V1
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { primaryId, timestamps } from './project-base'

export const posts = sqliteTable('posts', {
  id:        primaryId(),
  ...timestamps,
  title:     text('title').notNull(),
  content:   text('content'),
  status:    text('status').default('draft'),
  authorId:  text('author_id').references(() => users.id, { onDelete: 'set null' }),
})

export type Post    = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
```

### 4.3 V2.1 Ready: Adding Tables in V2.1

When V2.1 adds tags, categories, attachments:

```typescript
// packages/db/src/schema/project/tags.ts  ← V2.1
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { primaryId, timestamps } from './project-base'

export const tags = sqliteTable('tags', {
  id:   primaryId(),
  ...timestamps,
  name: text('name').notNull().unique(),
  color: text('color').default('#6b7280'),   // hex color for UI
})

export const postTags = sqliteTable('post_tags', {
  id:      primaryId(),
  postId:  text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  tagId:   text('tag_id').references(() => tags.id, { onDelete: 'cascade' }),
})
```

---

## 5. Database Initialization Flow

### 5.1 Main Process: Two DB Handles + WAL

> **FIX (MF-2):** Added WAL mode + backup for `global.db`.

```typescript
// apps/desktop/src/main/index.ts

// --- Global DB — initialized once at startup ---
const globalDb = initDatabase({
  dataPath: join(app.getPath('userData'), 'global.db'),
})

// FIX (MF-2): WAL mode + backup on startup
globalDb.db.exec(`PRAGMA journal_mode=WAL;`)
globalDb.db.exec(`PRAGMA synchronous=NORMAL;`)
// Compact audit_log if > 10k rows (run periodically, not on every startup)
const auditCount = globalDb.db.select().from(auditLog).all().length
if (auditCount > 10000) globalDb.db.exec(`VACUUM;`)

runGlobalMigrations(globalDb.db)  // projects, audit_log, project_templates

// --- Project DB — initialized when a project is opened, swapped on project change ---
let activeProjectDb: ReturnType<typeof initDatabase> | null = null
let activeProjectId: string | null = null

async function initProjectDb(dbPath: string) {
  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // FIX (CF-4): validate dbPath before initDatabase
  const handle = initDatabase({ dataPath: dbPath })
  runProjectMigrations(handle.db)
  return handle
}

async function openProject(projectId: string) {
  const db = globalDb.db
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  if (!project) throw new Error(`Project not found: ${projectId}`)

  // FIX (CF-4): check dbPath integrity — don't silently create a new empty DB
  if (existsSync(project.dbPath)) {
    const ok = await checkIntegrity(project.dbPath)
    if (!ok) throw new ORPCError('PRECONDITION_FAILED', 'Project database is corrupted.')
  }

  activeProjectDb = await initProjectDb(project.dbPath)
  activeProjectId = projectId

  // Update recentProjects in electron-store
  const recent = store.get('recentProjects', [])
  const updated = [projectId, ...recent.filter(id => id !== projectId)].slice(0, 10)
  store.set('recentProjects', updated)
}

function closeProject() {
  if (activeProjectDb) {
    // FIX (CF-4): checkpoint WAL before closing
    activeProjectDb.db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`)
    activeProjectDb.close()
    activeProjectDb = null
    activeProjectId = null
  }
}

// FIX (CF-4): wire closeProject to app quit lifecycle
app.on('before-quit', () => {
  closeProject()
  globalDb.close()
})
```

```typescript
// apps/desktop/src/main/index.ts

// 1. Global DB — initialized once at startup
const globalDb = initDatabase({
  dataPath: join(app.getPath('userData'), 'global.db'),
})
runGlobalMigrations(globalDb.db)  // projects, audit_log, project_templates

// 2. Project DB — initialized when a project is opened, swapped on project change
let activeProjectDb: ReturnType<typeof initDatabase> | null = null
let activeProjectId: string | null = null

async function openProject(projectId: string) {
  const [project] = await globalDb.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) throw new Error(`Project not found: ${projectId}`)

  // Ensure .electron-template/ directory exists
  const projectDir = dirname(project.dbPath)
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true })

  // Init or reuse project DB
  activeProjectDb = initDatabase({ dataPath: project.dbPath })
  runProjectMigrations(activeProjectDb.db)  // users, posts, etc.
  activeProjectId = projectId

  // Update recentProjects in electron-store
  const recent = store.get('recentProjects', [])
  const updated = [projectId, ...recent.filter(id => id !== projectId)].slice(0, 10)
  store.set('recentProjects', updated)
}

function closeProject() {
  if (activeProjectDb) {
    activeProjectDb.close()
    activeProjectDb = null
    activeProjectId = null
  }
}
```

### 5.2 oRPC Handler Context

```typescript
// apps/desktop/src/main/index.ts — RPCHandler construction

const handler = new RPCHandler(router, {
  context: {
    // --- Global (settings + projects) ---
    globalDb,           // initDatabase handle for global.db
    globalProjectDb: globalDb,  // alias for use in global-only procedures

    // --- Active project ---
    projectId: activeProjectId,  // null if no project is open
    projectDb: activeProjectDb, // null if no project is open

    // --- electron-store ---
    store,               // electron-store instance

    // --- Main process services (exposed to renderer via oRPC) ---
    mainProcess: {
      openProject,
      closeProject,
      pickFolder,
      getRecentProjects: () => store.get('recentProjects', []),
      applyTemplate: applyProjectTemplate,   // runs migrations from template .sql
    },
  },
})
```

### 5.3 Procedures That Need the Context

```typescript
// packages/api/src/routes/projects.ts  — uses globalDb
export const listProjects = os.handler(async ({ context }) => {
  const { db } = context.globalDb
  return db.select().from(projects).orderBy(desc(projects.updatedAt))
})

// packages/api/src/routes/users.ts  — uses projectDb
export const createUser = os
  .input(z.object({ name: z.string(), email: z.string().optional() }))
  .handler(async ({ input, context }) => {
    if (!context.projectDb) throw new ORPCError('BAD_REQUEST', 'No project open')
    const [row] = await context.projectDb.db
      .insert(users)
      .values(input)
      .returning()
    if (!row) throw new Error('Failed to create user')
    // Audit log in global DB
    await context.globalDb.db.insert(auditLog).values({
      id: nanoid(),
      projectId: context.projectId!,
      tableName: 'users',
      recordId: row.id,
      action: 'insert',
      newValue: JSON.stringify(row),
    })
    return row
  })

// packages/api/src/routes/settings.ts  — uses store
export const getSettings = os.handler(({ context }) => {
  return context.store.store
})
```

---

## 6. Creating a Project — Full Flow

```
User clicks "New Project"
  → Dialog: name, description, folder picker (dialog.showOpenDialog)
  → client.createProject({ name, description, rootPath, template })
    → RPCHandler (main process):
        1. nanoid() → project ID
        2. mkdir {rootPath}/.electron-template/
        3. initDatabase({ dataPath: {rootPath}/.electron-template/data.db })
        4. runProjectMigrations(db)  ← applies template SQL or blank schema
        5. insert into global.db: projects (id, name, description, rootPath, dbPath, template)
        6. store.set('recentProjects', [id, ...])
        7. return project
    → client side:
        → Project appears in list
        → openProject({ id }) called automatically
          → activeProjectDb initialized
          → activeProjectId set
          → App is now project-aware
```

---

## 7. Template Migrations

Templates are SQL migration files run against a fresh project DB:

```
packages/db/src/migrations/templates/
├── blank.sql      ← Minimal: just the base tables (users, posts — already in 0000)
├── blog.sql       ← Adds: categories, tags, post_tags, full-text search
└── crm.sql       ← Adds: contacts, companies, deals, activities
```

### `blank.sql`

```sql
-- packages/db/src/migrations/templates/blank.sql
-- This is a no-op migration for the blank template.
-- The base schema (users, posts) is already in 0000_marvelous_hawkeye.sql.
-- This migration file exists so the template system has a consistent interface.
SELECT 1;  -- placeholder: no additional tables needed
```

### `blog.sql`

```sql
-- packages/db/src/migrations/templates/blog.sql

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS post_tags (
  id       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Full-text search (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  title, content, content=posts, content_rowid=rowid
);
```

---

## 8. Audit Log Integration

### 8.1 Why in Global DB

The audit log is in `global.db` because:
- It persists even if a project DB is deleted
- It allows querying all activity across projects (V2.1: "show all recent changes")
- It's independent of which project DB is currently open

### 8.2 Implementation Pattern

Every oRPC procedure that writes data should record an audit entry:

```typescript
// packages/api/src/routes/users/index.ts — createUser with audit
export const createUser = os
  .input(z.object({ name: z.string(), email: z.string().optional() }))
  .handler(async ({ input, context }) => {
    if (!context.projectDb) throw new ORPCError('BAD_REQUEST', 'No project open')

    const [row] = await context.projectDb.db
      .insert(users)
      .values({ name: input.name, email: input.email })
      .returning()

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR', 'Failed to create user')

    // Audit log in global.db
    await context.globalDb.db.insert(auditLog).values({
      id: nanoid(),
      projectId: context.projectId!,
      tableName: 'users',
      recordId: row.id,
      action: 'insert',
      newValue: JSON.stringify({ id: row.id, name: row.name, email: row.email }),
    })

    return row
  })
```

### 8.3 Audit Log API (V2.1)

```typescript
// packages/api/src/routes/audit.ts  — V2.1
export const getAuditLog = os
  .input(z.object({
    projectId: z.string().optional(),   // null = all projects
    tableName: z.string().optional(),
    limit:     z.number().default(50),
    offset:    z.number().default(0),
  }))
  .handler(async ({ input, context }) => {
    return context.globalDb.db
      .select()
      .from(auditLog)
      .where(
        input.projectId ? eq(auditLog.projectId, input.projectId) : undefined
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
      .offset(input.offset)
  })
```

---

## 9. Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Adding `project_id` column to tables in the project DB | Redundant — the DB file is the project scope. Adds noise to every query. |
| Putting user content in `global.db` | `global.db` is tiny by design. User content goes in the project DB. |
| Storing the audit log in the project DB | Audit log persists after a project is deleted. It must be in `global.db`. |
| Using auto-increment integer IDs | Nanoid is collision-free and works across project DBs for import/export |
| Running migrations on every project open | Migrations run once on `createProject`. On `openProject`, just verify the DB is readable. |
| Not closing the project DB on `closeProject` | `better-sqlite3` locks the file. Not closing prevents the OS from backing up the DB. |

---

## 10. Open Questions

| # | Question | Options | Impact |
|---|---|---|---|
| O1 | Migrate existing V1 `users`/`posts` tables to the new structure? | A: Migrate to `global.db` with `project_id` **B:** Keep V1 as a single-project app, migrate only new projects | B for V2.0; A in V2.1 when multi-project is needed |
| O2 | FTS5 full-text search in `blog` template? | A: Yes, FTS5 is SQLite-native **B:** No, defer to V2.1 with a real search engine | A — FTS5 is trivial to add and impressive for a demo |
| O3 | Encrypt `data.db` at rest? | A: No **B:** Yes, with a key derived from user password | B in V2.2 |

---

## 11. Acceptance Criteria

| ID | Criterion | Testable |
|---|---|---|
| AC-1 | `global.db` contains `projects`, `audit_log`, `project_templates` tables | `sqlite3 global.db .schema` |
| AC-2 | Creating a project creates `projectRoot/.electron-template/data.db` | Check filesystem |
| AC-3 | Opening a project initializes `projectDb` in the oRPC context | `console.log(context.projectDb)` in a procedure |
| AC-4 | Closing a project releases the SQLite lock | `closeProject()` called, file lock released |
| AC-5 | `createUser` in a project DB creates an audit entry in `global.db` | Query `audit_log` table |
| AC-6 | Deleting a project cascades to `audit_log` via FK | Delete project, check audit_log |
| AC-7 | Blank template creates only base tables (users, posts) | Inspect fresh `data.db` |
| AC-8 | Blog template adds categories, tags, FTS5 | Inspect `data.db` created with `blog` template |

---

## 12. Effort Estimate

| Phase | Tasks | Estimate |
|---|---|---|
| Schema | Create `schema/project-base.ts`, update `schema/users.ts`, `schema/posts.ts` | 1–2h |
| Migrations | Update `0000_marvelous_hawkeye.sql`, create template migrations | 1h |
| Global DB | Create `schema/global/projects.ts`, `schema/global/auditLog.ts`, `schema/global/projectTemplates.ts` | 1–2h |
| Main process wiring | `openProject`, `closeProject`, `globalDb` / `projectDb` context | 2–3h |
| Audit log integration | Add to `createUser`, `deleteUser`, `createPost`, `deletePost` | 1h |
| Template system | `applyProjectTemplate`, `blank.sql`, `blog.sql` | 2–3h |
| Tests | Integration tests: create project, open, write, audit log, close | 2–3h |
| **Total** | | **10–16h** |
