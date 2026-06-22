# reviewer-agent — Feasibility Brief

> Pre-build feasibility scan for the first-pass mechanical reviewer.
> Peer of the [dev-agent](./dev-agent-feasibility.md). Applies the
> 15-section template defined in [`INDEX.md`](./INDEX.md). Status:
> **draft** (awaiting tech-lead review). Owner of build (if greenlit):
> `eve-expert`.

**Verdict:** `yes`
**Effort:** `s` (half a day) — read-only, no sandbox, no authored tools
that mutate state
**Depends on:** the dev-agent's GitHub App (shared); the label taxonomy
(for escalation pings); `CODEOWNERS` (for the escalation target)

---

## 1. Verdict

**`yes`.** The reviewer-agent is smaller, cheaper, and lower-risk than
the dev-agent. The duo pattern needs the reviewer for the dev-agent's
safety story to work. Build it before or in parallel with the
dev-agent.

The conditional in the dev-agent brief ("reviewer-agent ships first")
stands. This brief is the v1 prerequisite for the dev-agent.

## 2. The job

A first-pass mechanical reviewer of the dev-agent's PRs (and, in v1.5,
optionally human-authored PRs). Reads the linked issue, then the diff.
Posts a *comment* with a structured verdict — never a GitHub PR review
— that the human then uses to inform their actual review. The agent
does not approve, request changes via the API, merge, or close.

