---
name: code-taste
description: Specific patterns the user values, code style preferences, anti-patterns to avoid — applied when writing or reviewing code.
metadata:
  type: feedback
---

# Code Taste

## Full job descriptions for agents (and skills)
**Rule:** Agent and skill READMEs include all required sections (Mission, When to use, When NOT to use, Working principles, Output shape, Examples, Skills attached, Tools and boundaries for agents; procedural steps for skills).

**Why:** Empty READMEs mean delegated work can't be selected correctly by the LLM agent chooser. Vague skills fire on wrong requests.

**How to apply:** When creating or auditing agents/skills, check all required sections are present, specific, and non-overlapping with siblings.

## Tables for comparisons
**Rule:** Use tables to compare options, scopes, or agents. Don't write prose comparisons.

**Why:** Tables are scannable, structured, and unambiguous. The user has consistently used tables in approved documents.

**How to apply:** Every time I'm comparing 2+ options, default to a table with consistent columns. Pros/cons in tables, not paragraphs.

## Real examples over abstract descriptions
**Rule:** Include 3-5 concrete request examples per agent / skill / pattern. Each with input, expected output shape, knowledge drawn on.

**Why:** The user values "I can recognize when this applies" over "I understand the abstract principle". Examples are how agents learn their triggers.

**How to apply:** Every agent has examples. Every skill has triggers. Every pattern has worked samples. If I can't write 3 examples, the scope is too vague.

## Cross-link related content
**Rule:** Memory entries cross-link with `[[name]]` syntax. Agents reference each other's scopes.

**Why:** The user prefers navigable, connected knowledge graphs over flat docs.

**How to apply:** When writing memory or agent definitions, link related entries with `[[name]]`. When in doubt about scope, link rather than duplicate.

## Anti-patterns explicit
**Rule:** Every agent, skill, and pattern includes an "Anti-patterns" section listing specific things to avoid.

**Why:** Anti-patterns prevent drift. The team has been burned by drift before.

**How to apply:** When writing a new artifact, list 3-8 anti-patterns with concrete examples (not abstract warnings). Reference the actual code patterns to avoid.

## Established codebase patterns (preserve)

### DB layer (`packages/db/`)
- Factory not singleton — every consumer calls `initDatabase()` explicitly
- WAL mode + `busy_timeout = 5000` + `synchronous = NORMAL` + `foreign_keys = ON`
- No Relational Query Builder (RQB) — explicit `db.select().from()` only
- No ISO strings for dates — integers or proper SQLite types
- Migrations: append-only, reversible (down migrations always)
- Copy `drizzle/*.sql` to `dist/drizzle/` via `copy-drizzle.mjs` before packaging
- Schema derives Zod via `drizzle-zod`, not hand-written

### API layer (`packages/api/`)
- Closure factory over `$context` — explicit dependencies
- No service classes, no `queries.ts` wrapper — procedures call Drizzle directly
- Zod-first input validation on every procedure via `os.input(z.object(...))`
- `AppRouter` is the contract — never break shape without coordinated edits to `sdk` + `web`
- TS 6 / oRPC `as any` workaround at `apps/web/src/lib/orpc.ts:24` is **load-bearing** — don't remove without coordinated fix
- Tests use real `MessageChannel` (see `packages/api/tests/helpers.ts`), not mocks
- Error handling via `ORPCError`, not bare `throw new Error(...)`

### IPC / Electron (`apps/desktop/`)
- `127.0.0.1` not `localhost` (DNS resolution failures cause `ERR_CONNECTION_TIMED_OUT`)
- Preload is the ONLY bridge — never expose Node APIs directly via `contextBridge`
- MessagePort for bidirectional streams; `ipcRenderer.invoke` for request/response; `ipcRenderer.on` sparingly
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where possible
- `app.on('before-quit')` is the lifecycle hook for cleanup (DB handle close, etc.)

### Web app (`apps/web/`)
- File-based routes under `apps/web/src/routes/` — auto-generated tree in `routeTree.gen.ts`
- **Never hand-edit `routeTree.gen.ts`** — regenerate via Vite plugin
- `loader` for data the route structurally depends on; `beforeLoad` for guards and redirects
- `createServerOnlyFn` for server-only modules (no Node APIs in browser bundle)
- Co-locate route components; extract to `components/` only when reused across routes
- TanStack Devtools stays wired in dev — don't remove

## Anti-patterns in this codebase (specific, with file:line)

| Anti-pattern | Location | Why bad |
|---|---|---|
| `sandbox: false` without documented rationale | `apps/desktop/src/main/index.ts:30` | Privilege relaxation; needs inline comment + ADR link |
| `createORPCClient(link) as any` | `apps/web/src/lib/orpc.ts:24` | Erases type safety; load-bearing workaround needs comment |
| Bare `throw new Error('Failed to create user')` | `packages/api/src/routes/users/index.ts:20` | No `ORPCError` formatter integration |
| `{ success: true }` returned even on 0-row deletes | `packages/api/src/routes/users/index.ts:38` | Semantic mismatch with DB truth |
| `console.error('[RPCHandler error]', error)` | `apps/desktop/src/main/index.ts:17` | Unstructured logger; no level/context |
| Singleton-style DB access | (no current example) | Test pollution, lifecycle ambiguity |
| Hand-editing `routeTree.gen.ts` | `apps/web/src/routeTree.gen.ts:18` | Gets clobbered on next regeneration |
| `await initORPC() as any` in routes | `apps/web/src/routes/index.tsx:26,37` | Same workaround propagated; cluster-fix with the load-bearing cast |
| Placeholder test `expect(1+1).toBe(2)` | `apps/web/src/lib/example.test.ts` | Real coverage needed, not smoke tests |
| Side-effect i18n init at module load | `apps/web/src/i18n/index.ts:1-26` | Test environments init i18n unconditionally |

## Tooling and infrastructure preferences

- **`127.0.0.1` not `localhost`** — `CLAUDE.md:119-121` declares this. Some networks block localhost resolution.
- **Atomic CI workflows** — one action per workflow file. 17 modular workflows (per `ci-cd-patterns.md`).
- **Strict semver + changelog** — every release has a `CHANGELOG.md` entry, breaking changes called out at the top.
- **pnpm workspace** — `pnpm --filter @electron-template/<pkg>` for package-scoped commands.

Related: [[quality-bar]], [[working-style]]