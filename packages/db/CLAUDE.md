# CLAUDE.md — `@electron-template/db`

Database layer for the Electron template. Wraps Drizzle ORM + better-sqlite3
into a factory-style API with auto-migrations and a clean lifecycle.

## When to use this package

- Reading / writing structured data from the Electron main process or the
  oRPC handlers in `packages/api`.
- Anything that touches the user / post / etc. tables.

**Do not** import this package from the renderer process. The renderer is
sandboxed and must go through `packages/api` over `MessagePort`.

## Architecture at a glance

```
src/
├── client.ts          # initDatabase() + closeSqlite() — factory, no global state
├── migrator.ts        # runMigrations(db) — applies pending Drizzle migrations
├── migrations.ts      # resolveMigrationsDir() — path resolver (dev + packaged)
├── index.ts           # public surface
└── schema/
    └── index.ts       # all tables + $inferSelect / $inferInsert types

drizzle/               # generated SQL files (committed to git)
└── 0000_<name>.sql
└── meta/
    └── _journal.json

scripts/
└── copy-drizzle.mjs   # build step: drizzle/ → dist/drizzle/ for packaged builds

dist/                  # tsc output (gitignored)
└── drizzle/           # copied from ../../drizzle at build time
```

**No module-level mutable state.** `initDatabase()` returns a fresh handle
every time. There is no `_db` global, no `getDb()` side-channel. The only way
to access the DB is via the handle returned from `initDatabase()`.

## Public API

```ts
import {
  initDatabase,    // (config) => { sqlite, db }
  closeSqlite,     // (handle) => void
  runMigrations,   // (db) => void
  users,           // table object
  posts,           // table object
  type AppDatabase,
  type User, type NewUser,
  type Post, type NewPost
} from '@electron-template/db'
```

### `initDatabase(config)`

Opens a SQLite file at `<config.dataPath>/database.sqlite`, applies pragmas,
returns a typed handle. **Synchronous** (better-sqlite3 is sync).

```ts
const handle = initDatabase({ dataPath: '/path/to/data' })
//   ^? { sqlite: Database.Database, db: AppDatabase }
```

Applied pragmas:
- `journal_mode = WAL` — concurrency, fewer lock errors
- `foreign_keys = ON` — FK constraints enforced
- `synchronous = NORMAL` — safe with WAL, ~10x faster than FULL
- `busy_timeout = 5000` — wait up to 5s on lock contention instead of throwing

### `closeSqlite(handle)`

Runs `wal_checkpoint(TRUNCATE)` to flush the WAL into the main DB file, then
calls `sqlite.close()`. **Idempotent** — safe to call multiple times. Catches
and swallows errors that may occur on already-closed handles.

Always wire this to `app.on('before-quit')` in the Electron main process.

### `runMigrations(db)`

Applies any pending migrations from `drizzle/`. **Synchronous**, **idempotent**.
Safe to call on every boot — Drizzle tracks applied migrations in
`__drizzle_migrations`.

The path is resolved at runtime via `import.meta.url` so it works in both:
- **Dev**: `packages/db/drizzle/` (via pnpm symlink)
- **Packaged**: `packages/db/dist/drizzle/` (copied by `scripts/copy-drizzle.mjs` at build)

## Adding a new table

1. **Create the table file** in `src/schema/<table>.ts`:

   ```ts
   import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
   import { users } from './users.js'

   export const posts = sqliteTable('posts', {
     id: integer('id').primaryKey({ autoIncrement: true }),
     title: text('title').notNull(),
     content: text('content'),
     userId: integer('user_id').references(() => users.id),
     createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
   })

   export type Post = typeof posts.$inferSelect
   export type NewPost = typeof posts.$inferInsert
   ```

2. **Re-export** from `src/schema/index.ts`:

   ```ts
   export { users } from './users.js'
   export { posts } from './posts.js'
   export type { User, NewUser } from './users.js'
   export type { Post, NewPost } from './posts.js'
   ```

3. **Re-export** the table from `src/index.ts`:

   ```ts
   export { posts } from './schema/index.js'  // already done if you use src/schema/index.ts
   ```

4. **Generate the migration**:

   ```bash
   pnpm --filter @electron-template/db db:generate
   ```

   This writes `drizzle/0001_<name>.sql` + updates `meta/_journal.json`.
   **Commit these files.**

5. **Build**: `pnpm --filter @electron-template/db build`
   (this also runs `scripts/copy-drizzle.mjs` to copy `drizzle/` → `dist/drizzle/`).

6. **Test**: write tests in `tests/crud/<table>.test.ts` using the shared
   `createDBTestContext()` helper (see `tests/helpers.ts`).

## Migration workflow

```
src/schema/*.ts   →   pnpm db:generate   →   drizzle/0000_*.sql + meta/_journal.json
                                              ↓
                                       scripts/copy-drizzle.mjs (build only)
                                              ↓
                                       dist/drizzle/* (shipped to consumers)
                                              ↓
                                       runMigrations(db) at boot (idempotent)
```

**Do not** edit files in `drizzle/` manually. They are generated artifacts.
Edit the schema in `src/schema/` and re-run `db:generate`.

**Do not** delete migrations after they have been applied in production.
Add new ones. Drizzle tracks applied migrations by hash in `__drizzle_migrations`.

