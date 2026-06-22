# Issue-to-Merge Process — Final Design

> The canonical, complete process for handling GitHub issues in this
> repo, from issue creation to PR merge. Three agents collaborate:
> issue-triage, dev-agent, reviewer-agent. Status: **canonical**. This
> doc is the source of truth. The per-agent feasibility briefs and the
> process critique in this folder are historical record.

---

## 1. TL;DR

A GitHub issue is filed → the issue-triage agent classifies and labels
it (including a `dev-agent-scope: yes/no/uncertain` label) and posts a
single triage comment with a "next steps" footer → a human reads the
triage, decides whether to assign to `dev-bot`, and assigns if so → the
dev-agent session starts, calls `assess_complexity` as a forced first
action, and either refuses (with a clear comment and the
`status: dev-agent-refused` label) or proceeds through a TDD loop
(test → code → targeted tests → full suite) → syncs with main, commits,
pushes the branch, opens a *draft* PR against `dev` (not `main`),
self-checks (lint, format, typecheck, diff size), and flips to "ready
for review" → the reviewer-agent fires on the non-draft PR, reads the
issue first then the diff, and posts a *comment* (never a GitHub PR
review) with a structured three-state verdict
(`looks-good-mechanically` / `blocking-issues-found` / `escalate`) →
if blocking, the reviewer's comment includes a
`<!-- dev-agent-iteration-requested -->` HTML marker, the dev-agent
re-engages on the same issue, iterates, pushes new commits, and the
loop continues; if looks-good, the human approves via GitHub's PR
review UI and **the dev-agent merges the PR into `dev`**; if
escalate, the reviewer's comment mentions `@maintainer` and the PR
is blocked from dev-agent re-trigger → on the merge into `dev`,
the issue auto-closes via "Closes #N" in the PR body → release
engineering then promotes `dev → staging → main` through gated
PRs owned by the `release-manager` Claude Code subagent, with
semver, CHANGELOG, tagging, and binary publishing at the
staging → main step → the dev-agent's branch is cleaned up by a
weekly schedule, and OTel
metrics (`cycles_per_pr`, `refusal_rate`, `merge_rate`,
`time_to_merge`, cost per session) are surfaced in a weekly digest,
and a release-engineering discipline — gated promotion from `dev`
to `staging` to `main`, owned by the `release-manager` Claude Code
subagent — ensures code reaches production intentionally, never
by accident.
No agent uses the GitHub PR review API. The dev-agent merges into
`dev` (after human approval); no agent merges into `staging` or
`main`. The human reviews and approves merges into `dev`; the
human also reviews the promotion PRs into `staging` and `main`.
The agents do the mechanical work; the human makes the
consequential decisions.

## 2. The cast

Three agents, each with a clear role. All live as siblings of
`apps/` and `packages/` at the repo root. All share a single GitHub
App for credentials. None of them imports from `packages/`. Each
calls the team's oRPC router as an HTTP client when needed.

- **issue-triage-agent** — classifies and labels issues. Existing
  design per
  [`docs/learnings/eve/issue-triage.md`](../../learnings/eve/issue-triage.md).
  Adds a `dev-agent-scope: yes/no/uncertain` label and a "next steps"
  footer to its comment.
- **dev-agent** — implements assigned issues. Creates branches and
  PRs. Has a complexity-opinion authority (can refuse upfront).
  Never merges. Never uses the GitHub PR review API. Writes a
  focused, TDD-driven diff on a feature branch.
- **reviewer-agent** — first-pass mechanical reviewer. Posts comments
  with structured verdicts. Never uses the GitHub PR review API.
  Never merges. Conservative posture; three-state verdict.
  Escalates anything it can't judge (security, architecture, design).

## 3. The flow

The canonical sequence of events. Each step specifies the trigger,
the actor, and the action.

### 3.1 Issue creation

- **Trigger:** `issues.opened` on the issue-triage-agent's GitHub
  channel.
- **Actor:** issue-triage-agent.
- **Action:** reads the issue, classifies it, applies labels
  (`type:*`, `status: triage` or `ready` or `needs-info`,
  `priority:*`, `effort:*`, plus the new `dev-agent-scope: yes / no /
  uncertain`), posts ONE triage comment with a "next steps" footer
  that signals how to engage the dev-agent.

### 3.2 Triage may request more info

- If the issue lacks repro steps, the triage comment is the
  `repro-needed` template; status flips to `needs-info`.
- If the issue is too ambiguous, the triage comment is the
  `info-needed` template; status stays `needs-info`.
- The triage agent does *not* ping the dev-agent on these — the
  issue is not yet `ready` for either a human or an agent.

### 3.3 Human decides whether to assign to the dev-agent

- **Trigger:** human action — either assigning `dev-bot` to the
  issue via the GitHub UI, or commenting `/dev-agent try this` on
  the issue.
- **Actor:** human. The signal is explicit.
- **Constraint:** the issue must be `status: ready` (or the human
  overrides). The `dev-agent-scope` label is a strong prior but the
  human can override it.

### 3.4 Dev-agent session starts

- **Trigger:** `onIssue: assigned` on the dev-agent's GitHub channel,
  filtered to `assignees.some(login === "dev-bot")`.
- **Actor:** dev-agent.
- **Forced first action:** `assess_complexity` (a tool-level forcing
  function — see §5.6). The session-entry hook emits a system
  message: "Call `assess_complexity` before any other action." The
  model cannot proceed without calling it.

### 3.5 Complexity assessment

- The dev-agent loads the `complexity-assessment` skill, applies the
  checklist (security paths, line count, area count, ambiguity,
  testability), and posts a structured assessment comment on the
  issue.
- The assessment has two parts: a one-sentence summary of complexity,
  and a decision (`accept` or `refuse`) with a one-sentence reason.

### 3.6 If the dev-agent refuses

- **Tool:** `refuse_task` posts a comment with the reason and
  unblockers, applies `status: dev-agent-refused`, ends the session.
- The session is *not* parked; it's over. A human re-assigns if
  they want a re-engagement.
- Re-refusal is bounded: each session tracks `refusal_count`; on
  the third refusal, the agent posts "this needs a human" and ends.

### 3.7 If the dev-agent accepts — TDD loop

The TDD discipline is enforced via `defineState`, not the persona.

- **Step A:** `write_test` — first mutation of source. The state
  records `testWritten: true`.
- **Step B:** `run_tests` (targeted test file only) — must be
  called after `write_test`. The state enforces this; calling
  `run_tests` without `testWritten` fails.
- **Step C:** `write_code` — the implementation.
- **Step D:** `run_tests` (full suite) — the canonical check.
- **Loop:** if the full suite fails, iterate. The persona says
  "iterate; don't push until the full suite is green."

The TDD discipline is *structural*. The model cannot skip it.

### 3.8 Sync with main

