# CLAUDE.md — `@electron-template/api`

oRPC server router for the Electron template. Wires typed procedures to the
SQLite DB via a closure-based factory pattern.

## When to use this package

- Defining a new oRPC procedure that the renderer can call over `MessagePort`.
- Adding a new domain of routes (`users`, `posts`, `system`, …).
- Testing the full IPC round-trip (DB → procedure → port → client).

**Do not** import this package from the renderer. The renderer consumes
`AppRouter` as a type-only re-export via `@electron-template/sdk`.

## Architecture at a glance

```
src/
├── index.ts                   # public surface: createRouter, AppRouter, schema types
└── routes/
    ├── index.ts               # aggregator — createRouter(db) spreads all domains
    ├── system/
    │   └── index.ts           # createSystemRoutes() → { ping }
    └── users/
        └── index.ts           # createUsersRoutes(db) → { createUser, getUsers, ... }

tests/
├── helpers.ts                 # createTestContext() — MessageChannel + RPCHandler + RPCLink
├── system/ping.test.ts
├── users/{crud,edge-cases}.test.ts
├── errors/validation.test.ts
├── concurrency/wal.test.ts
└── lifecycle/database.test.ts

dist/                          # tsc output (gitignored)
└── routes/                    # mirrors src/routes/
```

## Public API

```ts
import {
  createRouter,           // (db) => AppRouter instance
  type AppRouter,          // ReturnType<typeof createRouter>
  type User, type NewUser,
  type Post, type NewPost
} from '@electron-template/api'
```

### `createRouter(db)`

Builds the full router with a concrete `AppDatabase` closed over by each
procedure. Synchronous. Returns a plain object whose keys are the public
procedure names.

```ts
import { initDatabase } from '@electron-template/db'
import { createRouter } from '@electron-template/api'

const { db } = initDatabase({ dataPath: '/path/to/data' })
const router = createRouter(db)

// router.ping({ message: 'hello' })          // → 'pong: hello'
// router.createUser({ name: 'Alice' })        // → User
// router.getUsers()                            // → User[]
```

The router object is what gets handed to `RPCHandler` in the main process.

### `AppRouter`

```ts
export type AppRouter = ReturnType<typeof createRouter>
```

This type is re-exported from `@electron-template/sdk` as `AppRouter` and
imported by the renderer (`apps/web/src/lib/orpc.ts`). It is the contract
between the server and the client — **do not break its public shape without
a coordinated change in the renderer**.

## Adding a new route

### Option A — Adding a procedure to an existing domain

1. **Edit** `src/routes/<domain>/index.ts`:

   ```ts
   import { os } from '@orpc/server'
   import { z } from 'zod'
   import { eq } from 'drizzle-orm'
   import { myTable } from '@electron-template/db'

   export function createMyDomainRoutes(db: AppDatabase) {
     // ... existing procedures ...

     const updateItem = os
       .input(z.object({ id: z.number(), name: z.string() }))
       .handler(({ input }) => {
         return db.update(myTable)
           .set({ name: input.name })
           .where(eq(myTable.id, input.id))
           .returning()
           .all()
       })

     return {
       // ... existing returns ...
       updateItem
     }
   }
   ```

2. **Add a test** in `tests/<domain>/<feature>.test.ts`.

### Option B — Adding a new domain

1. **Create** `src/routes/<new-domain>/index.ts` exporting `create<NewDomain>Routes(db)`:

   ```ts
   import { os } from '@orpc/server'
   import { z } from 'zod'

   export function createPostsRoutes(db: AppDatabase) {
     return {
       list: os.handler(() => db.select().from(posts).all()),
       create: os.input(z.object({ title: z.string() }))
                .handler(({ input }) => db.insert(posts).values(input).returning().get())
     }
   }
   ```

2. **Register** in the aggregator `src/routes/index.ts`:

   ```ts
   import { createPostsRoutes } from './posts/index.js'

   export function createRouter(db: AppDatabase) {
     return {
       ...createSystemRoutes(),
       ...createUsersRoutes(db),
       ...createPostsRoutes(db)        // ← new
     }
   }
   ```

3. **Write tests** under `tests/<new-domain>/`.

## Procedure conventions

### DO

- **Use `os.input(z.object({...})).handler(...)`** — Zod schemas are the single source of truth for input validation.
- **Read `db` from the closure**, not from a context. The router factory closes `db` over each procedure, so no `os.$context` plumbing is needed.
- **Use `.returning().all()`** for inserts that need the generated id/timestamps.
- **Use `.run()`** for mutations that don't return data.
- **Use `.get()`** for selects that return at most one row.
- **Throw `Error`** for unexpected states. The `RPCHandler` `onError` interceptor catches and logs.
- **Validate inputs with Zod** — never trust the client.

### DO NOT

- **Do not use `os.$context<TContext>()`** unless a procedure genuinely needs cross-cutting middleware (auth, logging). The DB is closed over — no context required.
- **Do not introduce service classes** (`class UserService { ... }`). The factory closure is the pattern. A class adds ceremony with no benefit here.
- **Do not add wrapper modules** like `queries.ts` between the router and the DB. The router calls `db.select()...` directly.
- **Do not use RQB** (`db.query.users.findMany()`). The project convention is explicit `db.select().from(...)` patterns.
- **Do not break `AppRouter`'s shape** (renaming keys, removing procedures). The renderer depends on it via `@electron-template/sdk`.

## Testing

### Architecture

Tests use the **real IPC primitives** — Node's native `MessageChannel` (not
mocks, not stubs). This exercises the actual serialization path that Electron
uses between renderer and main.

