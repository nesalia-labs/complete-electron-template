# `eve` — Issue-Triage Agent (Designed)

> The full design for a GitHub issue-triage agent built on `eve`, grounded
> in the prior art in `prior-art.md` and corrected for the differences
> between PR triage and issue triage. **No code** — design and structure
> only. When we build it, the directory layout and the ruleset below are
> the plan.

This is the agent we explored in our initial `eve` evaluation. It is
**strong fit, not a thought experiment** — the shape is taken almost
verbatim from `vercel-labs/eve-pr-triage-agent-template`, with the ruleset
and the persona swapped to issue triage.

---

## 1. The job

The agent receives a GitHub issue. It must:

1. Read the issue body and existing comments.
2. Look at the repo context (recent issues, labels, conventions, CODEOWNERS).
3. Classify: `type:*` (`bug`, `feature`, `docs`, `question`, `security`),
   `status: ready` / `needs-info` / `blocked`, `priority: p0`–`p3`,
   `effort: xs`–`l` (when inferable).
4. Detect duplicates against the open-issue set.
5. Apply labels (the channel-provided `apply_labels` tool).
6. Post a triage comment when the user benefits from one (missing repro,
   unclear scope, security-shaped, etc.).
7. Suggest an owner via `@`-mention.
8. Escalate to a human for ambiguous, security, or p0 cases.
9. Park (durably suspend) on the human's reply.

The **risk asymmetry** drives the design:

- False negative (miss a security issue) = disaster
- False positive (escalate a normal issue to security) = some human time
- False negative (close a duplicate as not-a-duplicate) = two issues get
  worked