- **Tool:** `sync_with_main` — `git fetch origin dev && git rebase
  origin/dev` (the team's integration branch is `dev`, not `main`).
- If conflicts, the dev-agent tries to resolve. If it can't, it
  refuses with reason "merge conflicts with `dev`, please re-assign
  after rebase."
- This step happens *before* every push, not just before the final
  push. Iterations on the same branch also sync.

### 3.9 Commit and push

- **Tool:** `commit_changes` — requires Conventional Commits
  structure. First commit auto-approved; subsequent commits
  auto-approved. Pre-commit secret-scan hook (regex on `AKIA`,
  `ghp_`, `-----BEGIN`, etc.) — if a secret is detected, the commit
  is refused.
- **Tool:** `push_branch` — feature branch only. The main branch
  is not in the MCP allowlist; the protocol layer blocks any
  push-to-main attempt.

### 3.10 Open PR as draft

- **Tool:** `open_pull_request` — always gates. PR opens as
  `draft: true`. The PR body includes:
  - The link to the issue
  - `Closes #N` (so merge auto-closes the issue)
  - A summary of changes (the OTel trace deep-link, in v1.5+)
  - A note if the dev-agent's approach conflicts with an earlier
    human suggestion ("implemented option A per maintainer request;
    option B was considered but rejected because [reason]")

### 3.11 Self-check

- The dev-agent runs `pnpm lint`, `pnpm format --check`,
  `pnpm typecheck`. All must pass.
- The dev-agent verifies the diff is small (lines_changed <
  threshold from the `complexity-assessment` skill, applied to the
  final diff too).
- If self-check passes, the dev-agent flips the PR to
  "ready for review" via `update_pull_request`.
- If self-check fails, the dev-agent iterates (back to §3.7).
  After three failed self-checks, the agent refuses with reason
  "could not pass self-check; this needs a human."

### 3.12 Reviewer-agent fires

- **Trigger:** `onPullRequest: opened | synchronize | ready_for_review`
  on the reviewer-agent's GitHub channel, filtered to
  `pr.user.login === "dev-bot"` AND `!pr.draft`.
- **Actor:** reviewer-agent.
- **First action:** read the linked issue (the spec).
- **Second action:** read the PR diff.
- **Third action:** apply the `review-checklist` skill
  (mechanical / scope / pattern / light security).
- **Fourth action:** post a *comment* with a structured three-state
  verdict. Never uses the GitHub PR review API.

### 3.13 Verdict routing

- **`looks-good-mechanically`** — comment says so. The human
  reviews via the GitHub PR review UI, approves, and merges.
- **`blocking-issues-found`** — comment lists specific issues
  with `path:line` references, includes the
  `<!-- dev-agent-iteration-requested -->` HTML marker. The
  dev-agent's iteration trigger scans for this marker on the issue
  and re-engages on the same session.
- **`escalate`** — comment mentions `@maintainer` (or a specific
  team per `escalation-routing` skill). The PR is blocked from
  dev-agent re-trigger. The human handles.

### 3.14 Iteration loop (blocking-issues-found path)

- The dev-agent re-engages on the same issue (the session is
  keyed to the issue, not the trigger).
- Reads the reviewer's comment. Identifies the issues.
- Iterates on the code, re-runs the TDD loop, syncs with main,
  commits, pushes. The `synchronize` event fires, the reviewer
  re-reviews the *full* diff (not just the new commits).
- The loop continues until the verdict is `looks-good-mechanically`
  or `escalate`, or until the third iteration (the
  `iteration_count` bound — same pattern as `refusal_count`).

### 3.15 Human review (GitHub PR review API)

- The human reads the PR description, the diff, the reviewer's
  comment, and the OTel trace (if surfaced in the PR body).
- The human posts a real GitHub PR review (approve / request
  changes / comment).
- On approve, the dev-agent's iteration trigger unblocks (see
  §3.16).

### 3.16 Dev-agent merges into `dev`

After human approval, the dev-agent merges the PR into `dev`.
The dev-agent's MCP allowlist includes `merge_pull_request` but
with a branch filter: only `dev` is accepted as the target. Any
attempt to merge into `staging` or `main` fails at the protocol
layer. GitHub's branch protection on `dev` (which the team
configures for required reviews + status checks) is the second
gate.

- **Tool:** `merge_pull_request` — gated `always`. The dev-agent
  does not auto-merge; the model calls the tool only after the
  human's GitHub review is `APPROVED`.
- **Method:** squash merge (keeps `dev` history clean).
- **Branch filter:** `base === "dev"`. The tool rejects any other
  base with a clear error.
- **Post-merge:** the issue auto-closes via `Closes #N` in the PR
  body. The dev-agent's session ends.

The dev-agent **never** merges into `staging` or `main`. Those
promotions are release-engineering responsibilities (see §11).

### 3.17 Post-merge on `dev`

- The dev-agent's branch is left for cleanup. The
  `cleanup-merged-branches` schedule runs weekly.
- The session's `cycles_per_pr`, `time_to_merge`, and `cost` are
  recorded. The weekly health digest surfaces them.

### 3.18 Release engineering — `dev → staging → main` promotion

The promotion of code from `dev` to `staging` to `main` is a
manual, gated, release-engineering process. The dev-agent and
reviewer-agent are not involved. The `release-manager` Claude Code
subagent coordinates with a human.

**dev → staging promotion:**

- **Trigger:** the team decides to start a release cycle.
- **Owner:** `release-manager` + a human.
- **Gates (all must be true):**
  - All open PRs against `dev` are merged.
  - CI on `dev` is green for the last 5 consecutive runs.
  - No open `priority: p0` issues.
  - The integration test suite is green on `dev`.
  - A manual smoke test has been run on the latest `dev` build.
  - `CHANGELOG.md` draft is ready (release-manager generates).
- **Action:** release-manager opens a PR from `dev` to `staging`
  with the draft CHANGELOG. A human reviews and merges. **No
  agent reviews this PR**; it's a release-engineering PR.

**staging → main promotion:**

- **Trigger:** the release decision (semver bump).
- **Owner:** release-manager + a human.
- **Gates (all must be true):**
  - Staging has been stable for at least 3 days.
  - All blockers (open `priority: p0` or `priority: p1` issues
    filed against staging) are addressed.
  - Version number is decided (semver).
  - `CHANGELOG.md` is finalized.
  - A Git tag is created.
  - The Electron desktop binary is built and signed.
  - The GitHub Release draft is created.
- **Action:** release-manager opens a PR from `staging` to `main`.
  A human reviews, approves, merges. The tag is created. The
  release is published.

The agent's authority ends at the `dev` merge. Everything
upstream of that is human-coordinated release engineering.

## 4. Process diagram

