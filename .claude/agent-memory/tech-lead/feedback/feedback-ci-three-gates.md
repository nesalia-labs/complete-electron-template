---
name: feedback-ci-three-gates
description: Delegated PRs must pass lint + typecheck + build locally before declaring done. Typecheck alone is insufficient — caught 2 cycles of CI fail/recovery on F2 settings rollout 2026-06-24.
metadata:
  type: feedback
---

# CI requires all three gates — lint + typecheck + build

**Rule:** When a delegated PR is declared done by an agent, the orchestrator must verify `pnpm --filter <pkg> lint typecheck build` locally before pushing. **Typecheck alone is not enough.** Lint catches different error classes (e.g. `@typescript-eslint/no-unnecessary-type-assertion`), build catches runtime/bundler issues that typecheck doesn't (e.g. Vite/Rolldown sub-path resolution).

**Why:** During the F2 Settings System rollout (PR #6), the orpc-expert only ran `pnpm --filter @electron-template/api test` and `pnpm --filter web typecheck` as the verification gate. Both passed. The PR shipped with:
- 8 ESLint errors in `apps/web/` (sort-imports, array-type, import/order, type-specifier-style, unused eslint-disable directives, unnecessary type assertions) — only caught by CI's `pnpm --filter web lint` step.
- A Vite/Rolldown sub-path resolution failure (`@electron-template/api/settings`) — only caught by CI's `pnpm --filter web build` step.

This triggered a 3-PR fix cycle (PR #8 for the bulk, PR #12 for the residuals) that should have been zero. The fix cost ~45 min of orchestrator time + 2 force-pushes.

**How to apply:**

| When | Gate | What it catches |
|---|---|---|
| After any delegated PR is marked done | `pnpm --filter <pkg> lint` | Style violations, type-style-specifier issues, unused eslint-disable directives, unnecessary `as any` casts |
| After any delegated PR is marked done | `pnpm --filter <pkg> typecheck` | Real type errors, missing modules, return-type mismatches |
| After any delegated PR is marked done | `pnpm --filter <pkg> build` | Vite/Rolldown resolution failures, export-field issues, bundle-level deps that typecheck doesn't see |

**Three-gate verification is non-negotiable.** A delegated PR that hasn't passed all three locally is not done — push will fail CI and cost more time than the gate would have.

**Symptom that signals a missing gate**: CI says `Lint (Web) Failing` or `Build (Web) Failing` while the developer reports "typecheck passed locally". That means lint and build were never run.

**Related:** [[feedback-orpc-bootstrap-at-boot]], [[project-f2-pr1-foundation-state]] (the original PR's report claimed verification was done — it wasn't complete).
