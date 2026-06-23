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

### shadcn v4 primitives — Provider gotchas
shadcn primitives that wrap Radix UI primitives sometimes require a Provider ancestor that shadcn does NOT include in the component itself. Known cases in this codebase:
- `Tooltip` (used by `SidebarMenuButton` when `tooltip` prop is set) requires `TooltipProvider` higher in the tree. Currently wrapped in `apps/web/src/routes/__root.tsx` so the whole app gets the context.

**Rule:** When introducing a shadcn primitive that uses Radix under the hood, check if it requires a Provider (Dialog, Popover, Tooltip, Select, Sheet, RadioGroup, etc. — most do). Add the Provider at `__root.tsx` level so future tooltips/dialogs/etc. anywhere in the app just work.

**Why:** the SidebarMenuButton error `Tooltip must be used within TooltipProvider` was caught at runtime, not typecheck. Avoid this by adding Providers preemptively in root layouts, not after the first crash.

### TanStack Router 1.170 `useMatch` behavior change
`useMatch({ from: routeId })` in v1.170+ **throws by default** when no current match exists for the route. This is a behavior change from pre-1.170 where `useMatch({ to, fuzzy })` returned `undefined`. Source: `node_modules/@tanstack/react-router/dist/esm/useMatch.js:45` — `if (opts.shouldThrow ?? true) { throw ... }`.

**Symptom:** `Invariant failed: Could not find an active match from "/_app/settings"` — fired when sidebar nav rendered both items but only one was currently matched.

**Rule:** When calling `useMatch({ from: routeId })` for an "is active" check (i.e., querying a route you may or may not be on), pass `shouldThrow: false`. Then `Boolean(useMatch({ from, shouldThrow: false }))` gives the active boolean without throwing. If you're inside the route itself and want the throw (e.g., extracting loader data), the default behavior is fine.

**Why:** the F1 spec used the old `useMatch({ to, caseSensitive: false })` API which returned undefined for no match. v1.170 replaced this with `{ from: routeId }` and made throw the default. The shadcn sidebar pattern in their templates (using `useLocation`) sidesteps this entirely; we kept `useMatch` for type safety.

### shadcn patch — `SidebarMenuButton` data-active attribute
shadcn v4 `SidebarMenuButton` renders `data-active={isActive}`. React renders `data-active={false}` as `data-active="false"` (the attribute IS present in the DOM). Tailwind v4's `data-active:` variant compiles to `[data-active]` which matches when the attribute is present regardless of value, so active styles apply to inactive items too.

**Patch applied** in `packages/ui/src/components/sidebar.tsx` line 510:
```tsx
// PATCH (2026-06-23): data-active={isActive || undefined} — see code-taste.md
data-active={isActive || undefined}
```

**Re-apply on every shadcn upgrade** (any `pnpm ui:add ...` that re-vendors `sidebar.tsx`). The patch comment is in the source for visibility.

**Why we don't fix it at the consumer level:** the bug is in the primitive's rendering; overriding with className would duplicate variant styles. Patching the primitive once is cleaner.

### shadcn Sidebar positioning — fixed to viewport, not parent
The shadcn v4 `Sidebar` primitive renders its visual container as `position: fixed; inset-y-0; height: 100vh` (see `packages/ui/src/components/sidebar.tsx` line 231). This pins the sidebar to the **viewport top**, not the top of its parent container. The internal `sidebar-gap` div (`position: relative; width: var(--sidebar-width)`) provides the in-flow width offset but does NOT affect vertical positioning.

**Implication:** any full-width element rendered ABOVE `<SidebarProvider>` in the DOM (e.g., a custom frameless titlebar) WILL be overlapped by the sidebar. Moving the element INSIDE `<SidebarInset>` only works if the element can be content-area-scoped.

**Fix pattern:** keep the element above `<SidebarProvider>` (full-width) and override the sidebar container's `top` and `height` via `<Sidebar className="...">`. The `className` prop on `<Sidebar>` is forwarded to the `sidebar-container` div (sidebar.tsx line 236), which is where the fixed positioning lives.

```tsx
// 32px-tall titlebar above the sidebar
<AppTitleBar />
<SidebarProvider>
  <Sidebar collapsible="icon" className="top-8! h-[calc(100vh-2rem)]!">
    ...
  </Sidebar>
</SidebarProvider>
```

The Tailwind v4 important-modifier suffix (`top-8!`) overrides `inset-y-0`'s `top: 0` and `h-svh`'s `height: 100vh`.

**Why we don't modify sidebar.tsx:** adding a `topOffset` prop to the primitive is cleaner long-term but requires patching the shadcn source (more risk on upgrade). The className override is one line, scoped to this consumer, and the override is documented in the comment.

### Tailwind v4 `!` important modifier — suffix, not prefix
In Tailwind v4, the important modifier is a SUFFIX (`top-8!`), not a prefix as in v3 (`!top-8`). From the Tailwind v4 changelog:
> The important modifier is now a suffix instead of a prefix.

**How to apply:** when overriding a Tailwind class with `!important`, use `class!` syntax. Mixing with arbitrary values: `h-[calc(100vh-2rem)]!`. Forgetting the v4 syntax produces classes that compile to non-important variants and silently fail to override.

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