```text
issue.opened
       │
       ▼
issue-triage-agent
       │ classify, label (incl. dev-agent-scope), post triage comment with "next steps"
       ▼
human reads triage
       │
       ├── dev-agent-scope: no → human handles
       │
       ├── dev-agent-scope: uncertain → human decides
       │
       └── dev-agent-scope: yes → assign to dev-bot
              │
              ▼
       dev-agent session
              │
              ▼
       assess_complexity (FORCED)
              │
              ├── refuse → refuse_task → label dev-agent-refused → end
              │
              └── accept
                     │
                     ▼
              TDD loop: write_test → run_tests(targeted) → write_code → run_tests(full)
                     │
                     ▼
              sync_with_main
                     │ (fail = refuse)
                     ▼
              commit + push
                     │ (secret scan pre-commit)
                     ▼
              open draft PR (against `dev`, includes "Closes #N")
                     │
                     ▼
              self-check (lint, format, typecheck, diff size)
                     │ (fail = iterate, or refuse after 3 fails)
                     ▼
              flip to ready
                     │
                     ▼
       reviewer-agent fires
              │ read issue → read diff → apply checklist
              │
              ├── looks-good-mechanically → human approves via GitHub → dev-agent merges into `dev`
              │
              ├── blocking-issues-found
              │      │ comment with <!-- dev-agent-iteration-requested -->
              │      ▼
              │   dev-agent re-engages
              │      │ read review comments, iterate, push
              │      ▼
              │   reviewer-agent re-fires (synchronize)
              │      │ (loop, bounded by iteration_count)
              │
              └── escalate → @maintainer mention → human handles

[on merge into dev]
       │
       ▼
issue auto-closes via "Closes #N"

[release engineering]
       │
       ▼
dev → staging promotion
       │ release-manager opens PR (dev → staging) with CHANGELOG draft
       │ gates: CI green 5 runs, no p0, smoke test passed
       │ human reviews + merges (no agent review)
       ▼
staging → main promotion
       │ release-manager opens PR (staging → main)
       │ gates: stable 3d, semver decided, CHANGELOG finalized,
       │         tag created, binary built, Release draft ready
       │ human reviews + merges
       ▼
release: tag published, binary attached, GitHub Release live
```

## 5. The dev-agent spec

### 5.1 Trigger

`onIssue: assigned` filtered to `assignees.some(login === "dev-bot")`.
The session is keyed to the issue, so iteration triggers
(`<!-- dev-agent-iteration-requested -->` on the same issue) re-engage
the same session.

### 5.2 Directory shape

```text
dev-agent/
├── agent/
│   ├── agent.ts                        # sonnet, evals-ready
│   ├── instructions.md                 # persona, ~30 lines
│   ├── channels/
│   │   └── github.ts                   # onIssue: assigned + iteration marker scan
│   ├── connections/
│   │   └── github.ts                   # MCP, allowlist scoped tight (see §5.3)
│   ├── sandbox.ts                      # node24 + pnpm + monorepo bootstrap
│   ├── sandbox/workspace/
│   │   └── .eve/
│   │       └── seed.sh                 # clones the repo into /workspace
│   ├── tools/                          # see §5.6
│   │   ├── assess_complexity.ts        # FORCED entry point
│   │   ├── write_test.ts
│   │   ├── run_tests.ts
│   │   ├── write_code.ts
│   │   ├── sync_with_main.ts
│   │   ├── commit_changes.ts
│   │   ├── push_branch.ts
│   │   ├── open_pull_request.ts
│   │   ├── update_pull_request.ts      # for flipping draft to ready
│   │   ├── request_new_dependency.ts   # gated
│   │   ├── refuse_task.ts
│   │   ├── wait_for_human.ts
│   │   └── lib/                        # import-only shared helpers
│   ├── skills/
│   │   ├── repo-conventions/SKILL.md
│   │   ├── testing-patterns/SKILL.md
│   │   ├── diff-discipline/SKILL.md
│   │   ├── when-to-park/SKILL.md
│   │   └── complexity-assessment/SKILL.md
│   ├── schedules/
│   │   ├── parked-session-sweep.ts     # daily, 0 9 * * *
│   │   ├── stale-pr-sweep.ts           # weekly, 0 9 * * 1
│   │   ├── cleanup-merged-branches.ts  # weekly, 0 9 * * 0
│   │   └── health-report.ts            # weekly, posts to Slack
│   └── instrumentation.ts              # OTel + AI SDK span config
├── evals/                              # earned with the first regression
├── .env.example
├── AGENTS.md
├── ARCHITECTURE.md
├── RUNBOOK.md                          # for the human in the loop
├── CONTRIBUTING.md                     # for new maintainers
└── package.json
```

### 5.3 Connections + safety boundaries

```ts
// agent/connections/github.ts — allowlist
tools: {
  allow: [
    "get_issue",
    "get_issue_comments",
    "list_issues",
    "search_issues",
    "get_pull_request",
    "get_pull_request_files",
    "get_pull_request_comments",
    "create_pull_request",
    "update_pull_request",   // for flipping draft to ready
    "create_branch",
    "push_files",
    "add_issue_comment",
    "merge_pull_request",   // branch-filtered to `dev` only (see below)
  ],
}

// NOT in the allow list:
//   submit_pull_request_review (the GitHub PR review API — never)
//   close_pull_request, close_issue
//   delete_*, lock_issue, push_to_main_or_staging
//   update_issue (state changes), label_*
```

The dev-agent can merge into `dev` (after human approval) but
cannot merge into `staging` or `main`, cannot close, cannot use
the PR review API, cannot push to `staging` or `main`. The merge
authority is **branch-filtered** in the tool implementation:

```ts
// agent/tools/merge_pull_request.ts — branch filter
async execute({ pullRequestNumber, mergeMethod }, ctx) {
  const pr = await github.getPullRequest({ number: pullRequestNumber });
  if (pr.base.ref !== "dev") {
    throw new Error(
      `merge_pull_request only accepts 'dev' as base. Got '${pr.base.ref}'.`
    );
  }
  // Require human approval via the GitHub PR review API.
  const reviews = await github.listPullRequestReviews({ number: pullRequestNumber });
  const approved = reviews.some((r) => r.state === "APPROVED");
  if (!approved) {
    throw new Error("merge_pull_request requires human approval via the GitHub PR review API.");
  }
  return await github.mergePullRequest({
    number: pullRequestNumber,
    mergeMethod: mergeMethod ?? "squash",
  });
}
```

The protocol layer enforces branch + approval. The protocol layer
plus GitHub's branch protection on `dev` (configured by the team
for required reviews + status checks) is the two-layer gate.

**Sandbox network policy:** `deny-all` in `onSession`. The bootstrap
step that clones the repo runs in the factory (with `allow-all`),
then `onSession` locks down. Secret-redaction at session start for
known paths (`secrets/**`, `**/credentials.json`, `**/.env*`).

### 5.4 Channels

GitHub (inbound) + GitHub MCP (outbound). One channel:
`onIssue: assigned` + a secondary scan for the iteration marker
on the same issue's comments.

### 5.5 Authored tools (full)