- False positive (mark as duplicate when it isn't) = developer
  frustration, lost work

The right default: **err on the side of escalation.** Cheap actions
(read, search, label-draft) are free; expensive/destructive actions
(close, label, comment-publish, assign) are gated.

---

## 2. The directory shape

Forked almost verbatim from the PR-triage reference. The 80% that's
identical is the loader, the channel, the deploy story, the auth model.
The 20% that's different is the persona, the ruleset, the skills, and
the trigger.

```text
triage-agent/
├── agent/
│   ├── agent.ts                          # defineAgent — Sonnet, evals-ready
│   ├── instructions.md                   # ~30 lines — the persona, defers to skills
│   ├── channels/
│   │   └── github.ts                     # githubChannel({ onIssue: ... , events: { "turn.started": skip-sandbox } })
│   ├── connections/
│   │   └── github.ts                     # MCP — block everything except the issue operations
│   ├── tools/                            # zero — channel + connection provide them
│   ├── skills/
│   │   ├── triage/SKILL.md               # the procedure
│   │   ├── label-conventions/SKILL.md    # mirrors the CLAUDE.md taxonomy
│   │   ├── escalation-policy/SKILL.md    # when to escalate, to whom
│   │   ├── duplicate-detection/SKILL.md  # how to weigh title/author/timestamps
│   │   └── response-templates/SKILL.md   # the comment shapes
│   ├── subagents/                        # v2 — only when skills stop fitting
│   │   └── (deferred)
│   ├── schedules/
│   │   ├── stale-sweep.ts                # cron: 0 9 * * * — ping 7d-stale issues
│   │   └── unprocessed-queue.ts          # cron: */15 * * * * — issues with no status: triage
│   ├── lib/                              # import-only shared code
│   ├── hooks/
│   │   └── command-dispatch.ts           # `@triage-bot label foo` etc. (v1.5)
│   └── instrumentation.ts                # OTel + AI SDK span config (root-only)
├── evals/                                # v1.5 — earn them with the first regression
│   ├── evals.config.ts
│   ├── well-formed-bug.eval.ts
│   ├── security-escalation.eval.ts
│   └── ambiguous-parked.eval.ts
├── triage.yml                            # the policy — labels, risk, routing
├── .env.example                          # GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
├── ARCHITECTURE.md                       # mirrors the content template's pattern
├── AGENTS.md                             # the "read node_modules/eve/docs first" note
└── package.json
```

Compared to the PR-triage reference, the differences are:

- `onIssue` instead of `onPullRequest`
- **No auto-injected diff** — issues don't have a diff. The agent has to
  call `get_issue`, `list_issue_comments`, etc. via the MCP connection.
- **No re-triage on push is even more important for issues** — issues
  don't get a "diff update" but they get comments, which can change
  classification. Ship without; add `onIssueComment` later as a v1.5
  trigger (this is also where the command surface slots in).
- **Add the `@triage-bot` command surface** (the Rust triagebot lesson) —
  the comment trigger handles `@triage-bot label foo`, `@triage-bot
  assign @user`, `@triage-bot retriage`, etc.
- **Add scheduled sweeps** — stale-issues ping, unprocessed-queue
  re-triage. The PR reference doesn't have schedules; the issue shape
  earns them.
- **The MCP connection's `tools: { allow: [...] }` is the load-bearing
  safety control**, not just a nicety. The agent only sees the issue
  operations it needs; destructive operations (`delete_issue`,
  `update_issue` to set state) are blocked at the MCP layer.

---

## 3. The `triage.yml` ruleset

The shape is identical to the PR reference, but the label catalog is
ours, the risk signals are about user impact (not code change risk),
and the routing is by path/area (not file path).

```yaml
# triage.yml — the issue triage ruleset. Baked in at build time.
#
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Editing this file has NO effect on a running deployment until you rebuild │
# │ and redeploy (`eve build` → `vercel deploy`).                              │
# └───────────────────────────────────────────────────────────────────────────┘

labels:
  # type:*
  - name: "type: bug"
    description: "Defect, regression, or unintended behavior."
  - name: "type: feature"
    description: "New user-facing capability."
  - name: "type: docs"
    description: "Documentation, README, code comments only."
  - name: "type: question"
    description: "User is asking, not filing."
  - name: "type: security"
    description: "Suspected security issue. Always escalates."

  # status:*
  - name: "status: triage"
    description: "New issue, awaiting first triage pass."
  - name: "status: needs-info"
    description: "Awaiting more information from the author."
  - name: "status: ready"
    description: "Triaged and ready to be picked up."
  - name: "status: blocked"
    description: "Blocked on a dependency or decision."

  # priority:*
  - name: "priority: p0"
    description: "Critical. Stop everything."
  - name: "priority: p1"
    description: "High. Required for the current release."
  - name: "priority: p2"
    description: "Medium. Normal priority."
  - name: "priority: p3"
    description: "Low. Nice to have."

  # effort:*
  - name: "effort: xs"
    description: "Few minutes."
  - name: "effort: s"
    description: "Half a day."
  - name: "effort: m"
    description: "1-2 days."
  - name: "effort: l"
    description: "A week or more — needs breakdown."

risk:
  levels: [low, medium, high, critical]
  signals:
    critical:
      - "Type: security OR explicit security keywords (auth bypass, RCE, XSS, SQLi, secrets leak, supply chain)."
      - "Data loss or corruption reports."
      - "Outage or production-down."
    high:
      - "Production-affecting bug with no workaround."
      - "Regression in a recently-shipped change."
      - "Compliance / regulatory impact."
    medium:
      - "Bug with a workaround."
      - "Feature request from a paying customer with a clear use case."
    low:
      - "Documentation typo or clarification."
      - "Nice-to-have enhancement with no current stakeholder."

# Routing is by area (not file path). The agent can't know your team's
# handles, so this ships EMPTY. The first comment on your repo is clean
# rather than suggesting teams that don't exist.
#
# To enable, uncomment and edit. `suggest` takes GitHub @handles.
#
# routing:
#   - area: "auth, login, sessions"
#     suggest: ["@your-org/security"]
#   - area: "ci, deploy, build"
#     suggest: ["@your-org/platform"]
#   - area: "ui, css, theming"
#     suggest: ["@your-org/frontend"]
```

This file mirrors the label taxonomy defined in `CLAUDE.md` § "Issue
Labels." The persona discipline: the agent reads this file, never
invents labels, and applies a label only when its definition fits.

---

## 4. The channel

The GitHub channel is the only entry point. The structure mirrors the
PR reference, with `onIssue` instead of `onPullRequest`, and an override
on `turn.started` to skip the default sandbox checkout (issues don't
have a diff to inject, and the agent never needs the repo on disk).

```ts
// agent/channels/github.ts
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

export default githubChannel({
  onIssue: (ctx, issue) =>
    issue.action === "opened" ? { auth: defaultGitHubAuth(ctx) } : null,
  events: {
    "turn.started": async (_data, channel) => {
      // Skip the default's sandbox checkout (unused for read-only triage).
      // The reaction no-ops on an opened issue (no triggering comment) but
      // acks comment/@mention turns.
      try { await channel.thread.react("eyes"); } catch {}
    },
  },
});
```

Three things this channel does:

1. **Filters events** — `onIssue` returns `null` for non-opened actions
   (`closed`, `reopened`, `labeled`, etc.). The agent only reacts to
   new issues. v1.5 will add an `onIssueComment` filter for the command
   surface.
2. **Verifies the webhook signature** — `x-hub-signature-256` against
   `GITHUB_WEBHOOK_SECRET`. Unsigned requests are rejected.
3. **Overrides `turn.started`** to skip the default's sandbox checkout
   — pure cost for a read-only agent.

`defaultGitHubAuth(ctx)` derives the session auth from the webhook
payload and stamps `auth.attributes` with the repo, issue number, and
installation id. The MCP connection's tools read these attributes to
scope their calls.

---

## 5. The persona (`agent/instructions.md`)

The PR-triage reference's 28-line persona, adapted to issue triage. The
shape is the same: identity, how you work, standing rules.

```md
# Identity
You are a GitHub issue triage agent. You run automatically when a new
issue is opened. Your job: classify, label, and post a single excellent
triage comment. The comment is your core value — labels are a best-effort
extra, so make the comment stand on its own.

You are reached only through the GitHub channel. The issue body and
existing comments are already in your context when you start — you
never fetch them again.

# How you work

When a new issue opens, follow the **triage** skill: it holds the
procedure and this repository's triage ruleset (labels, risk signals,
routing). Load it before you act.

If the issue touches a specific area (auth, CI, UI, etc.), also load
the relevant skill — **label-conventions** is always relevant;
**escalation-policy** loads when risk is medium or higher;
**duplicate-detection** loads when the issue title or body suggests
a known pattern; **response-templates** loads before posting a comment.

Your final message is posted verbatim as a comment on the issue. Write
it as the comment you want maintainers to read — nothing else, no
preamble, no narration.

# Standing rules

- **Apply labels only with the `apply_labels` tool**, and only labels
 defined in the triage ruleset. Never invent labels.
- **Apply a label only when its definition genuinely fits.** If no
 label fits, apply none and skip the tool — an issue with no label
 is fine, the comment still carries the triage. Never stretch an
 issue to the nearest label.
- **One comment per issue.** Your single final message is the entire
 triage. (If you have nothing to say, say nothing — don't post an
 empty comment.)
- **Be conservative.** Apply a label only when the evidence clearly
 supports it. When a call is genuinely uncertain, say so in the
 summary rather than guessing.
- **Escalate when uncertain.** Security keywords → always escalate.
 Ambiguous classification → ask, don't guess. The cost asymmetry
 favors escalation.
- **Never** echo secrets, tokens, or environment values.
```

The model is **Sonnet** for the default workload. Drop to Haiku under
cost pressure; reserve Opus for one-shot deep analysis (v2).

---

## 6. The skills (loaded on demand)

The five skills, each with a `SKILL.md` and (where needed) a
`references/` subtree.

### `skills/triage/SKILL.md` — the procedure

The procedure itself. Steps:

1. Read the issue body and existing comments (already in context).
2. Detect: security-shaped? duplicate? clear classification? ambiguous?
3. Decide which labels fit, consulting `label-conventions` if needed.
4. If the issue is ambiguous or security-shaped, load `escalation-policy`.
5. If a duplicate is plausible, load `duplicate-detection`.
6. Decide whether to post a comment; if yes, load `response-templates`.
7. Apply labels with `apply_labels`. The MCP connection's `tools: {
   allow: [...] }` ensures only the allowed tools are reachable.
8. Post the comment with `add_issue_comment` if the model has
   something to say.
9. Suggest a routing `@`-mention in the comment body.
10. For ambiguous or high-risk issues, the comment ends with a
    `needs-approval` request to a human.

### `skills/label-conventions/SKILL.md`

Mirrors `CLAUDE.md` § "Issue Labels" verbatim. Two reasons:

1. **Single source of truth.** The label catalog lives in
   `CLAUDE.md`; the skill is a copy the model reads at triage time.
   Drift between the two is a real risk — sync them in the same PR.
2. **Routing hint.** The `description:` frontmatter says "Load before
   applying any label" — the model uses it to decide when to pull.

### `skills/escalation-policy/SKILL.md`

The escalation matrix. When to ping, who to ping, what to say.

- `type: security` → page `@your-org/security` and `@your-org/oncall`
- `priority: p0` → page `@your-org/oncall`
- `priority: p1` → mention `@your-org/leadership` after 24h
- Ambiguous classification → request `needs-info` from the author

### `skills/duplicate-detection/SKILL.md`

How to weigh the candidates returned by `search_issues`. Title
similarity is necessary but not sufficient; weight by author, by
recency, by area. The decision tree:

- Same author + same area + same week → likely duplicate
- Same area + similar title + different author → possible duplicate
- Different area + similar title → probably not a duplicate

### `skills/response-templates/SKILL.md`

The comment shapes. Five templates:

- **Repro-needed** — issue is a bug but lacks steps to reproduce
- **Info-needed** — issue is too ambiguous to classify
- **Security-paged** — security-shaped, escalated
- **Duplicate** — closes-as-duplicate with a link (after human approval)
- **Wontfix** — declined with a reason (after human approval)

Each template is a short Markdown body. The model fills in the
issue-specific details; the template provides the structure.

---

## 7. The connection — the safety boundary

The GitHub MCP connection is the **single most important safety
control** in the agent. The `tools: { allow: [...] }` filter
constrains what the model can do at the protocol layer, before any
approval gate.

```ts
// agent/connections/github.ts
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.github.com/sse",
  description: "GitHub: read issues, apply labels, post comments.",
  auth: { getToken: async () => ({ token: process.env.GITHUB_APP_TOKEN! }) },
  tools: {
    allow: [
      "get_issue",
      "list_issue_comments",
      "search_issues",
      "add_issue_comment",
      "add_labels",
      "remove_label",       // for retraction
      "update_issue",       // but only with a narrowed schema — see below
    ],
  },
  approval: once(),  // first MCP call per session asks for human approval
});
```

What is **not** in the allow list:

- `delete_issue` — never automated
- `delete_issue_comment` — never automated
- `close_issue` — handled at the tool layer with `needsApproval: always`
- `lock_issue` — never automated
- `set_issue_state` (renamed to `update_issue_state` in newer MCP
  versions) — never automated; if needed, it goes through an authored
  tool with `needsApproval: always`

For the `update_issue` allow, narrow the tool's input schema at the
authored-tool layer (the MCP filter is tool-name, not field-level).
Allow only the fields the triage agent legitimately needs to set
(`assignees`, `milestone`), and gate the rest.

The combination — MCP-level `allow` + tool-level `needsApproval` +
persona discipline — is the layered defense.

### The `approval: once()` question

`approval: once()` makes the first MCP call in a session ask for human
approval. This may be too noisy for high-volume triage. Two options:

- **Drop `approval` and rely on the persona + the `apply_labels` tool
  being in the allow list.** Labels are cheap to apply; comments
  aren't.
- **Move the per-call approval into authored tools** with
  `needsApproval: always` on `add_issue_comment` and
  `needsApproval: once` on `add_labels`. The MCP connection stays
  approval-free; the gates live at the tool layer.

The second option is cleaner and matches the PR-triage reference's
shape (the reference has no per-MCP approval; gates live at the
persona + tools layer).

---

## 8. The eval surface

The PR-triage reference ships with no evals. For the issue-triage
agent, **add evals when the first regression would have been caught by
one**. Initial candidate evals:

```ts
// evals/well-formed-bug.eval.ts → eval id "well-formed-bug"
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Issue with clear repro + logs gets type:bug + status:ready.",
  async test(t) {
    await t.send(/* seeded issue body */);
    t.completed();
    t.calledTool("apply_labels");
    t.check(/* inspect applied labels */, /* includes "type: bug" */);
  },
});

