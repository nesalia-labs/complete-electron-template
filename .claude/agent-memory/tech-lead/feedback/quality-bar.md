---
name: quality-bar
description: What "good" looks like in this codebase — non-negotiables for security, schema, type-safety, readability.
metadata:
  type: feedback
---

# Quality Bar

## High standard, painful past drift
**Rule:** Match the standard implied by `CLAUDE.md` and the team's documented conventions. Don't drift toward "good enough".

**Why:** Repo memory records *"le code est à chier, c'est un template mais on a pas les bons patterns"* — past drift was painful. The user is rebuilding from that history.

**How to apply:** When a convention exists in `packages/*/CLAUDE.md` or in this repo's memory, follow it strictly. Don't introduce a "slightly different" pattern even if it's locally cleaner. Consistency > local optimization.

## Security-first (Electron hardening)
**Rule:** Any change touching `apps/desktop/src/main/`, `apps/desktop/src/preload/`, `BrowserWindow webPreferences`, or IPC handlers requires explicit security review.

**Why:** Electron security failures are catastrophic. Declared a strategic principle in `tech-lead/README.md`. The only documented control was `ALLOWED_ORIGIN` — there's a real audit gap.

**How to apply:** Default-deny: CSP, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where possible. Document any relaxation (e.g., `sandbox: false` at `apps/desktop/src/main/index.ts:30`) with inline comment + ADR link. Route IPC security work to `electron-expert`.

## Schema-first (Zod as single source of truth)
**Rule:** Zod schemas are the single source of truth. oRPC contracts, Drizzle tables, IPC payloads all derive from Zod.

**Why:** Type safety across process boundaries depends on this. `CLAUDE.md` declares it a strategic principle. Hand-written TS interfaces drift from the actual schema.

**How to apply:** Never hand-write TypeScript interfaces for inputs that flow across boundaries. Use `os.input(z.object(...))` for procedures, `drizzle-zod` (`createInsertSchema`, `createSelectSchema`) for table-derived validation.

## Type-safe, no escape hatches
**Rule:** Type errors are bugs. `as any` casts need explicit justification or removal.

**Why:** The TS 6 / oRPC `as any` workaround (`apps/web/src/lib/orpc.ts:24`, `packages/api/tests/helpers.ts:50`) is documented as **load-bearing** — removing it breaks the typecheck. Other casts are not load-bearing; they're lazy fixes.

**How to apply:** If a type error requires `as any`, document why in a comment with file:line reference. If the underlying types can be fixed cleanly, fix them. Track `as any` count over time — should trend toward zero (except the documented workarounds).

## Senior patterns readable by juniors
**Rule:** This is a *template*. Code must be readable by someone new to the codebase.

**Why:** `tech-lead/README.md:140` and `CLAUDE.md` explicitly state this. Template code gets copied by everyone.

**How to apply:** Default to the simpler of two equivalent patterns. Add a brief comment when introducing a non-obvious convention. Prefer explicit code over clever metaprogramming. Complex patterns get an ADR in `docs/plans/`.

## Pragmatic excellence
**Rule:** Choose the simplest solution that solves the problem. No over-engineering "for flexibility".

**Why:** Explicit in `tech-lead/README.md:139`. The team values shipped correctness over hypothetical flexibility.

**How to apply:** Don't add abstractions for one use case. Don't add configuration knobs "in case we need them later". Don't generalize before the second use case exists. Add when needed, not before.

## Boundaries > cleverness
**Rule:** Explicit when-to-use / when-NOT-to-use sections > implicit patterns.

**Why:** Cross-agent delegation needs clear boundaries to avoid scope drift. The Hiring Standard mandates these sections on every agent.

**How to apply:** Every module, agent, skill, or component has explicit "use this for X, not for Y" documentation. If boundaries are implicit, write them down.

## Tests are real, not mocked
**Rule:** Tests use real infrastructure where feasible (real SQLite in temp file, real `MessageChannel`).

**Why:** Mocks drift from reality. The team has explicitly chosen real-infrastructure testing (`packages/db/tests/`, `packages/api/tests/helpers.ts`).

**How to apply:** Default to real fixtures. Mock only at system boundaries where real is impractical (external APIs, OS calls). When mocking, document why and pin the mock contract.

Related: [[code-taste]], [[working-style]]