| Tool | `needsApproval` | Why |
|---|---|---|
| `assess_complexity` | `never` | The forced entry point. The model can't proceed without calling it. |
| `write_test` | `never` | First mutation; records `testWritten: true` in `defineState`. |
| `run_tests` | `never` | Fails if `testWritten: false`. Targeted by default, full suite on demand. |
| `write_code` | `never` | The implementation step. |
| `sync_with_main` | `never` | The rebase step. Fails on conflicts. |
| `commit_changes` | `once` per session | First commit gates; subsequent commits auto-approved. Pre-commit secret-scan. Conventional Commits structure. |
| `push_branch` | `never` for feature branches | Main is not in the allowlist; protocol-layer block. |
| `open_pull_request` | `always` | The PR is the artifact; human review starts here. Opens as draft. |
| `update_pull_request` | `never` for draft→ready flip | After self-check passes. |
| `merge_pull_request` | `always` | Merges into `dev` only, after human approval via GitHub PR review API. Branch-filtered in the tool implementation. |
| `request_new_dependency` | `always` | Adding a runtime dep is a human decision. |
| `refuse_task` | `never` | Posts comment, applies label, ends session. |
| `wait_for_human` | `always` | The universal "I have a question" gate. |

### 5.6 The forced entry point — `assess_complexity`

This is the load-bearing piece. The persona says "always call
`assess_complexity` first." The session-entry hook makes this
*structural*:

```ts
// agent/sessions/start.ts (or the equivalent eve hook)
onSession: async ({ use, ctx }) => {
  const sandbox = await use({ networkPolicy: "deny-all" });
  // The system message is injected before the first turn:
  ctx.session.systemMessage = `
    REQUIRED FIRST ACTION: call the \`assess_complexity\` tool before
    any other action. The session will not proceed past the first
    turn without it. The tool returns either \`{ path: "refuse" }\`
    (which calls refuse_task and ends the session) or
    \`{ path: "proceed" }\` (which allows the rest of the work).
  `;
},
```

The tool's contract:

```ts
export default defineTool({
  description: "REQUIRED first action. Assess issue complexity and route to refuse or proceed.",
  inputSchema: z.object({
    assessment: z.string().min(50).max(500),
    decision: z.enum(["refuse", "proceed"]),
    reason: z.string().min(20),
  }),
  needsApproval: never,
  async execute({ assessment, decision, reason }, ctx) {
    await postIssueComment({ body: `**Complexity assessment:** ${assessment}\n\n**Decision:** ${decision}.\n\n**Reason:** ${reason}` });
    if (decision === "refuse") {
      await refuseTask({ reason, unblockers: [] });
      await ctx.session.end();
    }
    return { ok: true, path: decision };
  },
});
```

The model can't proceed without calling it. The session can't end
without either routing to refuse or routing to proceed. The persona
is *descriptive* of the protocol, not *enforcement* of the protocol.

### 5.7 Skills

- **`repo-conventions`** — directory structure, package boundaries,
  naming. Mirrors `CLAUDE.md`. Read before touching any file.
- **`testing-patterns`** — test framework, test location, fixture
  patterns, what is "testable" here vs. "not testable." Read
  before writing the first test.
- **`diff-discipline`** — small PRs, one concern, tests included,
  Conventional Commits structure. Read before committing.
- **`when-to-park`** — the decision tree for `wait_for_human` vs.
  guessing. Default to parking. Default to refusing.
- **`complexity-assessment`** — the heuristic checklist (security
  paths, line count, area count, ambiguity, testability). Read at
  session start. The floor of the decision; LLM judgment fills the
  gaps.

The `complexity-assessment` skill contains concrete signals:

- **Refuse if:**
  - Diff would touch `auth/`, `crypto/`, `secrets/`, `permissions/`,
    `rbac/`, `payment/`, `billing/`, `token*/` paths
  - Diff would add >300 lines OR span >3 conceptual areas
  - The task requires adding a new runtime dependency
  - The issue's "acceptance criteria" is empty or one-liner
  - The issue's "repro steps" is empty (for `type: bug`)
  - The issue title contains "redesign", "rethink", "rearchitect"
  - 2+ security keywords in the issue body (`auth`, `password`,
    `token`, `permission`, `secret`, `key`, `oauth`, `session`,
    `csrf`, `xss`, `sql`, `injection`, `rce`)

### 5.8 Persona (final)

The standing rules, ordered by priority.

1. **Stay in scope.** Never change files outside the issue's scope.
   If the task requires touching shared infrastructure, refuse
   instead.
2. **Refuse the hard ones.** Use the `complexity-assessment` skill.
   The refusal is a useful signal, not a failure.
3. **TDD: test first.** Enforced structurally via `defineState`,
   not aspirationally via persona.
4. **Park on design questions.** Use `wait_for_human`. Don't guess.
5. **Re-refuse mid-work.** If you realize mid-implementation that
   the task is too complex, stop, refuse, end the session.
6. **Merge authority: `dev` only.** After human approval via the
   GitHub PR review API, you may merge the PR into `dev`. Never
   merge into `staging` or `main` — those are release-engineering
   promotions. The `merge_pull_request` tool enforces the branch
   filter; the protocol layer rejects any other base.
7. **No secrets in the diff.** Use `toModelOutput` redaction. Don't
   echo secrets in comments.
8. **Test the test.** Run the full suite before opening the PR. If
   the test passes but the suite breaks, that's a scope problem.
9. **Sync with `dev` before pushing.** The team's integration
   branch is `dev`. Rebase before every push.
10. **Conventional Commits.** Imperative mood, <50 chars first line.
    Body: what + why, not how.

### 5.9 Schedules

- **`parked-session-sweep`** — daily, `0 9 * * *`. Sessions
  parked >24h get a follow-up comment; >7d get closed with
  reason.
- **`stale-pr-sweep`** — weekly, `0 9 * * 1`. PRs >7d without
  review get a comment pinging the maintainer.
- **`cleanup-merged-branches`** — weekly, `0 9 * * 0`. Delete
  dev-agent branches whose PR was merged.
- **`health-report`** — weekly, posts to Slack. `refusal_rate`,
  `cycles_per_pr`, `merge_rate`, `time_to_merge`, cost-per-issue,
  cost-per-month vs. budget.

### 5.10 Session duration cap

4 hours active. After 4h, the agent opens whatever PR it has (even
if incomplete) and ends the session. Prevents runaway cost.

## 6. The reviewer-agent spec

### 6.1 Trigger

`onPullRequest: opened | synchronize | ready_for_review` filtered to
`pr.user.login === "dev-bot"` AND `!pr.draft`. The session is
keyed to the PR.

### 6.2 Directory shape

```text
reviewer-agent/
├── agent/
│   ├── agent.ts                        # sonnet-mini
│   ├── instructions.md                 # persona, ~25 lines
│   ├── channels/
│   │   └── github.ts                   # onPullRequest: opened | synchronize | ready_for_review
│   ├── connections/
│   │   └── github.ts                   # MCP, allowlist = read PR + post comment only
│   ├── tools/
│   │   ├── read_pull_request_diff.ts
│   │   ├── read_issue.ts
│   │   └── post_review_comment.ts
│   ├── skills/
│   │   ├── review-checklist/SKILL.md
│   │   ├── escalation-routing/SKILL.md
│   │   └── verdict-vocabulary/SKILL.md
│   └── instrumentation.ts
├── evals/                              # earned with the first regression
├── .env.example
├── AGENTS.md
├── ARCHITECTURE.md
└── package.json
```

### 6.3 Connections + safety boundaries

```ts
// agent/connections/github.ts — allowlist
tools: {
  allow: [
    "get_pull_request",
    "get_pull_request_files",
    "get_pull_request_comments",
    "get_issue",
    "get_issue_comments",
    "add_issue_comment",
  ],
}