// evals/security-escalation.eval.ts → eval id "security-escalation"
export default defineEval({
  description: "Issue mentioning auth bypass triggers escalation.",
  async test(t) {
    await t.send(/* seeded issue with security keywords */);
    t.completed();
    t.calledTool("escalate");  // if a custom escalation tool exists
  },
});

// evals/ambiguous-parked.eval.ts → eval id "ambiguous-parked"
export default defineEval({
  description: "Ambiguous issue parks (durable) and resumes on human reply.",
  async test(t) {
    const sessionId = await t.newSession();
    await t.send(/* seeded ambiguous issue */);
    // The session should park at a needsApproval gate.
    t.check(t.sessionState, /* is parked */);
    // Reply to the approval.
    await t.respond(/* approval */);
    t.completed();
  },
});
```

The evals drive the same HTTP surface as production traffic. A passing
eval means the agent booted, accepted a request, and produced the
result you asserted. For CI: `eve eval --strict` so soft threshold
misses fail the build.

---

## 9. The schedules

Two cron jobs, both root-only.

```ts
// agent/schedules/stale-sweep.ts → "stale-sweep", cron "0 9 * * *"
import { defineSchedule } from "eve/schedules";
import slack from "../channels/slack.js";

export default defineSchedule({
  cron: "0 9 * * *",
  async run({ receive, waitUntil, appAuth }) {
    waitUntil(
      receive(slack, {
        message: "List issues with no activity in 7 days and ping each author.",
        target: { channelId: "C0STALE" },
        auth: appAuth,
      }),
    );
  },
});

