---
name: issue-triage-agent-v1-scaffold
description: The v1 issue-triage eve agent was scaffolded at `agent/` on 2026-06-24. Authority model is locked (autonomous type:/priority:/effort:, propose-only status: via comment). This is the canonical artifact to reference when iterating on the agent or answering deploy questions.
metadata:
  type: project
---

The v1 issue-triage eve agent lives at `C:\Users\dpereira\Documents\github\complete-electron-template\agent\` — a sibling of `apps/` and `packages/` at the repo root, NOT in `pnpm-workspace.yaml`. Slot tree: `agent.ts`, `instructions.md`, `channels/github.ts`, `tools/{apply_proposed_labels,post_triage_comment,request_repo_info}.ts`, `skills/{label-taxonomy,architecture-map,triage-workflow}.md`.

**Why:** The agent's purpose is to triage GitHub issues for the complete-electron-template repo. The user locked an authority model — the agent applies `type:*` / `priority:*` / `effort:*` autonomously (via `apply_proposed_labels`), and proposes `status:*` transitions, body edits, close/reopen, and assignments via `post_triage_comment` only. A human applies the proposed change manually. This is the security boundary that drives the v1 design.

**How to apply:** Before changing any of the three tools, confirm the change preserves:
1. The `status:*` Zod rejection in `apply_proposed_labels` (refine on each label against `["type:", "priority:", "effort:"]`).
2. Idempotency: existing-label dedupe BEFORE write. A re-run must produce the same end state.
3. `needsApproval: never()` on all three tools per the authority model.
4. The `post_triage_comment` body shape — model-composed, not templated in code.
5. The "one comment per issue" rule in `instructions.md` and `triage-workflow.md`.

The `architecture-map.md` skill is grounded in real file paths verified during the scaffold. If any of those paths move (e.g. a file rename in `apps/desktop/src/main/`), update the skill in the same PR. The label taxonomy is a mirror of `CLAUDE.md` § "Issue Labels" — drift between the two is release-blocking.

Deferred to v2: `triage.yml`, `schedules/`, `hooks/`, `sandbox/sandbox.ts`, embedding-based dedupe, the `@triage-bot` mention surface, evals. The brief was explicit that none of these ship in v1.

The eve CLI was not installed in the dev environment when this was scaffolded, so `eve info` could not be run locally. Deploy verification happens on Vercel.

Related: [[template-philosophy]] (the standard every file in `agent/` was written to), [[feedback-investigate-before-recommending]] (every claim in `architecture-map.md` is grounded in a real file path or symbol verified via grep).