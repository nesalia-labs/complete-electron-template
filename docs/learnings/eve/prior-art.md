# `eve` — Prior Art & Patterns

> The lessons that matter, extracted from what Vercel Labs and the Rust
> project have already shipped. Read this before designing an `eve` agent
> from scratch — the patterns here are durable, the anti-patterns are
> honest.

The three prior-art projects that matter, in priority order:

1. [`vercel-labs/eve-pr-triage-agent-template`](https://github.com/vercel-labs/eve-pr-triage-agent-template) — the gold-standard reference for a webhook-driven agent.
2. [`vercel-labs/eve-content-agent-template`](https://github.com/vercel-labs/eve-content-agent-template) — the worked example of a multi-skill, multi-channel agent with `ARCHITECTURE.md`.
3. [`rust-lang/triagebot`](https://github.com/rust-lang/triagebot) — eight years old, still in production, command-based, no LLM. The contrast is the lesson.

---

## 1. The Vercel Labs PR-triage template

This is the closest thing to a canonical "how to ship an `eve` agent"
reference. It's 4 stars today because it shipped two days before `eve`
itself, but the shape will outlive the version.

### What it ships

```text
agent/
├── agent.ts                # 4 lines — model: "anthropic/claude-sonnet-4.6"
├── instructions.md         # 28 lines — the persona, defers to the triage skill
├── skills/triage/SKILL.md  # the procedure, loaded on demand
├── tools/                  # zero authored tools
└── channels/github.ts      # 15 lines — webhook entry point
triage.yml                 # the policy (labels, risk, routing)
package.json
```

The whole agent fits in 4 files. The ruleset is one YAML file. The
cognitive load of "what does this agent do" is bounded by the size of
`triage.yml` and `SKILL.md`.

### The `triage.yml` shape

The ruleset is **baked in at build time** — a constraint, not a bug. The
file's own comment is loud about this:

```yaml
labels:
  - name: "bug"
    description: Fixes a defect, regression, or otherwise unintended behavior.
  - name: "documentation"
    description: Changes only docs, README, code comments, or other documentation.
  - name: "enhancement"
    description: Adds or improves a user-facing capability.

risk:
  levels: [low, medium, high]
  signals:
    high:
      - "Touches auth, sessions, payments, or other security-sensitive paths."
      - "Database migrations or schema changes."
    medium:
      - "Changes shared or core modules that many things import."
      - "Adds a new external dependency."

reviewers:
  - paths: ["src/api/**", "src/server/**"]
    suggest: ["@your-org/backend"]
```

Three things to learn from the shape:

1. **Labels are names + descriptions, not patterns.** The description is
   what the model reads. The model decides whether the description fits
   the diff. There is no regex, no classifier — just a name and a clear
   sentence the model can match against.
2. **Risk is enumerated signals, not a score.** Each level has a list of
   "if any of these are true, the level applies." This is robust to
   distribution shift in a way that a learned classifier isn't.
3. **Reviewer routing is path-based and explicit.** The agent doesn't
   invent reviewers; it matches paths to a hand-curated list. The
   default ships empty so the first comment is clean rather than
   suggesting teams that don't exist.

### The channel

The full `agent/channels/github.ts` is 15 lines. Three things it does:

1. **Filters events** — `onPullRequest: (ctx, pr) => pr.action === "opened" ? { auth: defaultGitHubAuth(ctx) } : null`.
   Returns `null` for `synchronize`, `reopened`, etc. The agent only
   reacts to PR opens.
2. **Verifies the webhook signature** — `x-hub-signature-256` against
   `GITHUB_WEBHOOK_SECRET`. Unsigned requests get `401`.
3. **Overrides `turn.started`** to skip the default's sandbox checkout.
   The default does two things on every turn: drop a reaction and
   check the repo out into a sandbox for `read_file`/`grep`/`bash`.
   This agent has those tools disabled and the diff is auto-injected
   by dispatch, so the checkout is pure cost. **Supplying a
   `turn.started` handler replaces the built-in** — the reference
   keeps the reaction (harmless) and skips the checkout (the win).

```ts
events: {
  "turn.started": async (_data, channel) => {
    try { await channel.thread.react("eyes"); } catch {}
  },
},
```

This is the single most important pattern in the reference: **know when
to opt OUT of a default**. The "sandbox provisioned for every session"
default is the right default for an agent that writes code. For a
diff-only triage agent, it's a tax. The override is the escape hatch.

### The "no-op reaction" comment

The reference's source has a comment worth quoting:

> On a `pull_request: opened` turn the reaction is a no-op —
> `thread.react` targets the triggering comment, and an opened PR has
> none, so it silently does nothing (verified in source + live). We keep
> the call anyway: it's harmless and does the right thing if a
> comment/@mention dispatch is added later. For the PR-open path the
> first visible signal is the triage comment.

This is a real design lesson. The reaction is **designed for the full
lifecycle** (PR-open, comment, @mention), not just the first event. The
PR-open path is the simplest case. Writing for the simplest case alone
would lock you out of the harder cases. Write for the full lifecycle
and let the no-op fall out.

### The persona in `instructions.md`

The full 28 lines:

```md
# Identity
You are a GitHub pull-request triage agent. You run automatically when a pull
request is opened. Your job: read the PR, post a single excellent triage comment,
and apply the labels that fit. The comment posts on every PR and is your core
value — labels are a best-effort extra, so make the comment stand on its own.

# How you work
When a pull request opens, follow the **triage** skill: it holds the procedure
and this repository's triage ruleset (labels, risk signals, reviewer routing).
Load it before you act.

# Standing rules
- **Apply labels only with the `apply_labels` tool**, and only labels defined
 in the triage ruleset. Never invent labels.
- **Apply a label only when its definition genuinely fits the change.** If no
 label fits, apply none and skip the tool — a PR with no label is fine, the
 comment still carries the triage. Never stretch a change to the nearest label.
- **One comment per PR.** Your single final message is the entire triage.
- **Be conservative.** Apply a label only when the diff clearly supports it.
- **Suggest reviewers, don't assign them.** Name them in the comment.
- **Never** echo secrets, tokens, or environment values.
```

Two rules that look the same but aren't:

- (1) "The agent can't make up labels" — bounded by the ruleset.
- (2) "The agent doesn't stretch a misfit" — bounded by the persona.

The first is a code constraint. The second is a **persona discipline**.
The second is the one that matters for a triage agent. Easier to fix
"label is missing" than to fix "label is wrong" — wrong labels misroute
work, missing labels are a 1-second `gh label` away.

### The model choice

```ts
// Sonnet balances diff-reading quality against cost for high-volume triage.
// For cheaper, faster triage, drop to a smaller tier (e.g. anthropic/claude-haiku-4.5).
model: "anthropic/claude-sonnet-4.6",
```

This is in a source comment, not in a config field. Vercel Labs wrote
**"Sonnet for high-volume, drop to Haiku under cost pressure"** as a
guideline. High-volume triage is the workload that breaks naive agent
designs. A team that gets 100 PRs/day at Opus pricing is in the
four-figure monthly range. Sonnet is the recommended baseline; Haiku
is the escape hatch.

### The "no re-triage on push" decision

The README says, in plain text:

> The agent triages on PR open and does not re-run on later pushes to the
> same PR; re-triage on new commits is a v2 item.

This is the ship-the-simple-thing-first principle. The trigger model
is the first thing you can change later. Get one trigger working
end-to-end before adding a second.

### The deploy ordering wrinkle

From the README, in big letters:

> The GitHub App's webhook URL needs the deployment URL, but the
> deployment doesn't need the App's credentials to exist first. So
> **deploy first, then create the App, then set the credentials and
> redeploy.**

This is the most-common-first-deploy failure mode. The fix is the
ordering, not a flag. Worth writing into every agent's deploy doc
from day one.

### The Vercel Deployment Protection trap

From the README, also in big letters:

> A GitHub webhook is unauthenticated from Vercel's point of view, so
> if the project sits behind **Vercel Deployment Protection** (Vercel
> Authentication / SSO), every delivery is rejected with `401` *before
> it reaches the agent*, and nothing happens.

Two failure modes that look the same but are different:

- `401 unauthorized` (plain text) — the agent's own HMAC check
  rejecting an unsigned request. This is correct behavior; verify the
  webhook secret matches.
- Vercel SSO HTML page — Vercel Deployment Protection rejecting before
  the agent sees the request. Disable protection for the project.

---

## 2. The Vercel Labs content-agent template

A worked example of a different shape: a **multi-skill, multi-channel**
agent that reads Notion, drafts content, and writes back as the signed-in
user. The `ARCHITECTURE.md` is required reading for the project-structure
shape.

### What it ships

```text
agent/
├── agent.ts                  # model configuration (defineAgent)
├── instructions.md           # base system prompt / behavior
├── channels/slack.ts         # Slack surface, credentials via Vercel Connect
├── connections/notion.ts     # Notion MCP, user-scoped OAuth via Vercel Connect
├── sandbox.ts                # sandbox backend (Vercel Sandbox)
├── tools/
│   ├── lint_against_style.ts # banned-words check against the active surface's skill
│   ├── upload_asset.ts       # Vercel Blob: store text/binary
│   ├── list_assets.ts        # Vercel Blob: browse
│   ├── get_asset_info.ts     # Vercel Blob: metadata
│   ├── download_asset.ts     # Vercel Blob: read back (Blob URLs only)
│   └── delete_asset.ts       # Vercel Blob: delete (needsApproval)
└── skills/
    ├── blog-style/           # SKILL.md + references/{good-post.md, banned-words.json}
    ├── linkedin-style/       # SKILL.md + references/banned-words.json
    ├── release-notes-style/  # "
    └── newsletter-style/     # "
```

### The skill pattern

A "packaged" skill is a directory with a `SKILL.md` and a `references/`
subtree. The `SKILL.md` is the routing hint (when to load) and the
on-load instructions. `references/` are the on-demand lookup files —
the model reads them only when the topic comes up.

```text
skills/blog-style/
├── SKILL.md                  # description frontmatter + on-load instructions
└── references/
    ├── good-post.md
    └── banned-words.json
```

For an agent that switches between "blog" and "release notes" surfaces,
this is the cleanest way to keep the persona lean while carrying
detailed rules per surface. The `description:` frontmatter is the
routing hint — the model uses it to decide which skill to load.

### The `ARCHITECTURE.md` shape

The content-agent template ships an `ARCHITECTURE.md` that documents
the project structure, the data stores, the external integrations, the
deployment story, and the security considerations. This is the
**gold standard for a non-trivial `eve` project** — anyone joining the
repo can answer "where does X live, who calls it, what touches it" by
reading one document.

The structure:

1. Project identification (name, maintainer, license, last updated)
2. Overview (one paragraph + a 4-line summary)
3. Project structure (a `tree` block)
4. Core components (table: lives-in × eve-primitive × responsibility)
5. Data stores (what lives where, who owns it)
6. External integrations (purpose × method)
7. Deployment & infrastructure (platform, connectors, env, local dev)
8. Security considerations (auth, secrets, HITL, input hardening)
9. Development & testing (commands, no-test-suite note if applicable)
10. Future considerations (the things you know you'll add)
11. Glossary (eve-specific terms for newcomers)

For the issue-triage design in `issue-triage.md`, the same shape applies.
`ARCHITECTURE.md` is a load-bearing doc for any non-trivial `eve`
project, not an optional extra.

### The "no unit-test suite" decision

The content-agent template explicitly says:

> There is no unit-test suite. Verify changes with `pnpm typecheck` and
> `npx eve info` (both must report 0 errors / 0 warnings), then
> exercise the agent in the `pnpm dev` TUI.

This is the right answer **for a new template that hasn't yet earned
evals**. The PR-triage template makes the same call. Evals earn their
keep when the prompt drifts and the regression risk is real. For the
first version of an agent, `pnpm typecheck` + `eve info` + a hand-driven
TUI run is enough. **Add evals when you have a regression that would
have been caught by an eval** — that's the moment they're not premature.

### The Notion-via-Vercel-Connect pattern

User-scoped OAuth via Vercel Connect is the cleanest way to give the
agent "act as me" semantics on a third-party service. The user signs
in once, the token is stored encrypted, and the agent calls Notion as
the user. No shared credential, no `process.env.NOTION_TOKEN`. This is
the pattern for any "act as the user" integration.

```ts
import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.notion.com/sse",
  description: "Notion workspace.",
  auth: connect("notion"),
});
```

The `connect("notion")` UID was provisioned earlier via `vercel connect
create` + `attach`. The runtime resolves the per-user token before each
tool call; the model never sees the URL or credential.

---

## 3. The Rust `triagebot`

Eight years old, 214 stars, runs Rust's actual triage. The contrast
with `eve` is the lesson.

### The model

- **Trigger:** `@rustbot` commands in comments + event hooks.
- **Config:** `triagebot.toml` in each repo's default branch — runtime-
  editable, per-repo.
- **State:** Postgres-backed (assignments, agenda, workqueue).
- **LLM:** None. Pure rule-based.
- **Commands:** `@rustbot label A B`, `@rustbot assign @user`, `@rustbot
  ping windows`, `r? @user` (PR review assignment), `@rustbot
  prioritize`, `@rustbot claim`, `@rustbot release-assignment`.

### The contrast with `eve`

| Dimension | Rust triagebot | Vercel PR-triage template | What to learn |
| --- | --- | --- | --- |
| **Trigger** | Commands + event hooks | Webhook on PR open | Commands scale to 100s of repos; events scale to one repo with high volume. |
| **Config** | `triagebot.toml` in each repo (runtime-editable) | `triage.yml` baked at build time | Runtime-editable config is more flexible; build-time is more auditable. |
| **State** | Postgres (assignments, agenda) | None — stateless per session | The Rust team tracks who's on call, what's in the queue. The `eve` model is one durable session per event. |
| **LLM** | None — rule-based | LLM with skill-loaded rules | Rule-based is durable when commands are unambiguous. LLM is needed when interpreting free-form text. |
| **Action surface** | `@rustbot <verb> <args>` | `apply_labels`, post comment, suggest reviewers | Named commands are a **UI for humans**, not just a config. |

### The lesson: the command surface is the power-user escape hatch

The LLM is the free-form interpreter, but the command surface is the
power-user escape hatch. An `eve` agent that responds to commands as
well as events gets a cleaner escalation path.

For an issue-triage agent, the natural commands are:

- `@triage-bot label foo bar` — apply labels directly
- `@triage-bot assign @user` — set the assignee
- `@triage-bot needs more info` — request more info from the author
- `@triage-bot mark as wontfix` — close with a reason
- `@triage-bot retriage` — re-run the triage
- `@triage-bot escalate` — page the on-call

These can all be implemented as a `defineHook` on the GitHub channel's
`issue_comment` event: if the comment starts with `@triage-bot`, parse
the command, run the corresponding authored tool, and reply. The
free-form event triage (issue open) and the command surface (comment
mention) are two distinct triggers, both served by the same agent.

### The lesson: per-repo config is powerful

The `triagebot.toml` per-repo config is a powerful pattern: each repo
declares which features are enabled. For a monorepo with multiple
apps, this could be useful: each app gets its own triage behavior.

In `eve`, the closest analog is per-app `triage.yml`. Build-time
baking is the cost, but the value is "each app's triage policy is
auditable in its own repo." For our `apps/web`, `apps/desktop`, and
`packages/*` shape, the question is whether one `triage.yml` covers
all three or each gets its own. **Start with one shared; split when
the rules diverge.**

### The lesson: rule-based stays durable

The Rust triagebot is 8+ years old and STILL the reference for
command-based GitHub bots. Rule-based, when commands are unambiguous,
is durable in a way that LLM-based is not. The LLM is the right tool
for interpretation (free-form issue text → classification); the
command surface is the right tool for operations (`@triage-bot
assign @user` is unambiguous and fast).

---

## 4. Patterns to keep

Across all three prior-art projects, the patterns that recur:

1. **One persona in `instructions.md`; procedure in a skill.** Persona
   stays short, procedure loaded on demand.
2. **Channel-provided tools, not authored.** `apply_labels`,
   `add_comment`, `assign_issue` come from the GitHub channel. Author
   only the glue.
3. **`turn.started` override to skip the sandbox.** When the agent
   doesn't need bash/clone, pay for nothing.
4. **`defaultGitHubAuth` with `auth.attributes`.** Tools read context
   from the auth, not from tool arguments. Cleanest way to scope a
   tool to a specific issue/PR.
5. **One event filter, one `? : null` opt-out.** `onPullRequest`
   returns `null` for non-opened actions. Same pattern for `onIssue`.
6. **Ruleset baked at build time.** One YAML, loud comment about
   the constraint. Auditable, simple, deploy-gated.
7. **Sonnet for high-volume, Haiku escape hatch.** Opus is a choice
   for one-shot deep work, not for 100x/day triage.
8. **Deploy placeholder → create App → set creds → redeploy.** The
   ordering, not a flag.
9. **Override `turn.started` to opt OUT of the sandbox checkout.**
   Pure cost if the agent doesn't read the repo on disk.
10. **One `ARCHITECTURE.md` for any non-trivial project.** A load-bearing
    doc for newcomers, kept current as the project evolves.

## 5. Anti-patterns to avoid

1. **Authoring a `name:` field on a `define*` helper.** It's ignored —
   the path is the identity. Code that looks like a `name:` field is
   usually a sign of a copy-paste from a different framework.
2. **Centralizing the wiring in a single config file.** `eve` doesn't
   have a central config. Adding one (e.g. an `agent.config.ts`) is
   fighting the framework.
3. **Authoring tools the channel already provides.** `apply_labels`,
   `add_comment`, `close_issue`, `assign_issue` are channel-provided on
   GitHub. `postMessage` is channel-provided on Slack. Author only
   the glue.
4. **Skipping the deploy ordering on a webhook-driven agent.** The
   one-line mistake that costs an hour of debugging.
5. **Leaving Deployment Protection on for a webhook-driven agent.**
   Every webhook gets 401'd by Vercel SSO, not by the agent.
6. **Using Opus for high-volume triage.** Sonnet for the default,
   Haiku for cost pressure, Opus for one-shot deep work. The
   comment in the PR-triage source is the guideline.
7. **Bypassing `needsApproval` for destructive tools.** `apply_labels`
   is fine. `close_issue`, `delete_branch`, `delete_comment` are not.
   The persona discipline is the second line of defense after the
   `tools: { block: [...] }` MCP filter.
8. **Returning secrets from a tool.** The `toModelOutput` projection
   exists for a reason. The full `execute` return goes to channel
   event handlers and hooks; the model only sees the projection. If
   you must return a secret, redact before the model sees it.
9. **Relying on subagent delegation as an approval boundary.** A
   subagent is not a security boundary. The auth, the
   `needsApproval`, the connection's `approval` — those are the
   boundaries. The subagent is a tool the model calls, with whatever
   trust that implies.
10. **Evals in v1.** Premature optimization. Add evals when the
    first regression would have been caught by an eval. Before then,
    `pnpm typecheck` + `eve info` + a TUI run is enough.