The value is reducing *unreviewed* PRs to near-zero: every PR has at
least *some* review (the agent's mechanical check), even when the
human review is delayed. The agent is a filter, not a replacement for
human review.

## 3. Trigger model

**Primary trigger — GitHub channel, `onPullRequest` filtered for the
dev-agent's PRs across three events:**

```ts
onPullRequest: (ctx, pr) => {
  const isDevBot = pr.user.login === "dev-bot";
  const isRelevantAction = ["opened", "synchronize", "ready_for_review"].includes(pr.action);
  const isNotDraft = !pr.draft;
  return isDevBot && isRelevantAction && isNotDraft ? { auth: defaultGitHubAuth(ctx) } : null;
};
```

Why three actions:

- **`opened`** — the dev-agent just opened a PR. First review.
- **`synchronize`** — the dev-agent pushed new commits in iteration
  (the v1.5 `@dev-agent` re-trigger path). Re-review the *full* diff,
  not just the new commits.
- **`ready_for_review`** — the dev-agent flipped the PR from draft to
  ready (after its self-check passed). First review of the actual
  intended-for-review diff.

Why filter on `!pr.draft`: the dev-agent opens PRs as *draft* by
default. Reviewer ignores drafts. When the agent flips to "ready for
review," the reviewer fires.

**v1.5 expansion:** add a label filter for human-authored PRs that
opt in (`reviewer-agent-eligible`). The same agent reviews them, with
the same post-as-comment posture.

**Not in v1:**
- Comments on the PR (the dev-agent doesn't author comments on its
  own PRs in v1)
- Review-comment replies (the dev-agent doesn't reply to review
  comments in v1; the human does)
- PR closed events (no action; the dev-agent's session-end hook handles it)

## 4. Directory shape

Standard eve layout, even smaller than the issue-triage agent. No
sandbox, no authored tools that mutate state — just a channel, a
connection, and a persona.

```text
reviewer-agent/                          # sibling of apps/, packages/, dev-agent/
├── agent/
│   ├── agent.ts                         # sonnet-mini or haiku
│   ├── instructions.md                  # persona, ~25 lines (shorter than the dev-agent's)
│   ├── channels/
│   │   └── github.ts                    # onPullRequest: opened | synchronize | ready_for_review
│   ├── connections/
│   │   └── github.ts                    # MCP, allowlist = read PR + post comment only
│   ├── tools/                           # see § 6 — three tools, all read-mostly
│   │   ├── read_pull_request_diff.ts
│   │   ├── read_issue.ts
│   │   └── post_review_comment.ts
│   ├── skills/                          # see § 7
│   │   ├── review-checklist/SKILL.md    # mechanical / scope / pattern / security
│   │   ├── escalation-routing/SKILL.md  # who to ping for what
│   │   └── verdict-vocabulary/SKILL.md  # distinct from the GitHub PR review API
│   └── instrumentation.ts
├── evals/                               # v2 — earned with the first regression
├── .env.example                         # GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
├── AGENTS.md                            # the "post comment, never review API" rule
├── ARCHITECTURE.md                      # mirrors the content-agent template's shape
└── package.json
```

The reviewer-agent is the *smallest* eve project in the fleet. That's
intentional — its value is in the prompt discipline, not the
infrastructure.

## 5. Channels + connections + safety boundaries

**Channel: GitHub (inbound) + GitHub MCP (outbound, read + comment
only).**

```ts
// agent/connections/github.ts — allowlist
tools: {
  allow: [
    // Read the PR
    "get_pull_request",
    "get_pull_request_files",
    "get_pull_request_comments",
    // Read the linked issue (the spec)
    "get_issue",
    "get_issue_comments",
    // Post the verdict (as a comment, not a review)
    "add_issue_comment",   // for commenting on the issue if escalation is needed
  ],
}

// What is NOT in the allow list:
//   submit_pull_request_review (the GitHub PR review API)
//   merge_pull_request, close_pull_request, update_pull_request
//   delete_*, lock_*
//   label_* (no label changes)
// The reviewer literally cannot approve via the API, cannot merge, cannot close.
```

**Critical:** the allowlist does **not** include
`submit_pull_request_review`. The reviewer can read the PR but cannot
post a GitHub review. Its only output is a comment. This is the
vocabulary-conflict fix from
[the process critique](./dev-agent-process-critique.md#51-the-reviewer-agent-and-the-github-pr-review-api-have-a-vocabulary-conflict).

**Sandbox: not needed.** The reviewer is a pure reader. No bash, no
filesystem, no spawn. Cheaper and simpler than the dev-agent.

## 6. Authored tools

Three tools. All read-mostly except `post_review_comment`.

| Tool | `needsApproval` | Why |
|---|---|---|
| `read_pull_request_diff` | `never` | Read-only. |
| `read_issue` | `never` | Read-only. |
| `post_review_comment` | `never` | Posts a structured comment. The "always gate" pattern doesn't apply — the *content* is what gates, not the act. The persona enforces the structured format. |

**`post_review_comment` is the only state-changing tool.** The persona
enforces that the comment body matches the structured verdict format
(see §8). If the model produces a malformed comment, the tool rejects
it and the persona retries.

For v1.5, the comment can also include the structured marker for
closed-loop iteration:

```md
<!-- dev-agent-iteration-requested -->
```

The dev-agent's v1.5 trigger scans for this marker. v1: humans
re-trigger. v1.5: the marker enables auto-re-trigger.

## 7. Skills

Three on-demand skills, each `SKILL.md` with concrete examples.

- **`review-checklist`** — what to check, in order. Four sections:
  mechanical (types, tests, lint inferred from CI status), scope
  (matches the linked issue? out-of-scope changes?), pattern
  (follows repo conventions?), light security (secrets in the diff?
  security-sensitive paths?). Each section has a pass/fail
  decision rule. The persona enforces checking all four.
- **`escalation-routing`** — who to ping when. The reviewer doesn't
  approve security-sensitive work; it escalates. The skill has a
  routing table: type of issue × who to ping (per `CODEOWNERS` for
  code-area routing, security team for `auth/`/`crypto/` paths,
  maintainers for architectural concerns).
- **`verdict-vocabulary`** — the structured comment format. The
  persona says "always use this format." The skill has the
  template, examples, and the three-state verdict semantics
  (looks-good-mechanically / blocking-issues-found / escalate).

## 8. Persona sketch

The standing rules. The full `instructions.md` is ~25 lines.

1. **Read the issue first, then the diff.** The issue is the spec; the
   diff is a candidate implementation. A diff that solves a different
   problem than the issue is wrong, regardless of code quality.
2. **Post a *comment* with a structured verdict section. Never use
   the GitHub PR review API.** The human does the actual GitHub
   review. Distinct artifacts, distinct vocabulary.
3. **Use the three-state verdict.** `looks-good-mechanically` (the
   diff is clean and scoped), `blocking-issues-found` (the diff has
   issues that must be fixed before merge), `escalate` (the diff
   needs human review of a kind the agent can't perform — security,
   architecture, design).
4. **Be conservative.** Request-changes on uncertainty. A false
   positive (request-changes on a fine PR) costs human time; a false
   negative (approve a bad PR) costs trust. Asymmetry favors
   blocking.
5. **Re-review the full diff on `synchronize`, not just the new
   commits.** A clean new commit on top of a broken previous commit
   is still broken.
6. **Never approve a PR whose author is yourself.** Defensive — matters
   if MCPs are ever shared between the dev-agent and the reviewer.
7. **No secrets in the comment.** The PR diff might contain a secret
   the agent redacted; the comment should not echo it back. If you
   must reference a line, use `path:line` only, never the content.
8. **If unsure, escalate.** Three-state verdict means "I don't know"
   is a valid choice. Use it.

The structured comment format (from the `verdict-vocabulary` skill):

```md
## Reviewer agent verdict

**Mechanical check:** [pass | fail]
**Scope check:** [matches issue | scope-creep-detected]
**Verdict:** [looks-good-mechanically | blocking-issues-found | escalate]

[free-form feedback with file:line references]

<!-- dev-agent-iteration-requested -->  (only when verdict = blocking-issues-found and v1.5)
```

## 9. Schedules

One root-only schedule.

**`reviewer-followup-sweep` — `0 9 * * 1` (weekly, Monday).** Find
PRs with a reviewer-agent verdict of `blocking-issues-found` AND no
dev-agent activity in the last 7 days. Post a follow-up comment
("`@maintainer, this PR has been waiting for dev-agent iteration
since [date]. Either re-engage the dev-agent or close with a
reason.`") and ping the maintainer on Slack.

This is the cost-control schedule for the *review* side. Without it,
PRs with blocking issues sit silently. With it, the team has a
weekly list of stalled PRs.

For v1, the schedule is the only nudge — no automatic close. The
human decides when a PR is dead.

## 10. Cost model

**Model:** sonnet-mini or haiku. The reviewer's task is more
mechanical than the dev-agent's: read diff, check rules, post
verdict. Cheaper model is correct.

**Per-PR estimate:**
- Average 1–2 turns per PR (read issue + diff, post verdict)
- ~10K tokens per turn (the diff is large)
- Sonnet-mini blended ~$3/M → ~$0.03/turn → ~$0.03–0.06/PR

**Sandbox cost: zero.** No sandbox.

**Monthly estimate (assuming 100–150 PRs/month, mirroring the
dev-agent's volume):**
- Reviewer-agent: 100–150 PRs × ~$0.05 = $5–8
- **Total: ~$5–10/month**

This is a rounding error against the dev-agent's $250–400/month. The
reviewer-agent is essentially free to run, and the value (filtering
unreviewed PRs) is high.

## 11. Risk register

| Concern | Mitigation |
|---|---|
| Reviewer approves a bad PR ("rubber-stamping") | Persona rule 4 (be conservative) + the three-state verdict (escalate is always an option) + persona rule 5 (re-review the full diff on synchronize) + OTel trace as the audit story |
| Reviewer requests-changes on a fine PR (false positive) | Cost-asymmetric — a few false positives are cheaper than a few false negatives. The human's GitHub review is the second filter. |
| Reviewer misses a security issue | The light security check in the `review-checklist` skill catches the obvious (secrets in diff, security-sensitive paths). Deeper security review → escalate. The persona: "if you see `auth/` or `secrets/` in the diff, escalate, don't review." |
| Reviewer's verdict vocabulary drifts from the format | The `verdict-vocabulary` skill is the source of truth. The persona says "always use this format." The `post_review_comment` tool rejects malformed comments and the persona retries. |
| Reviewer's `escalate` verdict doesn't reach the right human | The `escalation-routing` skill has a routing table. The persona enforces pinging. The schedule (`reviewer-followup-sweep`) catches escalations that don't get a human response. |
| Reviewer fires on human-authored PRs and the human is annoyed | v1: the trigger filters to dev-bot only. v1.5: human-authored PRs opt in via label (`reviewer-agent-eligible`). The reviewer never fires unsolicited on human PRs. |
| The reviewer's `synchronize` trigger fires too often | The dev-agent pushes commits in iteration; each push is a `synchronize` event. The reviewer fires on each. The cost is small (~$0.03/PR), so the volume is fine. If peak day shows 50+ synchronizes per PR, add a debounce. |
| The dev-agent ignores the reviewer's comments | Currently: human re-triggers the dev-agent. The reviewer's comment is a *comment*, not a tool call. For v1.5, the structured marker enables auto-re-trigger. The reviewer's value is in the *signal*, not the *enforcement*. |
| Drift between `escalation-routing` skill and the team's `CODEOWNERS` | Same mirror discipline as the label taxonomy: `CODEOWNERS` is the source of truth, the skill mirrors it. Drift in the same PR. |
| The reviewer's verdict is posted on a closed PR | The trigger filters to non-closed PRs. If a PR closes between the trigger and the comment post, the post fails gracefully and the session ends. |

## 12. v1 non-goals

Explicit out-of-scope for v1.

- **Approve authority.** No GitHub PR review API. No `approve` /
  `request_changes` / `comment` events. Only structured comments.
- **Merge authority.** The reviewer doesn't merge, period. The human
  does.
- **Auto-re-trigger of dev-agent.** v1 is open-loop. The structured
  marker is in the comment but v1.5 reads it.
- **Subagent delegation.** No subagents in v1.
- **Evals in v1.** Earned with the first regression.
- **Reviewing human-authored PRs.** v1 is dev-bot PRs only. v1.5
  expands via opt-in label.
- **Architectural review.** The reviewer is mechanical, not
  architectural. Architectural concerns → escalate.
- **Performance review.** The reviewer doesn't profile. Perf
  concerns → escalate or trust the team's existing perf tools.
- **Cross-repo work.** This agent only touches this repo.

## 13. Open questions

What needs the user's call before building.

1. **Sonnet-mini or haiku for the model?** *Sonnet-mini.* Haiku is
   cheaper but its review quality is uncertain for ~10K-token diffs.
   Sonnet-mini is the safer default; haiku is the v2 cost-pressure
   escape hatch.
2. **What label is applied on `escalate`?** *No label.* The
   escalation is in the comment (the `@maintainer` mention). Labels
   are for the dev-agent's state, not the reviewer's.
3. **What happens when the PR closes between trigger and comment?**
   *Session ends with a logged warning.* No retry. The reviewer is
   not the source of truth for closed-PR state.
4. **Should the reviewer ignore the PR's own checks (CI status) and
   re-derive the mechanical check from the diff?** *Trust CI status
   for the mechanical check.* The reviewer reads the CI status from
   the PR; the diff is for scope + pattern + light security. Don't
   re-run types/lint in the reviewer's head.
5. **Should the reviewer comment on the PR or on the linked issue?**
   *On the PR.* The PR is the artifact being reviewed. The issue is
   the spec. The comment goes where the human will look first.
6. **Should the v1.5 closed-loop marker be a HTML comment or a
   structured block?** *HTML comment.* It's invisible in the GitHub
   UI (the human doesn't see noise) and parseable by tools. Other
   options (a `<!-- dev-agent-iteration-requested -->` line, a
   custom GitHub Actions label) are more discoverable but noisier.
7. **Should the reviewer apply a `reviewed-by-bot` label?**
   *No.* The reviewer's comment is the artifact. A label is
   redundant; the human can see the comment thread.

## 14. Effort

`s` (half a day).

**Breakdown:**
- Agent code (channel, connection, three tools, persona, three skills): **2–3 hours.** Most of the work is "copy the issue-triage structure, swap the slot content."
- Verdict-vocabulary skill + escalation-routing skill: **1 hour.** The content is the value; the structure is the same as the dev-agent's skills.
- AGENTS.md + ARCHITECTURE.md: **30 min.** Required scaffolding.
- Local dev loop testing (`eve dev`, hand-drive a few PRs): **30 min.** The reviewer's path is simple (read diff, post comment) so iteration is fast.
- End-to-end testing with a real PR: **30 min.** The GitHub App setup is shared with the dev-agent.

**Total: ~5 hours / half a day.**

The reviewer-agent is the *cheapest* eve project in the fleet. The
effort is in the prompt discipline (the structured verdict format,
the conservative posture), not the infrastructure.

## 15. Depends on

- **`eve-expert` exists.** ✓
- **The label taxonomy is operational.** ✓ (`CLAUDE.md` § "Issue Labels".)
- **The dev-agent's GitHub App is created and installed.** The
  reviewer uses the same App. The App's permissions must include
  PR read + comment write. The App's webhook fires on `pull_request`
  events.
- **`CODEOWNERS` is populated.** The escalation-routing skill
  mirrors `CODEOWNERS` for code-area routing. Without
  `CODEOWNERS`, escalations don't have a destination.
- **The dev-agent's PR description includes a "Reviewer agent"**
  mention. *Nice to have, not a hard prerequisite.* If the
  dev-agent's PR description includes `@reviewer-bot please review`,
  the trigger is explicit. If not, the trigger fires on
  `pr.user.login === "dev-bot"` alone.

---

## Open meta-questions for tech-lead

Two things I'd surface back:

1. **The reviewer-agent and the dev-agent are now both specified.**
   The duo pattern is documented. Building them in either order
   works; the reviewer is the smaller, faster, lower-risk win. I'd
   build the reviewer first, prove the comment-as-verdict pattern,
   then build the dev-agent with the reviewer already running.
2. **The `verdict-vocabulary` skill is a small but load-bearing
   artifact.** It's the contract between the reviewer's output and
   the dev-agent's v1.5 trigger. If the vocabulary drifts (the
   reviewer uses a different verdict string), the closed-loop breaks
   silently. Worth treating as a public API: any change to the
   format is a versioned change with both agents updated in the
   same PR.

---

## Cross-references

- [`dev-agent-feasibility.md`](./dev-agent-feasibility.md) — the peer agent
- [`dev-agent-process-critique.md`](./dev-agent-process-critique.md) — the
  critique that surfaced the distinct-vocabulary, three-state-verdict,
  and structured-marker fixes this brief applies
- [`INDEX.md`](./INDEX.md) — comparison table across all candidate agents
- [`docs/learnings/eve/api.md`](../../learnings/eve/api.md) — slot reference
- [`docs/learnings/eve/issue-triage.md`](../../learnings/eve/issue-triage.md) —
  the issue-triage design (GitHub channel pattern reference)