// agent/schedules/unprocessed-queue.ts → "unprocessed-queue", cron "*/15 * * * *"
export default defineSchedule({
  cron: "*/15 * * * *",
  async run({ receive, waitUntil, appAuth }) {
    waitUntil(
      receive(slack, {
        message: "Find issues with no status: triage label and trigger re-triage.",
        target: { channelId: "C0QUEUE" },
        auth: appAuth,
      }),
    );
  },
});
```

The first runs daily, posting to a "stale issues" channel. The second
runs every 15 minutes, catching any issue that the on-open triage
missed (e.g., GitHub App downtime, race conditions). Both use
`appAuth` because they're acting on behalf of the system, not a user.

---

## 10. The deploy sequence

The same 9-step sequence as the PR-triage reference. The wrinkle is the
ordering — the GitHub App's webhook URL needs the deployment URL, but
the deployment doesn't need the App's credentials to exist first.

1. `vercel link` (or `eve link`) — link the directory to a Vercel
   project. Pull AI Gateway credentials into `.env.local`.
2. `vercel deploy --prod` — first deploy with no GitHub/App
   credentials. Note the production URL.
3. Disable Vercel Deployment Protection for the project.
4. Create the GitHub App with the production URL as the webhook URL
   (`https://<app>.vercel.app/eve/v1/github`). Set the webhook secret
   with `openssl rand -hex 32`. Subscribe to **Issues** and (v1.5)
   **Issue comments**.