// NOT in the allow list:
//   submit_pull_request_review (the GitHub PR review API — never)
//   merge_pull_request, close_pull_request
//   delete_*, lock_*
//   label_*
```

The reviewer cannot use the GitHub PR review API. It can only post
comments.

### 6.4 Authored tools

| Tool | `needsApproval` | Why |
|---|---|---|
| `read_pull_request_diff` | `never` | Read-only. |
| `read_issue` | `never` | Read-only. |
| `post_review_comment` | `never` | Posts the structured comment. The persona enforces the format; the tool rejects malformed bodies. |

### 6.5 Skills

- **`review-checklist`** — what to check, in order: mechanical
  (CI status), scope (matches the issue?), pattern (follows
  repo conventions?), light security (secrets in the diff?
  security-sensitive paths?).
- **`escalation-routing`** — who to ping when. Mirrors
  `CODEOWNERS` for code-area routing. Security team for `auth/`,
  `crypto/`. Maintainers for architectural concerns.
- **`verdict-vocabulary`** — the structured comment format. The
  canonical contract.

### 6.6 Persona (final)

1. **Read the issue first, then the diff.** The issue is the spec.
   A diff that solves a different problem than the issue is wrong.
2. **Post a *comment* with a structured verdict section. Never
   use the GitHub PR review API.** The human does the actual
   review.
3. **Use the three-state verdict.** `looks-good-mechanically`,
   `blocking-issues-found`, `escalate`. "I don't know" is a
   valid choice.
4. **Be conservative.** False positives (request-changes on a
   fine PR) cost human time; false negatives (approve a bad PR)
   cost trust. Asymmetry favors blocking.
5. **Re-review the full diff on `synchronize`, not just the new
   commits.** A clean new commit on top of a broken previous
   commit is still broken.
6. **Never approve a PR whose author is yourself.** Defensive.
7. **No secrets in the comment.** Use `path:line` references,
   never the content.
8. **If unsure, escalate.** Three-state means "I don't know" is
   a valid choice.

### 6.7 The structured comment (canonical)

```md
## Reviewer agent verdict

**Mechanical check:** [pass | fail]
**Scope check:** [matches issue | scope-creep-detected]
**Verdict:** [looks-good-mechanically | blocking-issues-found | escalate]

[free-form feedback with file:line references]

