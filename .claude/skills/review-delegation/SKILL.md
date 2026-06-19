---
name: review-delegation
description: Verify the output of a delegated agent against the original brief. Use after any agent reports "done" — read the diff, check scope, confirm acceptance criteria, surface gaps.
when_to_use: Also triggers when an agent's report is suspiciously short, when scope creep is suspected, when the work touches a system boundary, or when verification is required by project conventions (schema changes, migration safety, security-sensitive code).
allowed-tools: Read Glob Grep Bash
---

# Review a Delegation

Loading this skill means an agent has reported done. Your job: **verify, don't redo**.

## Why "trust but verify" matters

Agents (like humans) can:

- Misunderstand the brief
- Take shortcuts
- Drift in scope
- Miss edge cases
- Report "done" when partial

This skill enforces a verification loop proportionate to the stakes.

## The procedure

### Step 1 — Re-read the brief

Before touching the agent's output, re-read the original brief. What was the deliverable? What were the acceptance criteria? What constraints were declared?

If the brief was vague, the review is also vague. That's information — the brief needed better specification.

### Step 2 — Read the diff (or output)

Use `git diff` or `Bash` to see what actually changed. For agents that produce analysis (not code), read the analysis file directly. **Don't read the agent's summary first** — read the raw output. The summary can mislead.

### Step 3 — Acceptance criteria check

Walk each criterion from the brief:

| Criterion | Met? | Evidence |
|---|---|---|
| ... | ✅ / ❌ / ⚠️ | file:line, command output, etc. |

If any criterion is not met, surface it back to the agent (or up to the user if it's a judgment call).

### Step 4 — Scope check

- **Did the agent touch files outside the brief's scope?** Flag it. Scope creep is a discipline failure.
- **Did the agent skip any files in scope?** Flag it. Silent omission is worse than visible error.
- **Did the agent modify existing patterns** in a way that drifts from the codebase convention?

### Step 5 — Pattern & quality check

- Does the code match existing patterns in the codebase? (Check 2-3 similar files for comparison.)
- Are imports / types / naming consistent with the rest of the project?
- Are tests included where the project convention requires them?
- Is the diff minimal? (Large diffs in simple tasks = sign of scope drift or unnecessary refactoring)

### Step 6 — Verification commands

For substantive changes, run the project's verification:

- `pnpm typecheck` — type errors caught
- `pnpm lint` — style / pattern violations
- `pnpm test` — regression
- Project-specific scripts (build, migration dry-run)

For schema changes: validate the schema applies cleanly. For migrations: confirm reversibility + idempotency.

### Step 7 — Compose the review

```
## Review of <agent-name> delegation

### Acceptance criteria
- [x] Criterion 1 — evidence
- [x] Criterion 2 — evidence
- [ ] Criterion 3 — NOT MET, needs <specific fix>

### Scope
- Files touched: <list>
- Out-of-scope changes: <list or "none">

### Quality
- Patterns: match / drift
- Tests: included / not required
- Diff size: N lines

### Verification run
- typecheck: ✅ / ❌ / ⚠️
- lint: ✅ / ❌ / ⚠️
- test: ✅ / ❌ / ⚠️

### Gaps to address
- <specific gap 1>
- <specific gap 2>

### Recommendation
- Accept / Accept with fixes / Reject
```

### Step 8 — Decision

Three outcomes:

- **Accept** — the work matches the brief. Move on.
- **Accept with fixes** — minor gaps. Either fix them yourself (small) or send back to the agent (larger).
- **Reject** — significant gaps or wrong direction. Send back to the agent with a clear re-brief.

The threshold for "I fix it myself" vs "send back to agent":

- Trivial (typo, missing import) → I fix
- Anything beyond trivial → send back with specific fix list

## Anti-patterns

- **Trusting the agent's summary** without reading the diff
- **Skipping acceptance criteria** — vague satisfaction is not verification
- **Allowing scope creep** to slide — flag every out-of-scope change
- **Running verification commands that don't exist** — use the project's actual scripts
- **Reporting "looks good" without evidence** — every claim should cite file:line or command output
- **Rewriting the agent's work** instead of sending back with a fix list — that's redo, not review