# dev-agent — Feasibility Brief

> Pre-build feasibility scan for a quasi-autonomous dev agent. Applies the
> 15-section template defined in [`INDEX.md`](./INDEX.md). Status: **draft**
> (awaiting tech-lead review). Owner of build (if greenlit): `eve-expert`.

**Verdict:** `yes-with-conditions`
**Effort:** `l` (a week or more for v1)
**Depends on:** reviewer-agent feasibility brief lands first; issue-triage
agent pattern is a useful reference but not a hard prerequisite.

---

## 1. Verdict

**`yes-with-conditions`.** Build it, but the conditions matter:

1. The **complexity-opinion mechanism** (refuse-before-code) must be in v1.
   Without it, the agent overreaches and erodes trust fast.
2. The **reviewer-agent** ships first or in parallel. The dev-agent without
   a reviewer is a pair-programmer with no peer review — the iteration
   loop degrades into "human reviews every PR," which defeats the point.
3. **Open-loop iteration in v1.** The dev agent opens a PR and stops. A
   human re-triggers it (via re-assign or `@dev-agent` mention) on
   review-requested changes. Closed-loop iteration is a v2 consideration.
4. **No merge authority, ever.** The agent opens PRs. Humans merge. This
   is the single most important safety property.

If any of these conditions are dropped, the verdict flips to `defer`.

## 2. The job

A long-running dev agent that picks up GitHub issues assigned to it,
assesses their complexity, refuses the hard ones with a clear comment,
accepts the mechanical and scope-bounded ones, writes a focused diff on a
feature branch, opens a PR, and stops. A separate reviewer-agent handles
first-pass review. The dev-agent does not merge.

The "quasi-autonomous" framing is deliberate: the agent does mechanical
work, parks on design questions, and a human reviews every PR. The
consequential decisions (design, merge) stay with humans. The mechanical
work (write code, run tests, open PR) goes to the agent.

## 3. Trigger model

**Primary trigger — GitHub channel, `onIssue` filtered for `assigned` action:**

```ts
onIssue: (ctx, issue) =>
  issue.action === "assigned" &&
  issue.assignees.some((a) => a.login === "dev-bot")
    ? { auth: defaultGitHubAuth(ctx) }
    : null
```

A session is created per assigned issue. The session runs to completion
(opens a PR or posts a refusal comment) and ends. No re-trigger on
comments, no re-trigger on label changes.

**v1.5 trigger — `onIssueComment` filtered for `@dev-agent` mention.** This
is the open-loop iteration channel: a human reads the reviewer's
comments, then `@dev-agent fix the review feedback` to re-engage the
agent on the same issue. The session is keyed to the issue, not the
trigger, so the agent has full context from the previous turn.

