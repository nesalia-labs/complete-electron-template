---
name: plan-work
description: Codifies the Research → Understand → Plan → Wait → Delegate flow for substantive user requests. Use at the start of any non-trivial task to avoid jumping straight to execution.
when_to_use: Also triggers when the user message implies a multi-step change, cross-package refactor, or any task touching >1 file/area. Use when scope is ambiguous, when the work has trade-offs, or when several agents could plausibly handle it.
allowed-tools: Read Glob Grep
---

# Plan Work

Loading this skill means the user's request is non-trivial and requires the **Research → Understand → Plan → Wait → Delegate** flow instead of jumping straight to execution.

## Why this exists

The default failure mode is **jumping from user message to TaskCreate + Agent calls**. That skips the user's chance to redirect, hides the plan, and burns tokens on delegated work that might be wrong. This skill enforces a gate.

## The flow

### Phase 1 — Research (delegate if needed)

Before answering, check if you have enough context:

- **>3 files to read?** → delegate to `Explore` agent
- **Repo-spanning change?** → delegate a codebase audit
- **Domain-specific question?** → delegate to the relevant specialist (`tanstack-query-expert`, `github-expert`, etc.)
- **Trivial / memory recall / single file?** → do directly

Surface the research as **visible tasks** so the user sees progress. Silent delays are worse than slower visible work.

### Phase 2 — Acknowledge understanding (1-3 sentences)

Briefly state:

- What I read the request as
- What surprised me in the research (if anything)
- What I confirmed vs assumed

This is not the plan — it's the alignment check.

### Phase 3 — Propose a plan (any length the work needs)

The plan can be long. No artificial brevity. Match length to complexity. A trivial fix is 3 lines; a complex migration might warrant 200 lines with diagrams.

**A plan includes:**

- **Goal** — what "done" looks like (observable, not "looks good")
- **Steps** — sequenced, with dependencies between them
- **Agents** — who does what (named, with brief shape of each brief)
- **Decisions needed from user** — explicit, not implicit
- **Risks** — what could go wrong, what I'm doing about it
- **Verification plan** — how I'll know it worked
- **Out of scope** — what I'm explicitly NOT doing

**Plan structure depends on the work:**

| Work type | Plan emphasis |
|---|---|
| Bug fix | Repro → root cause → fix → verify (linear) |
| Feature | Goal → scope → design → brief per agent → verify (multi-agent) |
| Refactor | Current state → target state → migration steps → reversibility |
| Migration | Sequencing → data → code → rollback plan |
| Investigation | Question → research approach → finding synthesis |
| New agent / skill | Use `recruit-agent` skill |
| Code review of delegated work | Use `review-delegation` skill |

### Phase 4 — Wait for green light

**Do NOT delegate execution** until the user has explicitly approved (or amended) the plan. The gate exists because:

- Plans can be wrong; the user knows things I don't
- Token cost of execution is real; better to surface the plan first
- Reversibility — easier to correct a plan than to undo delegated work

If the user says "go ahead", proceed. If they correct, amend the plan and re-confirm.

### Phase 5 — Execute via delegation

Delegate to the agents named in the plan. Briefs include:

- Clear deliverable
- Acceptance criteria (observable)
- References to memory entries / existing patterns
- Constraints (don't touch X, must match pattern Y)

Track via tasks. Visible progress.

### Phase 6 — Report at decision points only

- Don't narrate agent transcripts step-by-step
- Checkpoint when: a delegated decision needs user input, an unexpected finding emerges, scope changes
- Final report: what was done, what was verified, what's left

## Anti-patterns

- **Skipping research** and answering from training — wastes user time on wrong answers
- **Jumping to TaskCreate** without a plan
- **Plans without decisions surfaced** — the user has to read the whole thing to find the asks
- **Forcing brevity** on complex work — match length to clarity
- **Delegating before approval** — burns tokens on wrong work
- **Narrating every agent step** — noise, not signal