5. Grant **Issues: Read & write** on the App. (No Contents, no PRs.)
6. Generate the App's private key. Download the `.pem`.
7. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
   `GITHUB_WEBHOOK_SECRET` on the Vercel project.
8. `vercel deploy --prod` — second deploy, with credentials.
9. Install the App on the target repo. Create any labels that aren't
   GitHub defaults (`type: security`, `priority: p0`, etc.).

Then open a test issue. Within seconds: a triage comment, the right
labels applied. If the comment is an error with an error id, the
agent couldn't reach a model — confirm the AI Gateway is enabled or
set a provider key.

---

## 11. What v1 should NOT have

Explicit non-goals for v1:

- **No re-triage on push** — the on-open trigger is enough. Add
  `onIssueComment` in v1.5 (this is also when the command surface
  lands).
- **No subagents** — the persona + skills carry the work. Subagents
  earn their place when the `instructions.md` starts to feel like
  multiple personas stitched together.
- **No cross-channel handoff for ambiguous cases** — that's a v2
  feature. v1 stays on GitHub.
- **No state across sessions** — `defineState` is unused. The session
  is the natural unit; per-user memory is a footgun.
- **No build-time-vs-runtime config split** — `triage.yml` is baked at
  build. Runtime-editable config (the `triagebot.toml` lesson) is
  interesting but v2.