**Not in v1:**
- `@dev-agent` on PR comments (the dev agent doesn't review; that's the reviewer's job)
- Re-trigger on label changes
- Re-trigger on commit pushes to the branch (the agent wrote the branch; new commits = new turns within the same session, not new sessions)

## 4. Directory shape

Standard eve layout, sibling at the repo root. Mirrors the issue-triage
shape; deviations are flagged inline.

```text
dev-agent/                              # sibling of apps/, packages/
├── agent/
│   ├── agent.ts                        # sonnet, evals-ready
│   ├── instructions.md                 # persona, ~40 lines (longer than triage — see § 8)
│   ├── channels/
│   │   └── github.ts                   # onIssue: assigned; v1.5 onIssueComment
│   ├── connections/
│   │   └── github.ts                   # MCP, allowlist scoped tight (see § 5)
│   ├── sandbox.ts                      # node24 + pnpm + the monorepo bootstrap
│   ├── sandbox/workspace/
│   │   └── .eve/
│   │       └── seed.sh                 # clones the repo into /workspace at session start
│   ├── tools/                          # see § 6
│   │   ├── run_tests.ts
│   │   ├── commit_changes.ts
│   │   ├── push_branch.ts
│   │   ├── open_pull_request.ts
│   │   ├── refuse_task.ts
│   │   └── wait_for_human.ts
│   ├── skills/                         # see § 7
│   │   ├── repo-conventions/SKILL.md
│   │   ├── testing-patterns/SKILL.md
│   │   ├── diff-discipline/SKILL.md
│   │   ├── when-to-park/SKILL.md
│   │   └── complexity-assessment/SKILL.md
│   ├── schedules/
│   │   └── parked-session-sweep.ts     # cron: 0 9 * * * — sessions parked >3 days
│   ├── lib/                            # import-only shared helpers (test runners, git helpers)
│   └── instrumentation.ts              # OTel + AI SDK span config
├── evals/                              # v2 — earned with the first regression
├── .env.example                        # GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, REPO_URL
├── AGENTS.md                           # the "read docs/learnings/eve/ first" note + the "never merge" rule
├── ARCHITECTURE.md                     # mirrors the content-agent template's 11-section shape
└── package.json
```

**Deviation from issue-triage shape:** the dev-agent has a non-trivial
sandbox (the issue-triage agent overrides `turn.started` to *skip* the
sandbox entirely). The dev-agent needs the sandbox; the cost is real.

## 5. Channels + connections + safety boundaries

**Channel: GitHub (inbound) + GitHub MCP (outbound).** Same shape as the
issue-triage agent. The MCP allowlist is the load-bearing safety
control — everything destructive is blocked at the protocol layer,
before any approval gate.

```ts
// agent/connections/github.ts — allowlist
tools: {
  allow: [
    // Read the issue context
    "get_issue",
    "get_issue_comments",
    "list_issues",
    "search_issues",
    // Read PR state (for the v1.5 iteration loop)
    "get_pull_request",
    "get_pull_request_files",
    "get_pull_request_comments",
    // Create the PR
    "create_pull_request",
    "update_pull_request",   // for pushing new commits / changing description
    "create_branch",
    "push_files",
    // Communicate on the issue
    "add_issue_comment",
  ],
}

// What is NOT in the allow list:
//   merge_pull_request, close_pull_request, close_issue, delete_*, push_to_main
//   update_issue (state changes), lock_issue, label_*
// The agent literally cannot merge, close-as-completed, or push to main.
```

**Note on labels:** the agent cannot apply labels via the MCP. Label
changes go through authored tools if needed (and probably aren't needed
in v1 — the issue already has `status: ready` from triage, and the PR is
the agent's only output). If v1.5 needs the agent to apply a `wip` or
`needs-review` label, that's a narrow `apply_label` tool with
`needsApproval: never`.

**Sandbox network policy: `deny-all` by default** in `onSession`. The
agent can read the repo, write files, run tests. It cannot reach
arbitrary URLs. The `bootstrap` step that clones the repo runs in the
factory (with `allow-all`), then `onSession` locks down. See
[`runtime.md`](../../learnings/eve/runtime.md) § 2 for the pattern.

## 6. Authored tools

Six tools, each with a clear purpose and an explicit `needsApproval`
posture.

| Tool | `needsApproval` | Why |
|---|---|---|
| `run_tests` | `never` | The test loop is mechanical; gating it kills the TDD discipline. |
| `commit_changes` | `once` per session | First commit needs human eyes (the agent's intent is visible); subsequent commits are predictable. |
| `push_branch` | `never` for feature branches | Branch is feature-only; main is not in the allow list at the MCP layer. |
| `open_pull_request` | `always` | The PR is the artifact; human review starts here. Always gate. |
| `refuse_task` | `never` | Refusal is a no-op outcome; no need to gate it. The post-and-exit is the safety. |
| `wait_for_human` | `always` | The universal "I have a question" gate. Session parks until reply. |

**`refuse_task` is the key v1 addition.** The tool:
- Takes `{ reason: string, unblockers?: string[] }`
- Posts a comment on the issue with the reason and the unblockers
- Optionally applies `status: needs-human` label (if v1.5 enables it)
- Ends the session

The persona enforces calling `refuse_task` early — *before* any code
work — when the complexity assessment says "too hard."

## 7. Skills

Five on-demand skills, each `SKILL.md` plus optional `references/`.

- **`repo-conventions`** — how this repo is laid out: directory structure,
  package boundaries, naming conventions, where to find things. Mirrors
  `CLAUDE.md`. The agent reads it before touching any file.
- **`testing-patterns`** — how tests are structured in this repo: which
  test framework, where tests live, how to run them, the fixture
  patterns. The agent reads it before writing the first test.
- **`diff-discipline`** — the "small PRs, one concern, tests included"
  rules. Loaded before committing. The persona enforces scope; the
  skill teaches the patterns.
- **`when-to-park`** — the decision tree for "should I use `wait_for_human`
  or just guess?" Loaded whenever the agent hits a design question.
  Default to parking. Default to refusing.
- **`complexity-assessment`** — the heuristic checklist for the upfront
  refuse-or-accept decision. Loaded at session start. Includes the
  floor (refuse if: design decisions, ambiguous acceptance, security,
  cross-cutting >5 files, no test surface) and the LLM-judgment
  guidance for the rest.

## 8. Persona sketch

The standing rules in 5–10 bullets. The full `instructions.md` is
~40 lines (longer than the issue-triage agent's 28, because the
disciplines are more numerous and the blast radius is higher).

1. **Assess before acting.** On session start, before any code work,
   post a comment on the issue with your complexity assessment in
   1–2 sentences and your accept/refuse decision. If refusing, call
   `refuse_task` and end the session.
2. **Refuse the hard ones.** Refuse if the task requires design
   decisions, has ambiguous acceptance criteria, is security-sensitive,
   crosses >5 files, or has no clear test surface. The refusal is a
   useful signal, not a failure.
3. **TDD: test first.** Write a failing test that captures the
   acceptance criteria. Then write the code that makes it pass. Then
   run the full test suite. Then commit. Then push. Then open the PR.
4. **Park on design questions.** If you hit a design question
   mid-work, use `wait_for_human`. Don't guess. A 4-hour pause for a
   human answer beats a 30-minute guess that produces a wrong PR.
5. **Re-refuse mid-work.** If you realize mid-implementation that the
   task is too complex, stop, post a refusal comment explaining what
   you found, end the session. Half-done is worse than refused.
6. **Stay in scope.** Never change files outside the issue's scope.
   If the task requires touching shared infrastructure, refuse instead.
7. **No merge, no main.** Never push to main. Never merge. Open PRs;
   humans merge. This is not negotiable.
8. **No secrets in the diff.** Don't read, echo, or commit secrets,
   tokens, or env values. If a file contains them and you must touch
   it, redact before the model sees the return value (`toModelOutput`).
9. **Test the test.** Before opening the PR, run the full test suite
   locally. If the test you wrote passes but the full suite breaks,
   that's a scope problem — stop, reassess, possibly refuse.

## 9. Schedules

Two root-only schedules.

**`parked-session-sweep` — `0 9 * * *`.** Sessions that called
`wait_for_human` >3 days ago and haven't been resumed get a follow-up
comment on the issue ("@maintainer, this session is still parked.
Either answer the agent's question or close the issue with a reason.").
This prevents sessions from accumulating as silent cost sinks.

**`stale-pr-sweep` — `0 9 * * 1` (weekly, Monday).** PRs opened by the
agent >7 days without a review get a comment ("@maintainer, this PR
has been waiting for review. Either review or close with a reason.").
Different cadence because human review is the bottleneck, not the
agent's own work.

The `parked-session-sweep` is the load-bearing one — it's the cost
control. The `stale-pr-sweep` is nice-to-have, can be deferred to v1.5.

## 10. Cost model

**Models:** Sonnet for the dev-agent (the work is non-trivial),
sonnet-mini or haiku for the reviewer-agent (the work is mechanical).

**Per-issue estimate (dev-agent):**
- Average 30–50 turns per issue (plan, write test, iterate, write code, iterate, run tests, commit, push, open PR)
- ~5K tokens per turn mixed (3K input + 2K output, with tool use)
- Sonnet blended ~$10/M tokens → ~$0.05/turn → ~$1.50–2.50/issue

**Per-PR estimate (reviewer-agent):**
- Average 1–2 turns per PR (read diff, post review)
- ~10K tokens per turn (the diff is large)
- Sonnet-mini blended ~$3/M → ~$0.03/turn → ~$0.03–0.06/PR

**Sandbox cost (Vercel Sandbox, ~$0.10/hour):**
- Dev-agent sessions: 1–4 hours active, plus parked-but-suspended (no compute, but the slot reservation is real on hosted backends)
- Realistic average: ~$0.20–0.50 per session for active compute
- Parked sessions still incur some cost depending on backend; the
  parked-sweep is the bound

**Monthly estimate (baseline = 3–5 issues/day):**
- Dev-agent: 100–150 issues × ~$2 = $200–300
- Reviewer-agent: 100–150 PRs × ~$0.05 = $5–8
- Sandbox: 100–150 sessions × ~$0.30 = $30–45
- **Total baseline: ~$250–400/month**

**Peak (10–15 issues/day, the "Monday morning" scenario):**
- Could double the dev-agent cost and ~1.5x the sandbox cost
- **Peak: ~$500–800/month**

This is a real number. Flag in the budget conversation. The
`parked-session-sweep` is the cost-control lever; aggressive use of
`refuse_task` (which ends the session before any sandbox work) is the
biggest single cost saver.

## 11. Risk register

| Concern | Mitigation |
|---|---|
| Agent overreaches (writes code beyond the issue's scope) | Persona rule 6 ("stay in scope") + reviewer-agent catches at review time + max-PR-size check in the persona |
| Agent's complexity assessment is wrong (accepts a hard task) | Reviewer-agent's conservative posture (request-changes on uncertainty) + max-iteration cap on closed-loop + human final review |
| Agent makes bad refactors that pass tests | Reviewer-agent's "would I merge this?" check + persona rule 9 (test the test) + OTel trace as the audit story |
| Agent exfiltrates secrets via network | `networkPolicy: "deny-all"` on `onSession` + secret-redaction in `toModelOutput` + persona rule 8 |
| Agent's session crashes mid-work | Interrupted steps re-run (eve semantics) + idempotent commit pattern (commit messages include the session id, so re-runs are deduped) |
| Cost overrun from long-running sessions | `parked-session-sweep` (3-day ping, then close) + `refuse_task` ends session before any sandbox work + per-session duration cap (suggested: 8 hours active) |
| Agent pushes to main | MCP allowlist doesn't include main-branch operations; protocol-layer block, not policy |
| Agent merges its own PR | MCP allowlist doesn't include `merge_pull_request`; protocol-layer block |
| Drift between the dev-agent's `repo-conventions` skill and the actual repo | Mirror discipline (same as the label taxonomy) — `CLAUDE.md` and the skill drift together in the same PR; `AGENTS.md` enforces |
| The reviewer-agent is a peer; what if the dev-agent prompts the reviewer to approve? | The reviewer-agent's persona enforces "never approve a PR whose author is yourself" + the MCP filter on the reviewer excludes dev-bot's PRs by default (or the filter is on the trigger, not the agent) |
| Label drift: agent invents a `status: dev-in-progress` label | Persona: "apply only labels defined in the triage ruleset" + same `label-conventions` skill as the triage agent |
| The agent gets stuck in a loop (refuse → re-assign → refuse → re-assign) | Max-iteration counter in `defineState`; after 3 refuses, escalate to `@maintainer` and end the session |

## 12. v1 non-goals

Explicit out-of-scope for v1. Each is a v2+ candidate with a real reason
to defer.

- **Closed-loop iteration.** v1 is open-loop — human re-triggers via
  `@dev-agent` mention. Closed-loop (reviewer auto-re-triggers) is a
  v2 consideration with a max-iteration cap.
- **Self-merge authority.** No merge, period. Even with reviewer
  approval, the human merges.
- **Multi-issue concurrency.** One issue per session, but multiple
  sessions can run in parallel (each gets its own sandbox). "One agent,
  many sessions" is the natural model.
- **Auto-approve by the reviewer.** The reviewer comments; it does not
  approve. Approve is the human's call. (Could be loosened in v2 if
  trust builds.)
- **Subagent delegation.** No subagents in v1. The persona carries
  the work; subagents earn their place when the `instructions.md`
  starts to feel like multiple personas stitched together.
- **Evals in v1.** The PR-triage reference ships without them; same
  call here. Add evals when the first regression would have been
  caught by one.
- **Sandbox write to main branch.** Blocked at the MCP layer.
- **Cross-repo work.** This agent only touches this repo.
- **`apply_label` tool.** v1 has no label-application need. Add in v1.5
  if `status: needs-human` from `refuse_task` becomes useful.
- **Re-trigger on push events to the branch.** Commits to the branch
  are new turns within the existing session, not new sessions.

## 13. Open questions

What needs the user's call before building. Bold is my recommendation.

1. **Open loop vs. closed loop in v1.** *Open loop.* Closed loop needs a
   max-iteration cap and a human escalation gate; not worth the design
   cost for v1.
2. **What label does the refusal apply?** *`status: needs-human`.* Mirrors
   the existing label taxonomy; clear signal to maintainers.
3. **How long can a session park before the sweep cleans it up?**
   *3 days ping, 7 days close.* Same cadence as the stale-issue sweep
   in the issue-triage design.
4. **What model for the reviewer-agent?** *Sonnet-mini.* The work is
   mechanical (read diff, check rules, post verdict). Cheaper than the
   dev-agent's sonnet, more capable than haiku.
5. **Where does the test command live?** *In the bootstrap script and
   the `testing-patterns` skill.* The agent reads the skill, runs the
   command, reports the output. No new config surface.
6. **How is the agent installed on the repo?** *Same GitHub App as the
   issue-triage agent.* Reusing the App means one set of credentials,
   one webhook, one install. Different agent projects can share an App
   if their triggers and filters are disjoint.
7. **Per-session duration cap?** *8 hours active.* After 8 hours, force
   a "ready for review" gate — the agent opens whatever PR it has,
   even if incomplete, and ends the session. Prevents runaway cost.
8. **What happens when the agent's PR is closed without merge?** *No
   automatic re-trigger.* A human re-assigns or reopens. Closing the
   PR is a strong signal that the work isn't wanted in that shape.
9. **What label does the reviewer-agent apply on its verdict?**
   *No label.* The reviewer comments on the PR; the existing GitHub
   review UI surfaces the verdict. Labeling is the human's call.
10. **Concurrency cap?** *No cap in v1.* The cost is the bound, not a
    cap. If peak day shows we need a cap, add it.

## 14. Effort

`l` (a week or more) for v1.

**Breakdown:**
- Sandbox bootstrap (node24, pnpm, monorepo install, repo clone strategy): **2–3 days.** This is the load-bearing piece; the agent code is small but the runtime setup is real.
- Agent code (tools, skills, persona, channel, connection): **1–2 days.** Most of the work is "copy the issue-triage structure, swap the slot content."
- Schedules (parked-sweep, stale-PR-sweep): **0.5 day.** Small.
- AGENTS.md + ARCHITECTURE.md: **0.5 day.** Required scaffolding; mirrors the issue-triage docs.
- Testing the local dev loop (`eve dev`, hand-drive a few issues): **1 day.** The local experience is the fastest way to find persona bugs.
- End-to-end testing against a staging repo: **1 day.** GitHub App setup, webhook delivery, real PR creation.
- Buffer for persona iteration: **1 day.** The complexity-assessment heuristic and the refusal framing will need iteration based on real issues.

The 2–3 day sandbox bootstrap is the single biggest unknown. If the
monorepo's install hooks are simple, it's 1 day. If they pull Docker
images or compile native modules, it's 3+.

## 15. Depends on

- **`eve-expert` exists.** ✓ (Just created.)
- **The label taxonomy is operational.** ✓ (`CLAUDE.md` § "Issue Labels" defines it.)
- **The reviewer-agent feasibility brief lands first.** Open question for the user; my recommendation is yes, because the duo pattern is easier to vet when the smaller half is specified first.
- **The issue-triage agent is in production** — *useful reference, not a hard prerequisite.* The dev-agent's GitHub App, label-conventions skill, and monorepo integration patterns can all be lifted from the issue-triage design. But the dev-agent can be built first if the issue-triage work is delayed; the dev-agent just becomes the first deployed agent instead of the second.
- **A real test command for this repo** — the agent runs `pnpm test` (or whatever). The bootstrap script needs to know.

---

## Open meta-questions for tech-lead

Two things I'd surface back, separate from the brief itself:

1. **The brief format itself worked well here.** Should we lock the
   15-section template as the eve-expert's standing output? It produced
   a decisive verdict and forced the design questions to be answered
   *before* code, which is the whole point of the format.
2. **The duo pattern (dev-agent + reviewer-agent) needs its own brief
   to land before this one is greenlit.** The dev-agent's safety
   story depends on the reviewer-agent's existence; vetting them
   together is a single decision, not two.