<!-- dev-agent-iteration-requested -->  (only when verdict = blocking-issues-found)
```

The HTML comment is the structured marker. The dev-agent's
iteration trigger scans for it on the issue's PR comments.

### 6.8 Schedule

`reviewer-followup-sweep` — weekly, `0 9 * * 1`. Find PRs with
verdict `blocking-issues-found` and no dev-agent activity in 7d,
post a follow-up comment, ping the maintainer on Slack.

## 7. The handoffs

The structured handoffs between agents. Each handoff has a
specific signal that doesn't depend on free-form interpretation.

### 7.1 Triage → Dev-agent

- **Signal:** `dev-agent-scope: yes` label (set by triage) +
  `status: ready` label + human assigns `dev-bot`.
- **State carried forward:** the labels are the spec. The
  dev-agent reads them, but the human's assignment is the
  binding signal.
- **Failure mode:** triage sets `dev-agent-scope: no` when it
  should be `yes` → human can override by assigning anyway.

### 7.2 Dev-agent → Reviewer-agent

- **Signal:** the PR is opened against `dev` AND the user is
  `dev-bot` AND the PR is non-draft (i.e., the dev-agent
  flipped it to ready).
- **State carried forward:** the PR is the artifact. The
  reviewer reads the linked issue (via the issue number in the
  PR body) and the diff.

### 7.3 Reviewer-agent → Dev-agent (iteration)

- **Signal:** reviewer's comment on the PR includes
  `<!-- dev-agent-iteration-requested -->`.
- **Trigger path:** the dev-agent's `onIssue` filter scans
  comments on the issue linked to the PR. The marker is detected.
  The dev-agent re-engages on the same issue session.
- **State carried forward:** the issue session, the branch, the
  diff. The dev-agent reads the reviewer's comment, identifies
  the issues, iterates.
- **Bound:** `iteration_count` in `defineState`. On the third
  iteration, the dev-agent posts a "stuck in iteration loop;
  needs human" comment and ends the session.

### 7.4 Reviewer-agent → Human (escalation)

- **Signal:** reviewer's comment on the PR mentions
  `@maintainer` (or a specific team per `escalation-routing`).
- **Constraint:** the PR is blocked from dev-agent re-trigger.
  Even if the dev-agent's iteration trigger fires, the marker
  is *not* present, so the dev-agent does not re-engage.
- **State carried forward:** the comment mentions the specific
  concern. The human takes it from there.

### 7.5 Dev-agent → Human (PR ready for review)

- **Signal:** the PR is non-draft AND the reviewer's verdict is
  `looks-good-mechanically`.
- **Action:** the human reads the PR via the GitHub PR review
  UI, posts a real review (approve / request changes / comment),
  and on approve, merges.
- **State carried forward:** the PR is ready. The dev-agent's
  session is dormant (waiting for either iteration or merge).

## 8. Edge cases (handled)

Each edge case from the process critique, with the fix in place.

| Edge case | Fix |
|---|---|
| Issue with no clear repro | Triage sets `status: needs-info`. Dev-agent is not engaged. |
| Issue requiring design discussion | Triage's `info-needed` template. Human clarifies first. |
| Security issue (false negative in triage) | `security-audit-sweep` schedule: weekly, scans unlabeled issues for security keywords, pings the security team. Defense in depth. |
| Issue already has a linked PR | Triage reads `list_issues` filtered by linked PR; posts a short "PR exists, see #N" comment instead of full triage. |
| Triage and dev-agent disagree on scope | Triage's `dev-agent-scope` is a strong prior but the human can override. The dev-agent does its own `assess_complexity` and may refuse. |
| Dev-agent accepts at start, realizes mid-work it's too complex | Re-assessment triggers after each milestone (`write_test` done, first code complete). If complexity threshold crossed, re-refuse. |
| Agent's PR has merge conflicts with `dev` | `sync_with_main` step before push. If conflicts, refuse with reason. |
| Two agents fire on the same issue | Triggers are disjoint (`onIssue: opened` for triage, `onIssue: assigned` for dev). |
| PR closes between reviewer trigger and comment post | Session ends with logged warning. No retry. |
| Re-refusal loop (refuse → re-assign → refuse) | `refusal_count` in `defineState`. On the third, refuse with "needs human" and apply `status: dev-agent-refused`. |
| Re-iteration loop (blocking → iterate → blocking) | `iteration_count` in `defineState`. On the third, post "stuck in iteration loop; needs human" and end. |
| Agent writes a test that requires a new dep | `request_new_dependency` tool with `needsApproval: always`. |
| Agent's commit message is bad | `commit_changes` tool requires Conventional Commits structure. |
| Long session runs out of context window | 4h active cap. After 4h, the agent opens whatever PR it has, even if incomplete, and ends. |
| Agent writes a test that doesn't reflect the issue | Reviewer-agent's scope check catches it. Persona says: "Read the issue, then the diff. A diff that solves a different problem than the issue is wrong." |
| Agent introduces a secret in the diff | Pre-commit secret-scan hook refuses the commit. |
| The repo is in a broken state | Pre-flight check at session start. If `pnpm install` fails, refuse with "repo broken, needs human." |
| External user `@dev-agent` in comment | v1: dev-agent doesn't fire on `onIssueComment` for non-maintainers. v1.5: filter on auth role. |
| Concurrent assignments stack | No cap in v1. Cost is the bound. If peak shows it's a problem, add a soft cap. |
| Issue closes while dev-agent is working | `onIssue: closed` filter. Session ends gracefully with a comment. |
| Human unassigns `dev-bot` mid-session | `onIssue: unassigned` filter. Session ends gracefully. |
| Branch is force-pushed by a human mid-session | `push_branch` fails fast. Agent re-fetches, re-applies, retries. If it can't, refuses. |
| Reviewer fires on human-authored PR | v1: trigger filters to dev-bot only. v1.5: opt-in label. |
| Reviewer finds a security issue | Three-state verdict includes `escalate`. Reviewer mentions `@maintainer` or `@security-team`. PR blocked from dev-agent re-trigger. |

## 9. Operational concerns

### 9.1 RUNBOOK.md (in `dev-agent/`)

For the human in the loop. Answers "what do I do when..."

- The dev-agent's PR is wrong → close without merge, the
  dev-agent's session detects the close and posts a follow-up
  comment.
- The dev-agent refuses too often → check the
  `complexity-assessment` skill's heuristic accuracy against
  the last 30 refusals. Update if the heuristics are too strict.
- The cost spikes → check the
  `health-report` digest. If `cycles_per_pr` is high, the
  reviewer is too strict or the dev-agent's first drafts are
  weak. If `refusal_rate` is high, the heuristics are too strict.
- The reviewer is rubber-stamping → check the
  `review-checklist` skill's accuracy. If too many
  `looks-good-mechanically` verdicts are followed by human
  request-changes, the reviewer's checklist is missing checks.

### 9.2 CONTRIBUTING.md (in `dev-agent/`)

For new maintainers. How to:
- Update the `complexity-assessment` skill (and the
  mirror-discipline in `CLAUDE.md`).
- Update the `repo-conventions` skill.
- Update the `verdict-vocabulary` (in `reviewer-agent/`).
- Add a new `escalation-routing` target.
- Update the persona (in priority order, not arbitrary).
- Run the local dev loop (`eve dev` + the TUI).

### 9.3 Observability — the metrics

OTel is the source. The dashboard is whatever the team uses
(Braintrust / Honeycomb / Datadog / Vercel Observability).
The metrics:

- **`refusal_rate`** — refusals / total sessions. High = heuristics
  too strict. Low + bad PRs = heuristics too loose.
- **`cycles_per_pr`** — average review cycles per PR. High = first
  drafts are weak. Low = first drafts are clean.
- **`merge_rate`** — merged / opened. Inverse of `close_rate`.
- **`time_to_merge`** — PR open to merge. Trend over time.
- **`cost_per_session`** — tokens + sandbox hours. Trend over
  time. Alert if >1.5x budget.
- **`cost_per_month`** — total. Alert at budget.
- **`iteration_loop_rate`** — sessions that hit
  `iteration_count = 3`. Indicates the reviewer is too strict or
  the dev-agent isn't absorbing feedback.
- **`refusal_loop_rate`** — sessions that hit
  `refusal_count = 3`. Indicates the human's assignments are
  out of scope.

All surfaced weekly in the `health-report` Slack digest.

### 9.4 Disaster recovery

- **Vercel project down:** the `health-report` schedule pings
  maintainers when no sessions have run in 24h. Manual catch-up:
  scan for unprocessed assignments, re-trigger.
- **GitHub App uninstalled:** sessions fail to authenticate. The
  `onIssue` filter detects auth failures and posts an "App needs
  re-installation" comment on the issue.
- **Sandbox backend down:** the bootstrap step fails. The session
  refuses with "sandbox unavailable, retry later."

## 10. Required repo changes

### 10.1 Label taxonomy extension

Extend `CLAUDE.md` § "Issue Labels" with the dev-agent group:

```yaml
# status (extended)
- name: "status: dev-agent-wip"
  description: "Dev-agent is actively working on the issue."
- name: "status: dev-agent-parked"
  description: "Dev-agent is waiting for human input."
- name: "status: dev-agent-refused"
  description: "Dev-agent has explicitly refused the issue."
- name: "status: dev-agent-pr-open"
  description: "Dev-agent has opened a PR for the issue."

# dev-agent-scope (new group)
- name: "dev-agent-scope: yes"
  description: "Triage indicates the issue is in scope for the dev-agent."
- name: "dev-agent-scope: no"
  description: "Triage indicates the issue is NOT in scope for the dev-agent."
- name: "dev-agent-scope: uncertain"
  description: "Triage is uncertain; human decides."
```

The label taxonomy is the source of truth. The agents' skills
mirror it. The mirror discipline applies: `CLAUDE.md` and the
skill drift together in the same PR.

### 10.2 CLAUDE.md "agents in this repo" section

Add to `CLAUDE.md`:

```md
## Agents in this repo

This repo runs three eve agents as siblings of `apps/` and
`packages/`:

- **issue-triage-agent** — classifies issues, applies labels,
  posts triage comments. Per `docs/learnings/eve/issue-triage.md`.
- **dev-agent** — implements assigned issues, opens PRs. Per
  `docs/reports/eve/process.md`.
- **reviewer-agent** — first-pass reviewer of dev-agent PRs.
  Per `docs/reports/eve/process.md`.