- **No sandbox** — read-only triage doesn't need bash. The
  `turn.started` override skips the default's checkout.
- **No evals in v1** — the PR-triage reference ships without them. Add
  evals when the first regression would have been caught by one.

---

## 12. Open questions

Three things I'd want to decide before building:

1. **Trigger coverage** — Issue open + (v1.5) Issue comment. Or also
   `labeled` (re-triage on user-applied labels)? The PR reference is
   `pull_request: opened` only, with re-triage on push deferred to v2.
   For issues, the parallel question is re-triage on comment. I'd ship
   on-open only and add the comment trigger in v1.5.
2. **Routing target** — Slack (rich) vs GitHub comment only (simple).
   The reference uses GitHub for the comment; schedules can hand off
   to Slack. For an MVP, GitHub-only is enough. Add Slack as a
   separate channel in v1.5.
3. **Per-app `triage.yml` vs shared** — one `triage.yml` for the
   monorepo, or one per `apps/*` and `packages/*`? The Rust
   `triagebot.toml` model is per-repo. The `eve` model is build-time
   per project. Start with one shared; split when the rules diverge.

---

## 13. The what-changes-when-it's-shipped

When this is in production:

- The label taxonomy in `CLAUDE.md` is **operational**, not just
  documentation. Drift between `CLAUDE.md` and the agent's
  `label-conventions/SKILL.md` is a release-blocking event.
- The OTel trace per triage is **the audit story**. The team must be
  able to replay any triage decision and see why the agent labeled
  something `p3: low` or marked a security-shaped issue as
  `type: question`. If they can't audit it, they won't trust it.
- The `triage.yml` policy changes are **deploys**, not config edits.
  Plan for that — a "we need to retrain the agent on a new label"
  request is a 5-minute PR, not a config flip.
- The "agent classified wrong" reports are **trace lookups**, not
  "let me re-run the prompt." The trace tells you what the model saw,
  what tools it called, and what it produced. The fix is usually
  one of: better `triage.yml` description, better persona line, or
  better skill content.

The design earns the right to exist when the team trusts the trace
more than they trust the manual triage they replaced.
