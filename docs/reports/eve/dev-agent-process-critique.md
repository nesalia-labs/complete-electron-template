# dev-agent Process — End-to-End Critique

> Comprehensive critique of the process as designed: issue arrival, agent
> comments, dev-agent work, PRs, reviews, merge. The goal is to surface
> every gap and weak spot in the current design so we can prioritize
> fixes. Status: **draft**. Owner of fixes (if any): `eve-expert` writes
> the dev-agent code; `tech-lead` arbitrates prioritization.

**Scope of critique:** the full lifecycle from "issue is filed" to "PR is
merged" — including triage, assignment, dev-agent session, PR creation,
reviewer-agent verdict, iteration, and merge. Excludes post-merge
changelog/release concerns (those are `release-manager`'s job).

---

## 0. TL;DR — the 7 most critical gaps

In rough priority order. Each gets a full treatment below; this is the
"if you only read seven things, read these" list.

1. **The complexity-opinion rule is in the persona, not the workflow.** LLMs
   skip persona rules when they're confident. Need a tool-level
   forcing function (`assess_complexity` as the session entry point).
2. **The dev-agent and the issue-triage agent don't share state.** Triage
   produces a label set the dev-agent ignores. Either triage surfaces
   "this is dev-agent-scope" or the dev-agent redoes the work.
3. **Open-loop iteration has a hidden cost: humans become the trigger.**
   For v1 this is the design choice, but it should be measured
   (cycles-per-PR) so the v2 closed-loop decision is informed by data.
4. **The agent's "approve" and the human's "approve" are the same word but
   different decisions.** Vocabulary conflict with the GitHub PR review
   API. Use distinct terms.
5. **The agent doesn't pull main before opening the PR.** If main has
   moved, the PR has conflicts. Add a `sync_with_main` step before
   `push_branch` and `open_pull_request`.
6. **No way to tell if the agent's work is good.** Track PR review
   rounds, refusal rate, time-to-merge. Surface weekly. No
   measurement = no trust.
7. **The persona's TDD discipline is unenforced.** The model can write
   code before the test. Move from "persona rule" to "tool-level
   contract" via authored `write_test` + stateful tracking.

---

## 1. Process map (as currently designed)

```text
issue.opened
   │
   ▼
issue-triage-agent fires
   │  reads issue, classifies, applies labels, posts ONE triage comment
   │  may escalate (security, p0)
   ▼
human reads triage comment
   │
   ▼
human assigns to dev-bot        ←─── handoff is implicit, not signaled
   │
   ▼
dev-agent session starts
   │  reads issue
   │  posts complexity assessment comment     ←─── only persona-enforced
   │  decides accept OR refuse
   │
   ├── refuse → refuse_task comment → session ends
   │
   ▼ (accept)
   │  writes test
   │  writes code
   │  iterates
   │  commits
   │  pushes branch                             ←─── doesn't sync with main
   │  opens PR (always gates)                   ←─── draft by default
   ▼
reviewer-agent fires on PR opened
   │  reads diff
   │  posts review comment (verdict)
   ▼
human reads review
   │
   ├── reviewer: approve → human merges
   │
   └── reviewer: request changes
        │
        ▼
      human @mentions dev-agent to iterate    ←─── v1.5 trigger
      │
      ▼
      dev-agent re-engages same session
      │  reads review comments
      │  iterates
      │  pushes new commits
      ▼
      reviewer-agent re-fires
      │
      ▼ (loop until approve or human escalation)
```

---

## 2. Issue arrival & triage

### 2.1 The triage → dev-agent handoff is implicit

The triage agent's verdict is human-readable ("this is a `type: bug` of
`effort: s`, `priority: p2`"), but it doesn't *signal* "this is in
scope for the dev-agent." The human has to interpret the triage and
make a separate decision. That decision is also implicit: assign to
`dev-bot`.

**Fix:** triage should set a label that explicitly indicates dev-agent
eligibility — `dev-agent-scope: yes` / `no` / `uncertain`. The dev-agent
trusts its own assessment over the label, but the label is a strong
prior and reduces false assignments.

### 2.2 Triage comment structure is generic

The triage comment is a single response chosen from 5 templates
(repro-needed, info-needed, security-paged, duplicate, wontfix). For
v1, this is fine. For v1.5, every triage comment should end with a
*next-action footer*:

```md
---

**Next steps:**
- If you want the dev-agent to take this: assign to `@dev-bot`.
- If you want a human to take this: leave unassigned, add `status: human-only`.
- If you have more context: comment below — triage will re-evaluate.
```

The footer turns the triage comment from an *assessment* into an
*invitation*. Without it, the human has to guess what to do next.

### 2.3 Triage doesn't know about existing PRs

If an issue already has a PR linked (via `Closes #N` or branch
reference), the triage comment is just noise.

**Fix:** triage checks `list_issues` filtered by linked PR before
posting. If a PR exists, post a short "PR already exists, see #N"
comment instead of the full triage.

### 2.4 The most catastrophic failure: triage misses a security issue

This is the disaster scenario. The persona says "err on the side of
escalation" but the model is probabilistic. A second line of defense:

- The dev-agent's complexity check refuses security-sensitive work,
  but the *issue is already public* by then. The damage is done.
- **Fix:** A weekly `security-audit-sweep` schedule that scans all open
  issues for security keywords (auth bypass, RCE, XSS, SQLi, secrets
  leak, supply chain) and pings the security team with a list of any
  unlabeled ones. Defense in depth — triage agent's miss + this sweep.

### 2.5 Triage doesn't see the dev-agent's history on a re-triage

If a dev-agent session refused an issue, then a human re-assigned it,
then triage re-fires (e.g., label changes), the triage agent doesn't
know about the refusal. It produces a fresh triage that may conflict
with the prior refusal.

**Fix:** triage reads recent issue comments before posting. If a
`refuse_task` comment is present, the triage comment is a short
"still in scope for dev-agent? If yes, ensure the issue is now
self-contained and re-assign." Avoids re-litigating the refusal.

---

## 3. Issue assignment to dev-agent

### 3.1 The human's signal is loaded

When a human assigns to `dev-bot`, they're saying "I think this is in
scope for the dev-agent." But the dev-agent's complexity check can
disagree. The cost of the wrong signal is a session (sandbox time +
model calls).

**Fix:** add a `/dev-agent` slash command in comments, separate from
assignment. `/dev-agent try this` is explicit intent; "assign to
dev-bot" is just routing. Slash command requires `@mention` in v1.5.

### 3.2 Untrusted trigger source

In v1.5, `onIssueComment` filtered for `@dev-agent` mention is the
iteration channel. If external users can trigger sessions via
`@dev-agent`, the cost is unbounded and the trust is wrong.

**Fix:** filter `onIssueComment` to users with triage / maintain role
in the repo. The GitHub channel's `ctx.session.auth.attributes` carries
the role — the channel filters there.

### 3.3 Concurrent assignments stack linearly

If a human assigns 5 issues at once, 5 dev-agent sessions start in
parallel. 5 sandboxes, 5x cost. For v1, this is fine (cost is the
bound). For v1.5, consider a soft concurrency cap (e.g., 8 parallel
sessions) with a queue.

### 3.4 No re-assignment feedback

When a human *unassigns* `dev-bot` from an issue, the running session
doesn't know. It keeps working.

**Fix:** the dev-agent's `onIssue` filter includes `unassigned` action.
If the issue is unassigned mid-session, the agent posts a "session
ended: unassigned" comment and ends.

---

## 4. dev-agent session

### 4.1 The complexity-opinion rule is in the persona — not enforced

The persona says "before any code work, post a comment with your
complexity assessment." Models skip persona rules. A 95% reliable rule
is a 5% failure rate; for a destructive primitive like "start writing
code," 5% is too high.

**Fix:** introduce a tool-level forcing function.

```ts
// agent/tools/assess_complexity.ts
export default defineTool({
  description: "REQUIRED first action. Assess issue complexity and route to refuse or proceed.",
  inputSchema: z.object({
    assessment: z.string().min(50).max(500),
    decision: z.enum(["refuse", "proceed"]),
    reason: z.string().min(20),
  }),
  needsApproval: never,
  async execute({ assessment, decision, reason }, ctx) {
    if (decision === "refuse") {
      await refuseTask({ reason, unblockers: [] });
      await ctx.session.end();   // session ends cleanly
    }
    // decision === "proceed": write the assessment to the issue, continue
    await postIssueComment({ body: `**Complexity assessment:** ${assessment}\n\n**Decision:** proceeding.\n\n**Reason:** ${reason}` });
    return { ok: true };
  },
});
```

The persona says "always call `assess_complexity` first." The
session-entry hook (a `turn.started` override) emits a system message:
"Call `assess_complexity` before any other action." The model can't
proceed without calling it — the first turn's prompt includes the
constraint.

### 4.2 TDD is in the persona — also not enforced

Same problem. The persona says "write test first" but the model can
write code first.

**Fix:** stateful tracking in `defineState`. The session tracks
`testWritten: boolean`. The `run_tests` tool fails if `testWritten` is
false (with a clear error message: "you haven't written a test yet,
call `write_test` first"). The first iteration is forced: write_test
→ run_tests (failing) → write_code → run_tests (passing).

This is heavy-handed but it makes the discipline *structural*, not
*aspirational*.

### 4.3 The complexity heuristics are too coarse

- "Cross-cutting >5 files" — 5 files for a schema migration is small;
  5 files for a UI redesign is large. File count is a bad proxy.
- "Security-sensitive" — what file paths or imports signal it?
- "No clear test surface" — the agent's judgment, with no concrete examples.

**Fix:** move the heuristics to the `complexity-assessment` skill. The
skill is a checklist with concrete examples, not a fuzzy persona rule.
Suggested concrete rules:

- **Refuse if:**
  - Touches `auth/`, `crypto/`, `secrets/`, `permissions/`, `rbac/`
    directories
  - Diff would add >300 lines OR span >3 conceptual areas
  - Requires adding a new runtime dependency (not dev-dep)
  - The issue's "acceptance criteria" section is empty or
    one-liner
  - The issue's "repro steps" are empty (for bug-type issues)
  - The issue's title contains "redesign", "rethink", "rearchitect"

The persona says "load `complexity-assessment` and follow the
checklist." The LLM's judgment fills the gaps, but the floor is
deterministic.

### 4.4 No re-assessment mid-work

If the agent accepts at session start, but mid-implementation realizes
the task is too complex, the persona says "stop, post a refusal
comment, end the session." But the model often pushes through because
"it already started."

**Fix:** the persona includes a *re-assessment trigger*. After
specific milestones (writing the test, running the first test, writing
50% of the code), the agent must re-load the `complexity-assessment`
skill and re-check. If new information pushes it over the threshold,
it refuses. This is meta-discipline: forcing the agent to re-examine
its own judgment as the situation evolves.

### 4.5 The "refuse and end session" is too clean

Currently: refuse → comment → session ends. But the user might add
context 5 minutes later. The session is gone. They have to re-assign.

**Fix:** `refuse_task` posts a comment AND leaves the session alive
for a short window (e.g., 1 hour). If the user replies with clarifying
info in that window, the agent re-runs `assess_complexity` and may
proceed. After the window, session ends. This is a v1.5 concern.

### 4.6 The complexity-assessment has no audit trail

The persona says "post a comment with your assessment." But the
comment is the *visible* artifact. The full reasoning (the model's
chain of thought) is in the OTel trace, not on the issue.

**Fix:** the `assess_complexity` tool records the full assessment in
`defineState` (decision, reason, considered factors). The OTel trace
carries the reasoning. The GitHub comment carries the summary. Three
layers, three audiences: maintainer, auditor, public.

### 4.7 The sandbox setup is fragile

The bootstrap script does `pnpm install` etc. If the repo is in a
broken state, the agent can't work — but it doesn't know to refuse with
a clear reason.

**Fix:** pre-flight check at session start. If `pnpm install` fails,
the agent calls `refuse_task` with reason "repo is in a broken state,
needs human fix first." Saves a sandbox hour.

### 4.8 The branch is on stale code

The branch is created from the issue-open commit. If main has moved
(other PRs merged), the branch is behind. The PR will show conflicts.

**Fix:** `sync_with_main` step before `push_branch` and before
`open_pull_request`. `git fetch origin main && git rebase origin/main`.
If conflicts, the agent tries to resolve; if it can't, refuse with
"merge conflicts with main, please re-assign after rebase."

### 4.9 `commit_changes` is gated `once` per session — too coarse

After the first commit, all subsequent commits are free. But the first
commit might be a "wip" placeholder.

**Fix:** the first commit is "wip: starting work" (auto-approved).
Subsequent commits have meaningful content and are auto-approved
within the same session. The agent cannot push a "real" commit without
the test loop having passed at least once. Track in `defineState`:
`firstRealCommit: boolean`. Set true on the first commit after a
passing test run.

### 4.10 `open_pull_request` always gates — but the gate is implicit

Currently: PR is opened, then a human reviews. The "gate" is the
human's review. But the agent's PR is a *regular* PR; the GitHub UI
treats it like any other.

**Fix:** open PR as a *draft* by default. The agent flips to "ready
for review" via `update_pull_request` only when (a) tests pass, (b)
diff is small, (c) the agent's self-check passes. The flip is the
implicit "I'm done" signal — the reviewer-agent ignores draft PRs.

### 4.11 Mid-work design questions have no path

The agent hits a design question mid-work. The options are
`wait_for_human` (long pause) or guess (likely wrong).

**Fix:** allow `wait_for_human` to be called during the complexity
assessment. "I think this is in scope, but I need to know: should the
new field be optional or required?" If the user doesn't reply in 24h,
refuse with reason "design question not answered in time."

### 4.12 The agent can't request new dependencies

The test needs a new mock library. The agent has no `pnpm add` tool.
It hacks around it (or refuses).

**Fix:** `request_new_dependency` tool with `needsApproval: always`.
The persona: "If you need a new dependency, request it via this tool;
don't hack around the absence." The human approves, the agent runs
`pnpm add`, continues.

### 4.13 No commit-message discipline

The agent's commit messages are "fix stuff" or "wip." This hurts
maintainer review.

**Fix:** the `commit_changes` tool requires a structured input
matching Conventional Commits. The persona enforces it. The diff is
the artifact; the commit message is the *narrative*.

### 4.14 Long sessions run out of context window

50+ turn sessions hit the model's context limit. The session is
interrupted mid-work.

**Fix:** compact at 75% of context window. Or, split into explicit
phases (assess, write-test, write-code, polish) with `defineState`
handing off context between phases. v2 concern.

### 4.15 The agent's PR doesn't auto-link the issue

The PR description doesn't include "Closes #N." GitHub doesn't
auto-close the issue on merge.

**Fix:** the `open_pull_request` tool auto-includes "Closes #N" in the
PR body. The persona: "If the issue is fully addressed, include
'Closes #N' in the PR body."

---

## 5. PR review

### 5.1 The reviewer-agent and the GitHub PR review API have a vocabulary conflict

The reviewer's verdict is "approve" or "request changes" — but those
are *exactly* the GitHub PR review API terms. A reviewer-agent that
posts "approve" via the API is a real GitHub approval, indistinguishable
from a human's.

**Fix:** the reviewer-agent posts a *comment*, not a *review*. The
comment has a structured verdict section:

```md
## Reviewer agent verdict

**Mechanical check:** [pass | fail]
**Scope check:** [matches issue | scope creep detected]
**Verdict:** [looks-good-mechanically | blocking-issues-found]

[free-form feedback]
```

The human posts the *actual* GitHub PR review (approve / request
changes / comment). The two are distinct artifacts. No vocabulary
conflict.

### 5.2 The reviewer-agent's trigger is incomplete

Currently: `pull_request: opened`. But the dev-agent pushes new
commits in iteration. The PR isn't re-opened; it's `synchronize`. The
reviewer needs to re-fire.

**Fix:** trigger on `opened` AND `synchronize` AND `ready_for_review`,
filtered to `pr.user.login === "dev-bot"`. The persona: "If the diff
changed since the last review, re-review the full diff, not just the
new commits."

### 5.3 The reviewer-agent doesn't see the issue context

The reviewer reads the diff, not the issue. The issue is the spec;
the diff is the implementation. A diff that doesn't match the issue is
wrong, even if the code is clean.

**Fix:** the reviewer's first action: read the linked issue. The
persona: "Read the issue, then the diff. A diff that solves a
different problem than the issue is wrong, regardless of code
quality."

### 5.4 The reviewer-agent's "approve" doesn't trigger dev-agent iteration

When the reviewer says "request changes," a human re-triggers the
dev-agent. This is open-loop. For v1, it's the design choice. For
v1.5, the reviewer's comment can include a structured marker that the
dev-agent's v1.5 trigger scans for:

```md
<!-- dev-agent-iteration-requested -->
```

The dev-agent's `onIssueComment` filter looks for this marker in
comments on issues/PRs the dev-agent is currently working on. The
human is still in the loop (they have to merge), but the iteration
trigger is automated.

### 5.5 The reviewer-agent can't escalate

If the reviewer finds a security issue, it should escalate to a
human, not just post a "request changes" comment.

**Fix:** the reviewer's verdict has a third option: `escalate`. The
comment mentions `@maintainers` (or a specific security team). The
PR is blocked from re-triggering the dev-agent.

### 5.6 The reviewer-agent has no session to park on

A review is short-lived. But if the reviewer's verdict is "request
changes" and the human doesn't re-trigger, the PR stalls. No
follow-up.

**Fix:** `reviewer-followup-sweep` schedule (weekly). Find PRs with
reviewer "blocking-issues-found" verdict and no dev-agent activity in
N days. Ping the maintainer.

---

## 6. Iteration & loops

### 6.1 The human-in-the-loop bottleneck is invisible

For v1 open-loop, every request-changes cycle waits for a human to
@mention the dev-agent. This is the design choice, but the cost
(human time per iteration) is not measured.

**Fix:** track `cycles_per_pr` in the OTel trace. Surface in the
weekly digest. The data informs the v2 closed-loop decision: if
cycles-per-PR is high and human-time is the bottleneck, closed-loop
is worth the complexity.

### 6.2 Re-refusal loops are not bounded

Agent refuses → human re-assigns → agent refuses again → human
re-assigns → agent refuses again. No upper bound.

**Fix:** `defineState({ refusalCount: 0 })`. On each `refuse_task`,
increment. On threshold (3), refuse with reason "third refusal; this
needs a human" and apply `status: dev-agent-refused` label. The
human takes over.

### 6.3 The dev-agent doesn't see prior dev-agent comments

If a previous dev-agent session refused 3 months ago, then a human
re-assigns, the new session starts fresh. It doesn't know about the
prior refusal.

**Fix:** the agent's session-start action reads the full issue +
comments + any prior dev-agent comments. The persona: "First action:
read the full issue + all comments. If a prior agent attempt is
mentioned, read its diff before starting."

### 6.4 The dev-agent and the user's intent can conflict

The human re-triggers the dev-agent with "@dev-agent use option A."
The dev-agent thinks option A is wrong. Currently: persona says
"follow the user's intent" (the right default), but doesn't document
the conflict.

**Fix:** persona rule: "If the human's request conflicts with your
assessment, prefer the human. But note the conflict in the PR
description: 'Implemented option A per maintainer request; option B
was considered but rejected because [reason]. Maintainers may want
to revisit.'"

---

## 7. Observability

### 7.1 OTel traces are mentioned but not operationalized

The team must "replay any decision." But the workflow for that isn't
documented.

**Fix:** include the session's OTel trace deep-link in the dev-agent's
PR description. Vercel Observability has a "Agent Runs" tab; the
deep-link is in the PR. Maintainers click to see the full trace.

### 7.2 Cost per session is not visible

We estimate $2/issue but the team can't see this in real-time.

**Fix:** emit a custom OTel span with token counts and sandbox
duration. Surface in the dashboard. The dev-agent's PR comment
includes a one-line cost summary: "This session: 32 turns, ~80K
tokens, ~$1.40."

### 7.3 Refusal rate is not measured

If the agent refuses 50% of issues, the heuristics are too strict. If
it accepts 100% and the PRs are bad, they're too loose.

**Fix:** track `refusal_rate`, `cycles_per_pr`, `merge_rate`,
`time_to_merge`. Surface in a weekly Slack digest.

### 7.4 No feedback loop from PR outcomes to the agent

When a PR is closed without merge, that's a signal the agent's work
was rejected. But the agent doesn't see it.

**Fix:** v2 — the dev-agent self-reviews closed PRs (read the diff,
the review comments, the closing comment) and updates the persona
heuristics based on patterns. v1: just track the metric. The feedback
loop is human-curated (the team reviews the metric and updates the
persona).

---

## 8. Cost & resource management

### 8.1 The 8-hour session cap is too generous

8 hours × $0.50/sandbox = $4/session. With 5 issues/day, $20/day in
cap-driven exits, on top of normal cost.

**Fix:** tighten to 4 hours active. TDD discipline should produce a PR
in 1-2 hours; 4 is a generous buffer.

### 8.2 The parked-sweep at 3 days is too long for cost control

A parked session costs less than active, but if the user abandoned
the issue, the slot is wasted.

**Fix:** first ping at 24h (shorter), close at 7 days (longer for
slower teams). Cadence is a parameter, not a constant.

### 8.3 Test running is the dominant per-session cost

If `pnpm test` takes 10 minutes and the agent iterates 5 times,
that's 50 minutes of sandbox time per session.

**Fix:** persona says "test the test" (run full suite before opening
PR), but doesn't say "use targeted tests during iteration." Add:
"During iteration, run only the relevant test file. Run the full
suite only at the end, before `open_pull_request`." 5x cost
reduction on test time.

### 8.4 Multiple parallel sessions at peak

15 parallel sessions = 15 sandboxes. Cost spike.

**Fix:** soft concurrency cap (8 parallel sessions). Beyond that,
queue. Surface the queue depth in a schedule report.

### 8.5 No peak-vs-baseline budgeting

The team budgets $300/month for the dev-agent. But peak days (15
issues) could double that.

**Fix:** the weekly digest includes a "this week vs. budget" line.
Alert if the burn rate exceeds 1.5x budget.

---

## 9. Security

### 9.1 The agent has full repo access in the sandbox

The dev-agent can read `packages/api/src/keys.ts` (or wherever secrets
are). It can read env vars in the test environment.

**Fix (in addition to existing `deny-all` network policy):**
- Redact known-secret file paths at session start (e.g., `secrets/**`,
  `**/credentials.json`, `**/.env*`).
- The persona's `toModelOutput` projection is the second line of
  defense for tool returns.
- The agent cannot run `env` in bash (or the output is redacted).

### 9.2 The agent can install packages

If the bootstrap script doesn't pin dependencies, the agent could
`pnpm add` something (typosquatting risk).

**Fix:** sandbox is read-only for `package.json` (or, the agent has
no `pnpm add` tool — only the gated `request_new_dependency` tool
proposed in § 4.12).

### 9.3 The agent's PR is on a public branch

If the agent writes the API key into a comment, the PR is the leak
vector.

**Fix:** pre-commit secret-scan hook. If the diff contains a secret
pattern (regex on `AKIA`, `ghp_`, `-----BEGIN`, etc.), refuse the
commit. The agent's `commit_changes` tool runs the scan before
allowing the commit.

### 9.4 The agent can read PR comments that contain secrets

A maintainer might paste a secret into a comment for context. The
agent reads the comment, holds the secret in context.

**Fix:** the `get_pull_request_comments` tool's `toModelOutput`
redacts known secret patterns from the returned comments. The agent
sees "[redacted secret]" instead of the actual value.

---

## 10. Quality of work

### 10.1 The agent doesn't run linter / formatter before opening PR

It runs tests. But `pnpm lint` and `pnpm format --check` are
separate. The reviewer-agent catches this, but the agent could
prevent it.

**Fix:** persona rule: "Before opening the PR, run `pnpm lint`,
`pnpm format`, `pnpm typecheck`. All must pass."

### 10.2 The test might not reflect the user's issue

The agent writes a test that passes when its code is correct. But
the test might not reflect what the user actually wanted.

**Fix:** persona rule: "After writing the test, post the test in a
comment on the issue for the user to confirm." v1.5 concern
(open-loop currently). For v1, the reviewer-agent's "scope check"
is the second line of defense: "does the diff solve the issue as
described?"

### 10.3 No way to measure "is the agent's work good?"

We track merge rate. But merge rate ≠ quality (a "good enough" PR
that the human rubber-stamps is merged; a great PR that no one
reviews is closed).

**Fix:** track `cycles_per_pr` (proxy for "how much rework"). High
cycles = agent is producing work that needs rework. Low cycles =
agent is producing good first drafts. Surface weekly.

---

## 11. The complexity heuristics

### 11.1 "Cross-cutting >5 files" is too coarse

5 files for a schema migration is small; 5 files for a UI redesign
is large.

**Fix:** use `lines_changed` (excluding generated files) + conceptual
area, not just file count. From the proposed skill:

- 1 area, <100 lines added = small (accept)
- 1 area, 100-300 lines = medium (accept with caution)
- >1 area OR >300 lines = large (refuse)

### 11.2 "Security-sensitive" needs concrete signals

**Fix:** maintain a `security-paths` and `security-keywords` list in
the skill:

- **Paths:** `auth/`, `crypto/`, `secrets/`, `permissions/`, `rbac/`,
  `payment/`, `billing/`, `token*/`
- **Keywords in the issue title/body:** "auth", "password", "token",
  "permission", "secret", "key", "oauth", "session", "csrf", "xss",
  "sql", "injection", "rce"

Any path match or 2+ keyword matches = refuse.

### 11.3 "No clear test surface" is the agent's judgment alone

Some features are hard to test (visual changes, env-dependent
behavior).

**Fix:** the `testing-patterns` skill includes a "this is not
testable here" section. The agent loads it before deciding. Examples:
visual changes without visual regression tests, env-dependent
behavior without mocking infrastructure.

---

## 12. Operational concerns

### 12.1 No runbook for the human in the loop

"What do I do when the agent's PR is wrong? When it refuses too
often? When the cost spikes?"

**Fix:** add a `RUNBOOK.md` to the dev-agent project. Mirrors the
`AGENTS.md` / `ARCHITECTURE.md` pattern. Not just docs — a checklist
for the human.

### 12.2 No onboarding for new maintainers

**Fix:** a `CONTRIBUTING.md` for the agent project. Different from
the main repo's `CONTRIBUTING.md`.

### 12.3 No health digest

**Fix:** `health-report` schedule. Daily: PRs opened, refused, merged.
Weekly: refusal rate, cycles-per-PR, time-to-merge, cost. Posts to
Slack.

### 12.4 No disaster recovery

If the Vercel project is down, the agent doesn't run. Issues pile up.

**Fix:** document the disaster-recovery runbook. The retry /
catch-up pattern: when the project recovers, scan for unprocessed
assignments and re-trigger.

### 12.5 No session state backup

Long-running dev sessions have state in Vercel Workflows. If the
project is migrated or lost, the state is gone.

**Fix:** for v2, export `defineState` snapshots to durable storage
(S3, KV) periodically. v1: accept the loss; long sessions are rare.

---

## 13. The repo itself

### 13.1 `CLAUDE.md` doesn't mention the dev-agent pattern

For a *template* repo, the dev-agent is a showcase. `CLAUDE.md`
should describe it.

**Fix:** add an "agents in this repo" section to `CLAUDE.md`,
pointing at the agent projects and explaining the agent-as-peer
principle (from `docs/learnings/eve/monorepo.md`).

### 13.2 The label taxonomy needs a `dev-agent` status group

Currently: `status: triage`, `needs-info`, `ready`, `blocked`. No
`in-progress` or `dev-agent-wip`.

**Fix:** extend the taxonomy:
- `status: dev-agent-wip` — dev-agent is working
- `status: dev-agent-parked` — dev-agent is waiting for human
- `status: dev-agent-refused` — dev-agent explicitly refused
- `status: dev-agent-pr-open` — dev-agent opened a PR

### 13.3 The dev-agent opens against `main`; the team uses `dev → staging → main`

The team's branching model is dev → staging → main. The dev-agent's
PR is against `main` (per the brief). This bypasses the staging step.

**Fix:** open against `dev`. The dev branch is integration; main is
release-only. Matches the team's flow.

### 13.4 No `OWNER` field for the agent project

Who maintains the agent's heuristics? Who is on-call for it?

**Fix:** an `OWNER` field in `AGENTS.md` (or a `CODEOWNERS` entry).
Same as the issue-triage design's missing field.

### 13.5 The agent's prompts are not versioned

The persona, skills, and heuristics are in the repo. But there's no
way to A/B test persona changes.

**Fix:** persona files have a `version:` field. The OTel trace tags
the version. Compare behavior across versions.

---

## 14. The persona's tone

### 14.1 "You're a junior dev" is condescending

The model isn't a junior dev; it's a tool. The framing might affect
its behavior (over-cautious, asks too much, refuses too often).

**Fix:** reframe: "You're an implementation agent. Your job is to
translate clear requirements into working code. You are not an
architect; you are a translator. When the requirements are clear,
proceed. When they're not, refuse or ask."

### 14.2 The persona has 9 rules; ordering matters

The model might cherry-pick rules. Order signals priority.

**Fix:** the persona's rules are *ordered*:
1. Stay in scope (top)
2. Refuse the hard ones
3. TDD: test first
4. Park on design questions
5. Re-refuse mid-work
6. No merge, no main
7. No secrets in the diff
8. Test the test
9. Sync with main before pushing (bottom)

The model reads top-to-bottom. The most important rules are first.

### 14.3 No persona version field

A/B testing needs a version stamp on the persona.

**Fix:** add `version: 0.1.0` to the persona file. Bump on changes.
Tag in the OTel trace.

---

## 15. Edge cases

### 15.1 The issue is closed while the dev-agent is working

The session doesn't know. It keeps working, opens a PR on a closed
issue.

**Fix:** the channel's `onIssue` filter handles `closed` action. If
the issue is closed mid-session, the agent posts a "session ended:
issue closed" comment and ends.

### 15.2 The branch is force-pushed by a human mid-session

The agent's local copy is stale. Push conflicts.

**Fix:** `push_branch` fails fast on conflict. The agent re-fetches,
re-applies its commits (`git rebase --onto origin/<branch>
origin/<base>..HEAD~`), retries. If it can't, refuses.

### 15.3 Two agents fire on the same issue

The dev-agent (`onIssue: assigned`) and the issue-triage agent
(`onIssue: opened`) shouldn't collide (different events). But edge
cases exist: re-assignment after triage.

**Fix:** the dev-agent's `onIssue` filter only fires on `assigned`
where the issue is *not* in `status: dev-agent-wip` (a label set by
the dev-agent itself). Idempotent re-trigger protection.

### 15.4 The dev-agent's PR has merge conflicts with main

**Fix:** see § 4.8 — `sync_with_main` before push. If conflicts,
refuse.

### 15.5 The dev-agent's session runs out of context window

**Fix:** see § 4.14 — compact or phase-split. v2.

### 15.6 The dev-agent writes a test that requires a new dep

**Fix:** see § 4.12 — `request_new_dependency` tool. v1.5 if the
gating is too heavy for v1.

### 15.7 The reviewer-agent finds a security issue

**Fix:** see § 5.5 — `escalate` verdict. Blocks the dev-agent's
re-trigger. Pings the security team.

### 15.8 The agent's PR is closed without merge

Currently: nothing. The issue is still open (or auto-closed by
GitHub), the work is lost.

**Fix:** the dev-agent's `onPullRequest` filter handles `closed`
action. If the PR is closed without merge, post a "the previous
attempt was closed. To retry, re-assign to @dev-bot" comment on
the issue.

---

## 16. The meta-process

### 16.1 The dev-agent's heuristics are not data-driven

The complexity heuristics (file count, line count, security paths)
are hand-curated. The team has no feedback on whether they're
accurate.

**Fix:** instrument every `assess_complexity` call. Record
`decision: accept | refuse`, `factors_considered`, `outcome` (PR
merged / closed / refused). After 100 issues, the team has a
calibration set: which "refuse" decisions led to good outcomes
(saved time) vs. which "accept" decisions led to bad outcomes
(missed complexity). Tune the heuristics.

### 16.2 No A/B testing of persona changes

**Fix:** see § 14.3 — version the persona, tag in OTel. Compare
behavior across versions.

### 16.3 No clear ownership

**Fix:** see § 13.4 — `OWNER` field, `CODEOWNERS` entry.

### 16.4 No upgrade path for `eve`

`eve` is 2 days old. Things will change. The agent's project needs
to be upgraded.

**Fix:** pin `eve` version in `package.json`. Test against new
versions in a staging deploy before upgrading production.

### 16.5 The agent's prompts are partly in the repo, partly in the runtime

The persona and skills are in the repo. But the system prompt and
the tool descriptions are in `eve`'s runtime.

**Fix:** for the tools the agent authors (the 6 in § 6 of the
brief), the *descriptions* are in the repo (the file contents). The
runtime wraps them. Anything that affects behavior is in the repo.

---

## 17. Priority list — what to fix first

If the team has time to fix 5 things before v1 ships, fix these:

| Priority | Fix | Why | Effort |
|---|---|---|---|
| 1 | Tool-level forcing function for `assess_complexity` (§ 4.1) | Persona rules aren't reliable; the entry point must be a tool | s |
| 2 | `sync_with_main` step before push (§ 4.8) | Without it, every PR has conflicts | xs |
| 3 | Distinct vocabulary for reviewer-agent verdict (§ 5.1) | Vocabulary conflict with GitHub PR review API = real bugs | xs |
| 4 | `cycles_per_pr` + `refusal_rate` tracking (§ 7.3, § 10.3) | No measurement = no trust; foundation for all v2 decisions | s |
| 5 | Extend label taxonomy with `dev-agent-*` statuses (§ 13.2) | Without it, the dev-agent's work is invisible on the issue board | xs |

If the team has time to fix 10 things, also:

| Priority | Fix | Why | Effort |
|---|---|---|---|
| 6 | Stateful TDD enforcement (§ 4.2) | Persona rule unenforced; model writes code first | m |
| 7 | Pre-flight check + refuse on broken repo (§ 4.7) | Saves a sandbox hour per broken-repo issue | s |
| 8 | `re-assessment` triggers mid-work (§ 4.4) | Catches the "I accepted but it's actually too complex" case | s |
| 9 | Re-refusal loop bound (§ 6.2) | Prevents the "human re-assigns forever" scenario | s |
| 10 | PR auto-includes "Closes #N" (§ 4.15) | Without it, merge doesn't close the issue | xs |

Everything else is v1.5 or v2.

---

## 18. Open questions for tech-lead

1. **Is the "quasi-autonomous" framing still right after this critique?**
   None of the gaps above change the framing — humans stay in the loop
   on consequential decisions. But the critique surfaces that the
   framing is more *v1* than *forever*; v2 may push toward more
   autonomy in narrow scopes.
2. **Which of the 10 priority fixes are non-negotiable for v1?**
   My recommendation: 1, 2, 3, 5. The others are quality-of-life
   improvements; 1, 2, 3, 5 are correctness.
3. **Should the v1.5 closed-loop iteration be designed in parallel?**
   Knowing the v2 direction influences v1's hook points (e.g., the
   reviewer-agent's verdict marker for auto-re-trigger).
4. **Does the team have the observability tools to track the metrics
   in § 7?** OTel traces are mentioned but not operationalized. If
   the team has Braintrust / Honeycomb / Datadog, this is easy. If
   not, it's a prerequisite for the v1 ship.