```ts
// tests/helpers.ts
export function createTestContext(): TestContext {
  const dataPath = mkdtempSync(join(tmpdir(), 'orpc-int-'))
  const handle = initDatabase({ dataPath })
  runMigrations(handle.db)

  const router = createRouter(handle.db)

  const channel = new MessageChannel()
  const serverPort = channel.port1
  const clientPort = channel.port2

  const handler = new RPCHandler(router)
  handler.upgrade(serverPort)
  serverPort.start()

  const link = new RPCLink({ port: clientPort })
  clientPort.start()

  // TS 6 / oRPC client types have known friction — see Common Pitfalls.
  const client = createORPCClient(link) as any

  return { dataPath, handle, client, cleanup: () => { /* ... */ } }
}
```

### Test layout

```
tests/
├── helpers.ts                      # shared fixture
├── system/ping.test.ts             # basic, unicode, edge cases
├── users/crud.test.ts              # isolation + happy path
├── users/edge-cases.test.ts        # unicode, long strings, SQL injection
├── errors/validation.test.ts       # Zod input validation
├── concurrency/wal.test.ts         # concurrent reads + mixed reads/writes
└── lifecycle/database.test.ts      # migrations idempotency + close/reopen
```

Run: `pnpm --filter @electron-template/api test`

### Writing tests for a new procedure

```ts
// tests/users/crud.test.ts (excerpt)
it('updateItem renames a user', async () => {
  const created = await ctx.client.createUser({ name: 'Old' })
  const [updated] = await ctx.client.updateItem({ id: created.id, name: 'New' })
  expect(updated?.name).toBe('New')
})
```

For validation tests (errors.test.ts):

```ts
it('rejects updateItem with negative id', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect(ctx.client.updateItem({ id: -1, name: 'x' } as any)).rejects.toThrow()
})
```

## Trade-offs / rationale

### Why a closure factory, not `os.$context`

oRPC 1.14 supports `os.$context<T>()` for dependency injection. We don't
use it because:

1. **The DB is not cross-cutting middleware.** It's per-request data that
   every procedure happens to need.
2. **`RPCHandler`'s type inference gets fragile** with `$context` in 1.14.
   The closure keeps type inference clean (`AppRouter` is a simple object
   type) and avoids the need to pass `{ context: {} }` to `handler.upgrade()`.
3. **Closures are simpler** — one place to read, one place to change.

### Why no service classes

`class UserService { create() { ... } findAll() { ... } }` is the standard
junior pattern. It's a namespace disguised as a class — no state, no DI,
no polymorphism. The factory function is the same pattern without the
ceremony.

### Why no `queries.ts` wrapper module

In the old version of this package, there was a `queries.ts` between the
router and `service.ts`. Both have been removed. The router calls Drizzle
directly. Less indirection, fewer files, same testability.

### Why `RPCHandler.upgrade(serverPort)` works without a context argument

oRPC 1.14's `upgrade()` signature is:

```ts
upgrade(port, ...rest: MaybeOptionalOptions<HandleOptions<TContext>>)
```

Where `MaybeOptionalOptions<T>` makes the options argument optional **when
`Record<never, never> extends T`** (i.e., the options type is empty).

Our procedures don't use `os.$context`, so their context type is
`Record<never, never>`. The second argument is therefore optional — passing
`handler.upgrade(serverPort)` is fully typed.

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `TS2349: 'DecoratedProcedure' has no call signatures` | TS 6 / oRPC client type friction | Cast the client: `createORPCClient(link) as any` (see `apps/web/src/lib/orpc.ts` for the established pattern) |
| `Property 'db' is missing in type 'AppContext'` | Used `RPCHandler<AppRouter>` generic | Don't parameterize the handler — let TS infer. The router's context is `Record<never, never>`. |
| `Cannot find module '@electron-template/db'` | `dist/` not built | `pnpm --filter @electron-template/db build` first |
| `handler.upgrade(port, { context: {} })` complains | Context type is not `Record<never, never>` | Don't use `os.$context<TContext>()` — read `db` from the closure instead |
| Tests fail with `cleanup of undefined` | `ctx` undefined in `afterEach` | Check that `beforeEach` runs without error (usually an import failure) |
| Test sorts `["User10", "User2", ...]` lexicographically | JS sort default | Pad names: `User${String(i).padStart(3, '0')}` so lexicographic = numeric |

## The TS 6 / oRPC `as any` workaround

This codebase uses **TypeScript 6.0.3** with **oRPC 1.14.x**. There's a known
type-level incompatibility: oRPC's client types declare procedures as
`DecoratedProcedure<TContext, TInput, TOutput, ...>` which has **no call
signatures** in TS 6. The runtime is correct — calls work via the `RPCLink`
proxy — but TS rejects `client.ping({...})` as "not callable".

**Established workaround**: cast at the client creation site, then use the
client freely:

```ts
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const client = createORPCClient(link) as any
// → client.ping({ message: 'hello' }) now typechecks
```

This is the same pattern used in `apps/web/src/lib/orpc.ts:24`. It is **load-
bearing** for the test suite and for the renderer. Don't remove it without
checking that oRPC has fixed the upstream issue.

## Versioning & upgrade path

- **Current oRPC**: `^1.14.3` (`@orpc/server` + `@orpc/client`)
- oRPC 1.14.x is the latest stable as of this writing. Watch for 1.15+ which
  may improve the TS 6 type inference for clients (potentially making the
  `as any` cast unnecessary).
- **AppRouter** is the contract. Any breaking change in `oRPC` or in the
  router shape requires a coordinated update in `apps/web/src/lib/orpc.ts`.