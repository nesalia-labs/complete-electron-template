---
name: project-template-audit-2026-06-22
description: Senior architectural audit of complete-electron-template on 2026-06-22; full plan at docs/plans/template-audit-remediation.md with 3 critical + 5 major findings and a 6-PR migration sequencing.
metadata:
  type: project
---

Senior architectural audit of the complete-electron-template repo was conducted on 2026-06-22 against branch `refactor/shadcn-monorepo-migration`. The full plan, with proposed fixes, sequencing, and acceptance criteria, lives at `docs/plans/template-audit-remediation.md`.

**Why:** The audit was triggered by concerns about the migration branch's width (64 files, 3K deletions) and the inclusion of a build-script band-aid (`packages/ui/scripts/fix-imports.mjs`).

**How to apply:** Before proposing new work on the Electron / web / packages/ui boundary, read the audit plan and check whether the items it covers have shipped. The critical items — CSP, dead `ping` IPC channel, half-wired SSR — must land before the migration branch merges to `staging`. The user-mandated direction is to **replace the `fix-imports.mjs` band-aid with proper tsconfig paths**, not patch and document it.

**Findings summary (for triage):**

- P0 (block merge): missing CSP, dead `ping` channel, SSR half-wired (deps + augmentation present, runtime does CSR).
- P1 (ship before next release): phantom `@tanstack/react-router-ssr-query` dep, CI on Node 20 vs root `engines.node: ">=22.13.0"` mismatch, `fix-imports.mjs` band-aid (replace with tsconfig paths), duplicated Vite alias arrays, empty `docs/internal/`.
- P2 (backlog): redundant `AppRouter` re-export in `packages/sdk`, no `queries.ts` layer, `docs/learnings/` covers third-party libs but not the actual stack.

**Migration sequencing:** Split the 64-file branch into 6 PRs of ≤15 files each. PR #2 (shadcn extraction with tsconfig paths) carries the highest risk and is where the band-aid gets retired.

**Out of scope for the audit:** `docs/learnings/eve/`, `docs/reports/eve/`, macOS/Linux desktop targets, TanStack Query adoption, full SSR migration, logging strategy.

Related: [[project-db-refactor-state]], [[project-monorepo-structure]], [[feedback-quality-bar]], [[reference-orpc-bridge]].