All three share a single GitHub App. None of them imports from
`packages/`. Each calls the team's oRPC router as an HTTP client
when needed. Each deploys independently to Vercel. The agent-as-peer
principle (per `docs/learnings/eve/monorepo.md` § 6) applies.
```

### 10.3 CODEOWNERS

The `reviewer-agent`'s `escalation-routing` skill mirrors
`CODEOWNERS`. `CODEOWNERS` is the source of truth; the skill
drifts with it in the same PR.

## 11. Release engineering

The discipline that ensures code promoted from `dev` to `staging`
to `main` is intentional, tested, and reversible. Three layers:
**branch promotion model**, **quality gates**, **release-manager
ownership**. The agents' authority ends at the `dev` merge.
Everything upstream is human-coordinated release engineering.

### 11.1 Branch promotion model

The three branches have different roles and different merge
authority.

| Branch | Role | What lands here | Merge authority |
|---|---|---|---|
| `dev` | Integration | All PRs (including dev-agent's) | Dev-agent (after human approval) + humans |
| `staging` | Pre-release | Promotion from `dev` via gated PR | Humans only (release-manager coordinates) |
| `main` | Production | Promotion from `staging` via gated PR | Humans only (release-manager coordinates) |

The MCP allowlist's `merge_pull_request` for the dev-agent is
configured with a branch filter (`base === "dev"`). Any attempt to
merge into `staging` or `main` fails at the protocol layer. This is
the first gate; GitHub's branch protection on `staging` and `main`
(configured by the team for required reviews + status checks) is
the second gate. The `release-manager` Claude Code subagent never
calls `merge_pull_request` — it only opens promotion PRs; humans
click merge.

### 11.2 Quality gates at each stage

The bar rises at each promotion. The earlier gates are
mechanical and automated; the later gates are human-judgment.

| Stage | Gate | Owner | Mechanic |
|---|---|---|---|
| PR creation | Dev-agent self-check (lint, format, typecheck) | dev-agent | Automated |
| PR review | Reviewer-agent verdict (three-state) | reviewer-agent | Automated |
| PR approval | Human approval via GitHub PR review API | human | Manual |
| PR merge | Dev-agent merge into `dev` (branch filter + approval) | dev-agent | Automated (gated) |
| dev → staging | CI green for 5 consecutive runs on `dev` | CI + release-manager | Automated |
| dev → staging | No open `priority: p0` issues | human | Manual check |
| dev → staging | Integration test suite green on `dev` | CI | Automated |
| dev → staging | Manual smoke test on latest `dev` build | human | Manual |
| dev → staging | `CHANGELOG.md` draft ready | release-manager | Automated |
| staging → main | Staging stable for ≥3 days | human + release-manager | Manual |
| staging → main | All blockers addressed (open `priority: p0`/`p1` against staging) | human | Manual |
| staging → main | Semver bump decided | release-manager + human | Manual |
| staging → main | `CHANGELOG.md` finalized | release-manager + human | Manual |
| staging → main | Git tag created | release-manager | Automated |
| staging → main | Electron binary built and signed | CI | Automated |
| staging → main | GitHub Release draft ready | release-manager | Automated |

### 11.3 The role of `release-manager`

The `release-manager` Claude Code subagent (already in
`.claude/agents/release-manager/`) owns the operational details of
release engineering. It is invoked by humans when a release cycle
starts (dev → staging) and when a release ships (staging → main).
The dev-agent and reviewer-agent are not involved.

The release-manager's responsibilities:

- Generate the CHANGELOG draft from PRs and commits since the
  last tag.
- Decide the semver bump (in consultation with a human).
- Open the dev → staging promotion PR with the draft CHANGELOG.
- Open the staging → main promotion PR.
- Coordinate the binary build and signing.
- Create the GitHub Release.
- Tag the release.

The release-manager is invoked via Claude Code sessions (human-
driven). It does not run autonomously. A human must be in the
session for every consequential decision (semver, sign-off,
publish).

### 11.4 Versioning (semver)

The project follows [semver](https://semver.org/). The semver
decision is owned by the `release-manager` + a human. The version
bump reflects:

- **Patch** (X.Y.Z+1): bug fixes, dependency updates, performance
  improvements. No breaking changes.
- **Minor** (X.Y+1.0): new features, deprecations. Backward-
  compatible.
- **Major** (X+1.0.0): breaking changes.

The version is recorded in `package.json` (and any platform-
specific version files — for this project, `apps/desktop/package.json`
and the Electron `app/package.json`), the Git tag, and the GitHub
Release.

### 11.5 CHANGELOG generation

The release-manager generates the CHANGELOG draft by walking
commits and merged PRs since the last tag. The format follows
[Keep a Changelog](https://keepachangelog.com/). Sections:

- `Added` — new features
- `Changed` — changes to existing functionality
- `Deprecated` — soon-to-be-removed features
- `Removed` — removed features
- `Fixed` — bug fixes
- `Security` — security fixes

The draft is hand-curated by the release-manager + a human
before the staging → main promotion. Auto-generated drafts are
starting points, not final.

### 11.6 Tagging and publishing

When the staging → main promotion is approved:

1. The release-manager creates the Git tag (`vX.Y.Z`).
2. The release-manager triggers the desktop binary build via
   the existing CI workflow (the same workflow that runs on
   every commit to `main`).
3. The release-manager creates the GitHub Release with the
   CHANGELOG section and the binary attached.
4. The release is published.

The tag + Release are atomic. If any step fails, the previous
release remains the current one; no half-tagged state is
committed.

### 11.7 Rollback procedure

If a release is bad, the rollback procedure depends on timing:

- **Within the first hour:** revert the staging → main merge
  via a fast-forward revert. Bump the patch version (X.Y.Z-1 →
  X.Y.Z). Re-release.
- **After the first hour but within a day:** cherry-pick the
  revert commit onto `main`. Bump the patch version. Re-release.
- **After the first day:** the fix becomes a new patch release
  (X.Y.Z → X.Y.Z+1). No rollback; the new release is the fix.

The decision tree is owned by the release-manager + a human.
Post-mortem follows every rollback (per the existing
`docs/reports/` convention).

### 11.8 Dev-agent's merge authority within `dev`

The dev-agent's merge authority is **scoped to `dev` only**,
enforced by three layers:

1. **Tool-level branch filter.** The `merge_pull_request` tool
   rejects any `base !== "dev"` with a clear error.
2. **Approval check.** The tool requires the PR to have at least
   one `APPROVED` review from the GitHub PR review API.
3. **GitHub branch protection.** The team configures `dev`'s
   branch protection for required reviews + status checks. The
   `merge_pull_request` call respects this.

What the dev-agent **cannot** do:

- Merge into `staging` or `main` (tool filter).
- Push directly to `staging` or `main` (MCP allowlist).
- Approve PRs via the GitHub PR review API (MCP allowlist).
- Create release tags (MCP allowlist).
- Publish releases (out of agent scope).

These are release-engineering responsibilities, owned by the
`release-manager` subagent + humans.

## 12. Out of scope (permanent)

Things explicitly NOT in this process. Not deferred, not
"v1 non-goals" — out of scope, by design.

- **Agent uses the GitHub PR review API.** The agents post
  comments; the human posts reviews. Vocabulary conflict with
  the API is a non-starter.
- **Agent merges into `staging` or `main`.** Period. The
  dev-agent's merge authority is `dev` only, branch-filtered at
  the protocol layer. Promotions to `staging` and `main` are
  release-engineering responsibilities.
- **Agent pushes to `staging` or `main`.** Period. The
  dev-agent's branch is always against `dev`. `staging` and
  `main` are release-only.
- **Agent modifies the issue's `status` label directly.** The
  agent's status changes go through the triage agent or the
  human. The MCP allowlist doesn't include `update_issue`.
- **Agent applies `type:*` or `priority:*` labels on the
  issue.** Triage's job. The dev-agent's labels are only
  `dev-agent-*` and `status: dev-agent-*`.
- **Agent auto-closes issues.** Only on merge via "Closes #N"
  in the PR body.
- **Subagent delegation.** The agents don't spawn subagents.
  The persona carries the work.
- **Evals in v1.** Earned with the first regression.
- **Cross-repo work.** Each agent only touches this repo.
- **Architectural review by the reviewer-agent.** The reviewer
  is mechanical. Architectural concerns → `escalate`.
- **Performance review by the reviewer-agent.** The reviewer
  doesn't profile. Perf concerns → `escalate` or trust the
  team's perf tools.
- **Auto-merge by the reviewer-agent.** The reviewer doesn't
  approve via the API, doesn't merge, doesn't close.

## 13. Cost model (steady-state)

| Agent | Model | Per-issue cost | Monthly (3–5 issues/day) | Monthly (peak: 10–15/day) |
|---|---|---|---|---|
| dev-agent | Sonnet | $1.50–2.50 + $0.20–0.50 sandbox | $250–400 | $500–800 |
| reviewer-agent | Sonnet-mini | $0.03–0.06 | $5–10 | $10–20 |
| issue-triage-agent | Sonnet | ~$0.10/comment | $30–60 | $60–120 |
| **Total** | | | **$285–470** | **$570–940** |

These are the steady-state estimates. The first month may be
higher as the team iterates on prompts and skills.

The `health-report` schedule alerts when the burn rate exceeds
1.5x budget.

## 14. Effort to build

| Component | Effort |
|---|---|
| Reviewer-agent (full build, end-to-end test) | `s` (half a day) |
| Dev-agent (sandbox bootstrap, agent code, skills, schedules) | `l` (a week or more) |
| Triage-agent extensions (`dev-agent-scope` label, "next steps" footer) | `s` (half a day) |
| Repo changes (labels, CLAUDE.md, CODEOWNERS) | `xs` (1 hour) |
| Observability setup (OTel, dashboard, health-report) | `m` (1–2 days, depending on the team's existing tools) |
| Documentation (RUNBOOK, CONTRIBUTING, ARCHITECTURE) | `s` (half a day) |
| End-to-end testing against a staging repo | `m` (1–2 days) |

**Build order:**

1. Repo changes (labels, CLAUDE.md, CODEOWNERS) — `xs`
2. Reviewer-agent — `s`
3. Triage-agent extensions — `s`
4. Dev-agent — `l`
5. Observability — `m`
6. End-to-end test — `m`

The reviewer is built first because it's small, low-risk, and
proves the comment-as-verdict pattern. The dev-agent then lands
with the reviewer already running. The triage extensions land
in parallel with the dev-agent (the dev-agent's `assess_complexity`
needs the `dev-agent-scope` label to be set).

## 15. Open questions answered

Every open question from the briefs and the critique, with a
final answer. No re-litigation.

| Question | Answer |
|---|---|
| Open loop vs. closed loop for iteration? | Closed loop via the `<!-- dev-agent-iteration-requested -->` marker. Bounded by `iteration_count`. |
| What label does the dev-agent's refusal apply? | `status: dev-agent-refused`. |
| Parked-sweep timing? | 24h ping, 7d close. |
| Model for the reviewer? | Sonnet-mini. |
| Test command location? | Bootstrap script + `testing-patterns` skill. |
| GitHub App — shared or separate? | Shared. One App, one webhook, three agents. |
| Session duration cap? | 4 hours active. |
| PR is closed without merge — what happens? | Dev-agent's session detects the close, posts a follow-up comment. No auto-re-trigger. |
| Reviewer-agent applies a label on its verdict? | No. The comment is the artifact. |
| Concurrency cap? | None. Cost is the bound. |
| Sonnet-mini or haiku for reviewer? | Sonnet-mini. Haiku is the v2 cost-pressure escape hatch. |
| Reviewer-agent comments on PR or issue? | PR. The PR is the artifact. |
| v1.5 closed-loop marker format? | HTML comment. Invisible in UI, parseable by tools. |
| Reviewer-agent ignores PR's own CI checks? | No — trust CI status for the mechanical check. |
| PR opens against `main` or `dev`? | `dev`. The team's integration branch. |
| Cost overrun alert threshold? | 1.5x budget per week. |
| PR auto-includes "Closes #N"? | Yes. The `open_pull_request` tool auto-includes. |
| Pre-commit secret-scan? | Yes. Regex on `AKIA`, `ghp_`, `-----BEGIN`, etc. |
| TDD discipline enforcement? | `defineState({ testWritten: false })`. The `run_tests` tool fails if `testWritten: false`. |
| Reviewer fires on `synchronize`? | Yes. Re-reviews the full diff. |
| Reviewer ignores drafts? | Yes. Filter on `!pr.draft`. |
| Re-assessment mid-work? | Yes, after each milestone. |
| Refuse-and-end vs. refuse-and-park? | Refuse-and-end. A human re-engages by re-assigning. |
| Security audit sweep? | Yes, weekly. Defense in depth. |
| Soft concurrency cap? | Not in this process. Cost is the bound. |
| Concurrency cap exists? | No. |
| Evals in v1? | No. Earned with the first regression. |
| Reviewer-agent reviews human PRs? | No. Trigger filters to dev-bot only. |
| Architectural review by reviewer? | No. → `escalate`. |
| Performance review by reviewer? | No. → `escalate`. |
| Auto-merge by reviewer? | No. |
| Auto-close by reviewer? | No. |
| Subagent delegation? | No. |
| Cross-repo work? | No. |

## 16. How this doc relates to the other docs in this folder

- `INDEX.md` — the comparison table across all candidate agents.
  This process doc is the canonical answer; the briefs are
  historical record.
- `dev-agent-feasibility.md` — historical record. The brief that
  led to this process. Some of its assumptions have been updated
  by the critique and the reviewer-agent brief.
- `dev-agent-process-critique.md` — historical record. The 18
  sections of gaps and fixes are all applied in this process doc.
- `reviewer-agent-feasibility.md` — historical record. The brief
  that led to the reviewer-agent's spec in §6 of this doc.

This doc is the source of truth. The briefs and the critique are
preserved for traceability but are no longer authoritative.

## 17. Cross-references to existing docs

- [`docs/learnings/eve/README.md`](../../learnings/eve/README.md) —
  framework orientation
- [`docs/learnings/eve/issue-triage.md`](../../learnings/eve/issue-triage.md) —
  the issue-triage design (extended with `dev-agent-scope`)
- [`docs/learnings/eve/monorepo.md`](../../learnings/eve/monorepo.md) —
  agent-as-peer principle
- [`docs/learnings/eve/api.md`](../../learnings/eve/api.md) — slot
  reference for the `define*` imports used in this design
- [`docs/learnings/eve/runtime.md`](../../learnings/eve/runtime.md) —
  sessions, sandbox, channels, deploy story
- [`docs/learnings/eve/prior-art.md`](../../learnings/eve/prior-art.md) —
  patterns + anti-patterns referenced throughout
- [`CLAUDE.md`](../../../CLAUDE.md) — the constitution; the label
  taxonomy and "agents in this repo" section will live here