## Lifecycle pattern (Electron main process)

```ts
// apps/desktop/src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { initDatabase, closeSqlite, runMigrations } from '@electron-template/db'

const dataPath = join(app.getPath('userData'), 'data')
const handle = initDatabase({ dataPath })
runMigrations(handle.db)  // auto-migrate at boot

// ... wire IPC, create windows, etc. ...

app.on('before-quit', () => {
  closeSqlite(handle)  // graceful WAL checkpoint + close
})
```

## Testing

```
tests/
├── helpers.ts                # createDBTestContext() — shared fixture
├── lifecycle/init.test.ts    # initDatabase, closeSqlite, pragmas
├── migrations/schema.test.ts # idempotency, FK constraints
├── crud/users.test.ts        # direct CRUD on the users table
├── concurrency/wal.test.ts   # WAL + busy_timeout behavior
└── edge-cases/data.test.ts   # unicode, long strings, SQL injection
```

Run:
```bash
pnpm --filter @electron-template/db test
```

All tests use **real SQLite on tmpdir**, no mocks. `createDBTestContext()`
returns `{ handle, dataPath, cleanup }` — call `cleanup()` in `afterEach` to
release the file lock and remove the temp directory.

### Adding tests for a new table

Create `tests/crud/<table>.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDBTestContext, type DBTestContext } from '../helpers.js'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('CRUD on <table>', () => {
  it('starts empty', () => {
    expect(ctx.handle.db.select().from(myTable).all()).toEqual([])
  })
  // ... at minimum: insert, select, delete, edge cases
})
```

## Conventions

### DO

- **Use `db.select().from(table)` patterns** for queries — fully typed, no surprises.
- **Use `.returning().all()`** for inserts when you need the generated id/timestamps.
- **Use `.run()`** for mutations that don't return data (delete, update).
- **Use `.get()`** for `select` queries that return at most one row.
- **Re-export types from `schema/index.ts`** so consumers get `$inferSelect` / `$inferInsert`.
- **Add tests** that cover: isolation (empty initial state), happy path, edge cases (unicode, long, null), and concurrency under WAL.

### DO NOT

- **Do not introduce a singleton** (`let _db = null`). The factory pattern is intentional — it keeps the package testable and lets you have multiple DBs in tests.
- **Do not call `getDb()` from a global**. There is no such function. Pass the handle explicitly.
- **Do not use `db.query.<table>.*`** (RQB). The schema is bound (`drizzle({ client, schema })`) but the project convention is explicit `db.select().from(...)` patterns.
- **Do not edit `drizzle/` files manually**. Always regenerate from schema.
- **Do not import `@electron-template/db` from the renderer**. Renderer goes through `packages/api`.
- **Do not store Date as ISO strings** — use `{ mode: 'timestamp' }` so Drizzle returns JS `Date` objects.

## Trade-offs / rationale

### Why a factory, not a singleton

A singleton (`let _db` + `getDb()`) is the standard anti-pattern in junior
codebases. It hides dependencies, makes tests impossible to parallelize, and
breaks the moment you need two DBs (e.g., a test fixture + the production DB).

`initDatabase()` is explicit: you see where the DB comes from, you can swap it
for a mock in tests, and you can have as many as you want.

### Why `busy_timeout = 5000`

better-sqlite3 throws `SQLITE_BUSY` immediately when a write is blocked by a
read lock. With `busy_timeout`, the connection waits up to N ms before throwing.
5000ms (5s) is enough for almost all real workloads without masking real bugs.

### Why `synchronous = NORMAL` (not FULL)

With WAL mode, `synchronous = NORMAL` is safe — the WAL itself guarantees
durability. `FULL` would force an fsync on every commit (~10x slower for
marginal benefit on a desktop app where the user controls power).

### Why copy `drizzle/` into `dist/` at build time

In dev, pnpm symlinks `node_modules/@electron-template/db` → `packages/db/`,
so `drizzle/` is reachable directly. In packaged Electron builds
(`electron-builder`), the symlink target may not ship. The `files: ["dist"]`
in `package.json` + the `copy-drizzle.mjs` script guarantee the SQL files
ship with the binary.

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@electron-template/db'` at runtime | `dist/` not built | `pnpm --filter @electron-template/db build` |
| `migrations folder not found` at boot | `dist/drizzle/` empty | Check `scripts/copy-drizzle.mjs` ran in the build chain |
| `relation "users" does not exist` after a fresh install | Migrations not run | Call `runMigrations(handle.db)` after `initDatabase` |
| `SQLITE_BUSY` under load | `busy_timeout` not set | Check the pragma in `client.ts` |
| `Date is not a Date` after reading from DB | Missing `{ mode: 'timestamp' }` | Add it to the column definition and regenerate |
| Foreign key not enforced | `foreign_keys` pragma not set | Same — check `client.ts` |

## Versioning & upgrade path

- **Current Drizzle**: `^0.45.2` (`drizzle-orm` + `drizzle-kit`)
- **Drizzle v1 RC** is available as `@beta` — it restructures the migrations
  folder (one folder per migration, no `journal.json`), consolidates the
  validator packages (`drizzle-zod` → `drizzle-orm/zod`), and removes RQB v1.
  None of these changes affect this package's public API.
- We intentionally stay on `0.45.x` until Drizzle v1 is stable.