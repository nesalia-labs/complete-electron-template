---
name: code-style-and-structure
description: Granular code style and project structure preferences — file naming, directory layout, type definitions, imports/exports, naming conventions, comments, error handling, async, TS specifics, testing.
metadata:
  type: feedback
---

# Code Style and Structure

Code-level preferences observed from the codebase. Items marked **tentative** are my best inference — correct if wrong.

## File naming

**Observed:**
- Source files: lowercase or camelCase — `client.ts`, `migrator.ts`, `migrations.ts`, `helpers.ts`, `utils.ts`, `use-mobile.ts` (hooks)
- Vendored shadcn components: kebab-case — `input-otp.tsx`, `dropdown-menu.tsx`, `sidebar.tsx`, `button.tsx`
- Schema files: lowercase — `src/schema/users.ts`, `src/schema/posts.ts`
- Test files: `*.test.ts` (not `.spec.ts`)
- Barrel files: always `index.ts` / `index.tsx`

**Convention (confirmed 2026-06-23, universal — no grandfathering):**
- **All component files: kebab-case** — `app-sidebar.tsx`, `app-header.tsx`, `language-switcher.tsx`, not `AppSidebar.tsx`/`AppHeader.tsx`/`LanguageSwitcher.tsx`. Universal — applies to existing files too (renamed mid-V2 to align with shadcn convention).
- Hooks: kebab-case (`use-mobile.ts`)
- Helpers/utilities: camelCase (`initDatabase`, `closeSqlite`)
- React component exports inside the file remain PascalCase per TS convention (`export function AppSidebar() {}` inside `app-sidebar.tsx`).

**Why:** consistent with shadcn v4 vendored components (`dropdown-menu.tsx`, `input-otp.tsx`, `sidebar.tsx`) and aligns the entire `packages/ui` + `apps/web` on one naming convention. Removes the historical drift between hand-written and vendored components.

**How to apply:** when proposing a new component file, default to `kebab-case.tsx`. When renaming an existing PascalCase component, use `git mv` to preserve history. The export inside keeps PascalCase.

## Component folder grouping (`apps/web/src/components/`)

For V2, components in `apps/web` are grouped by role into subfolders:

- `components/sidebars/` — app shell sidebars (`app-sidebar.tsx`)
- `components/headers/` — top-bar / inset headers (`app-header.tsx`)
- `components/<feature>/` — feature-scoped components (e.g., `components/projects/` for F4, `components/settings/` for F2)

Co-located files at `components/` root: only small, single-purpose components that don't fit a category (`language-switcher.tsx`, future `theme-toggle.tsx`, etc.).

**Why:** the `apps/web/src/components/` flat layout was getting cluttered by V2 features. Role-based subfolders match the V2 route layout (`routes/_app.tsx`, `routes/_app.settings.tsx`) and make it clear which components belong to which shell region.

**How to apply:** when introducing a new component in `apps/web`, place it in the role-specific subfolder. Update import paths to reflect the move. Verify typecheck + build before committing.

## Directory structure

**Observed (from `packages/api/CLAUDE.md` and `packages/db/CLAUDE.md`):**
```
<package>/
├── src/                          # source code
│   ├── index.ts                  # public surface (barrel)
│   └── <domain>/                 # domain-grouped for routers
│       └── index.ts
├── tests/                        # tests mirror src/ domains
│   ├── helpers.ts                # shared fixture (createTestContext / createDBTestContext)
│   └── <domain>/<feature>.test.ts
├── scripts/                      # build/maintenance scripts (.mjs)
├── dist/                         # tsc output (gitignored)
├── drizzle/                      # generated SQL migrations (committed)
├── vitest.config.ts              # test config
└── package.json
```

**Tentative but evidence-based:**
- `src/` is the source root — flat, no nested `lib/` or `core/` indirection
- Domain grouping inside `src/` for routers (`routes/users/`, `routes/system/`)
- Schema files in their own subdir (`packages/db/src/schema/`) to group table definitions
- Tests mirror source structure (`tests/users/` ↔ `src/routes/users/`) — strong convention
- `helpers.ts` at the `tests/` root for shared fixtures, not co-located
- Build scripts at the package root in `scripts/` (e.g., `copy-drizzle.mjs`)

## Type definitions

**Observed:**
- Schema types derived via Drizzle `$inferSelect` / `$inferInsert`
- Types aggregated in `src/schema/index.ts`, re-exported from `src/index.ts`
- Type-only re-exports across packages (e.g., `AppRouter` from `api` → `sdk` → renderer)
- `type` keyword used for derived types (`type AppDatabase = ReturnType<...>`)
- `interface` used for explicit object shapes (`interface DatabaseConfig { ... }`)

**Convention:**
- Default to deriving types from runtime/operations when possible (`ReturnType`, `Awaited`, Drizzle's `$inferSelect`)
- Use `interface` for declared object shapes with intent to extend
- Use `type` for unions, derived types, and complex compositions

**Tentative:**
- Prefer `interface` over `type` for component props? (Not observed yet — `apps/web/src/components/ui/button.tsx` not read)

## Imports

**Observed:**
- External imports first (`@orpc/server`, `drizzle-orm`, `zod`), then internal (`@electron-template/db`)
- `node:` protocol for Node built-ins (`import { mkdirSync } from 'node:fs'`)
- `.js` extension on internal imports (TypeScript ESM convention) — `import * as schema from './schema/index.js'`
- Type-only imports use `type` keyword inline — `import { users, type AppDatabase } from '@electron-template/db'`

**Tentative:**
- No path aliases (`@/*`) — relative imports throughout. Default: stick with relative.
- Blank line between external and internal import groups

## Exports

**Observed:**
- Named exports only (no default exports visible)
- `index.ts` barrel files at every level (`src/index.ts`, `src/routes/index.ts`, `src/schema/index.ts`)
- Barrel files re-export both values and types
- Public surface explicitly declared in `src/index.ts` (not auto-generated)

**Convention:** every package has a clean public surface at `src/index.ts` — internal modules import from specific paths, consumers import from the package root.

## Naming conventions

**Observed:**
- Functions: camelCase, verbs or `create<X>` for factories — `initDatabase`, `closeSqlite`, `createUsersRoutes`, `runMigrations`
- Types/Interfaces: PascalCase — `AppDatabase`, `DatabaseConfig`, `DatabaseHandle`, `User`, `NewUser`
- Boolean variables: not observed explicitly; default JS convention (`is*`, `has*`, `should*`)
- Constants: not used in the codebase; pragma values are inline strings (`'journal_mode = WAL'`)
- Tables: lowercase, plural — `users`, `posts`

**Tentative:**
- No `I*` prefix on interfaces — `User`, not `IUser`. Consistent with modern TS style.
- No `T*` prefix on type aliases
- No `_` prefix on unused parameters
- File names match the primary export — `migrator.ts` exports `runMigrations`, `client.ts` exports `initDatabase`

## Comments

**Observed:**
- Minimal comments in code — only when something is non-obvious
- The `// WAL checkpoint can fail on already-closed or read-only connections; safe to ignore.` (packages/db/src/client.ts:36) is a model example
- No file-level header comments
- No JSDoc on exported functions in code (lives in `CLAUDE.md` package docs instead)

**Convention:**
- Comment when: behavior is surprising, side effects exist, error suppression is intentional, or the workaround is load-bearing
- Don't comment: obvious code, what the function does (the name should say)
- Use `//` for single-line, `/* */` for multi-line if needed

## Error handling

**Observed:**
- `throw new Error('message')` in procedures (`packages/api/src/routes/users/index.ts:20`) — currently bare
- `try/catch` with intentional swallow + comment in `closeSqlite` (`packages/db/src/client.ts:33-37`)
- `ORPCError` recommended but not yet adopted in code — flagged in `packages/api/CLAUDE.md`

**Tentative:**
- Default: throw plain `Error` for unexpected states in procedures; migrate to `ORPCError` when the codebase is ready
- Don't use Result types — the project uses exceptions + Zod validation
- `try/catch` only when the error is recoverable; if it's not, let it propagate

## Async patterns

**Observed:**
- Synchronous where possible (`better-sqlite3` is sync, so the DB API is sync)
- oRPC handlers are sync (return values directly, not Promises) — `return row`, not `return Promise.resolve(row)`
- Tests use `async/await` because vitest supports it natively

**Convention:**
- Sync by default; async only when the underlying API is async
- `Promise.all` for parallel awaits when independence is clear
- No `.then()` chains — `async/await` throughout

## TypeScript specifics

**Observed:**
- TS 6.0.3 (`CLAUDE.md:60`)
- Strict mode implied (Zod-first, no `any` except documented workarounds)
- `as any` only at documented workaround sites (`apps/web/src/lib/orpc.ts:24`, `packages/api/tests/helpers.ts:50`)
- Drizzle timestamp columns use `{ mode: 'timestamp' }` to get JS `Date` objects
- No `enum` — use union types where observed

**Tentative:**
- No `enum` keyword — prefer union types (`type Status = 'pending' | 'in_progress' | 'completed'`)
- No namespaces
- No namespaces in observable code
- `readonly` on immutable data structures where it adds value (not religiously)
- `as const` for literal narrowing when needed

## Testing

**Observed (from package CLAUDE.md):**
- Vitest (`vitest.config.ts` per package)
- Real infrastructure tests: real SQLite in tmpdir, real `MessageChannel` in IPC tests
- No mocks (explicit project policy: `packages/api/CLAUDE.md` and `packages/db/CLAUDE.md` both say "no mocks")
- Test layout: `tests/<domain>/<feature>.test.ts`
- Shared fixture at `tests/helpers.ts`, exports `createTestContext()` or `createDBTestContext()`
- Test types: `isolation` (empty state), `happy path`, `edge cases`, `concurrency`, `lifecycle`
- Coverage matrix in `packages/api/CLAUDE.md`: system, users, errors, concurrency, lifecycle — full CRUD + edge cases
- Use `ctx.cleanup()` in `afterEach` to release file locks + remove tmpdir

**Convention:**
- Tests use real infrastructure. Mock only at system boundaries where real is impractical (external APIs, OS calls).
- One `describe` per feature area, one `it` per behavior.
- `beforeEach` creates ctx, `afterEach` cleans up.
- Test names use imperative mood (`creates a user`, `rejects invalid input`).
- For validation tests: cast to `any` to bypass type-check on invalid input (with eslint-disable comment).

**Tentative:**
- No `*.spec.ts` convention — only `*.test.ts`
- One assertion per test where natural; multiple assertions OK if testing one behavior
- Snapshot testing not observed; default to explicit `expect()` assertions

## Tooling config

**Observed:**
- ESLint 10 (`CLAUDE.md:60`) — flat config (`eslint.config.js` or `eslint.config.mjs` per package)
- TypeScript 6.0.3
- pnpm 9 for package management
- Vitest 3 for testing
- `pnpm --filter @electron-template/<pkg>` for package-scoped commands

**Tentative:**
- ESLint with TypeScript-ESLint, `eslint-disable-next-line` for documented workarounds
- No Prettier (formatting enforced via ESLint rules) — **needs verification**

## Anti-patterns to flag in code review

When reviewing or writing code, flag these specifically:

1. **Singleton DB instance** — use `initDatabase()` factory
2. **Hand-editing `drizzle/*.sql`** — regenerate via `pnpm db:generate`
3. **Service classes** (`class UserService`) — use factory functions
4. **`queries.ts` wrapper module** — call Drizzle directly
5. **`db.query.users.findMany()`** (RQB) — use explicit `db.select().from(...)`
6. **Default exports** — use named exports
7. **Imports from internal paths by consumers** — `import from '@electron-template/api/src/...'` is a leak
8. **Mocks at infrastructure boundaries** — use real SQLite / real `MessageChannel`
9. **Bare `throw new Error(...)` in oRPC procedures** — use `ORPCError` (migration in progress)
10. **`as any` outside the documented workaround sites** — needs justification

Related: [[code-taste]], [[quality-bar]]