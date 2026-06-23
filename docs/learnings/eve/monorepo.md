# `eve` — Monorepo Integration

> How `eve` projects fit alongside our existing Electron + oRPC monorepo.
> Where the agent lives, what it can call, what calls it, and what we
> share. The integration seams are the load-bearing design decisions —
> everything else is "ship a Vercel project."

This doc assumes the issue-triage agent from `issue-triage.md` is the
working example. The same shape generalizes to any `eve` project we
adopt — a routing agent, a support agent, an internal-tooling agent.

---

## 1. The monorepo shape, today

The current structure (from `CLAUDE.md`):

```text
complete-electron-template/
├── apps/
│   ├── desktop/                    # Electron desktop app
│   └── web/                        # TanStack Start web app
├── packages/
│   ├── api/                        # oRPC server router
│   ├── db/                         # Drizzle ORM database layer
│   └── sdk/                        # Shared SDK (re-exports API types)
├── docs/                           # internal / learnings / plans / reports
└── .github/workflows/              # 17 CI workflows, one action each
```

The agents we might add (`triage-agent/`, `routing-agent/`, etc.) are
**siblings of `apps/` and `packages/`** — they're standalone Vercel
projects, each with their own `package.json`, their own deploy, and
their own runtime.

They are **not** workspaces in the pnpm sense. The agent project does
not import from `packages/api` at build time; it imports at runtime
over the network (an oRPC HTTP call). This is intentional and load-
bearing — see § 3.

---

## 2. Where the agent lives

Three reasonable options:

| Option | Pros | Cons |
| --- | --- | --- |
| `apps/triage-agent/` (workspace) | Single repo, single CI, shared dev tooling | Couples agent deploy to template repo deploys; harder to evolve independently |
| **Sibling directory at the repo root** (`triage-agent/`) | Independent deploy, own `eve` project, own AGENTS.md | Two pnpm projects to manage, no shared dev tooling |
| **Separate repo** | Cleanest isolation, own CI/CD, own release cadence | Cross-repo context loss; harder to keep `CLAUDE.md` and the agent in sync |

**The default I'd recommend: sibling at the repo root**, with a thin
package.json that doesn't import anything from `apps/` or `packages/`.
The agent is a real Vercel project; it deploys independently; it owns
its own CI; it shares only `docs/` and the issue labels defined in
`CLAUDE.md`.

The monorepo's `package.json` is pnpm-workspace-aware (`pnpm-workspace.yaml`).
The agent can opt **out** of workspace discovery by not being listed
in `pnpm-workspace.yaml`. Add the agent as a workspace only if you
want shared TypeScript config and shared dev tooling — the cost is
coupling, the benefit is convenience.

For the issue-triage agent specifically, the convenience of shared
TypeScript config is small (the agent is small), and the coupling is
real (any change to the agent would re-trigger template CI). The
non-workspace sibling is the right default.

---

## 3. The integration seams

Five integration seams, in priority order.

### 3.1 The label taxonomy — the load-bearing one

The label catalog defined in `CLAUDE.md` § "Issue Labels" (`type:*`,
`status:*`, `priority:*`, `effort:*`) is the **single source of
truth** for the agent. The agent's `skills/label-conventions/SKILL.md`
mirrors that file verbatim. Drift between the two is a release-
blocking event.

The discipline:

- `CLAUDE.md` changes are mirrored to `skills/label-conventions/SKILL.md`
  in the same PR.
- The `AGENTS.md` in the agent project tells coding agents: "The
  label taxonomy lives in `CLAUDE.md` at the repo root. Mirror it
  exactly. If you change one, change the other in the same commit."

This is the integration seam that **breaks trust when it breaks**.
A label that exists in the agent's catalog but not in the repo
silently no-ops (`apply_labels` skips missing labels — see
`issue-triage.md` § 3 and the PR-triage reference). A label that
exists in the repo but not in the agent's catalog means the agent
can't apply it. Both are silent failures that erode trust.

### 3.2 oRPC-backed tools — the agent calls our API

The agent can call our existing oRPC router at `packages/api/` over
HTTP. The integration shape:

```ts
// agent/tools/get_issue_context.ts
import { defineTool } from "eve/tools";
import { z } from "zod";

const ORPC_URL = process.env.ORPC_URL!;

export default defineTool({
  description: "Pull related internal data for an issue — recent deploys, recent issues, related code paths.",
  inputSchema: z.object({
    issueNumber: z.number().int().positive(),
    lookbackHours: z.number().int().min(1).max(168).default(24),
  }),
  async execute({ issueNumber, lookbackHours }) {
    const res = await fetch(`${ORPC_URL}/issue-context`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.ORPC_SERVICE_TOKEN!}`,
      },
      body: JSON.stringify({ issueNumber, lookbackHours }),
    });
    if (!res.ok) throw new Error(`oRPC ${res.status}`);
    return await res.json();
  },
});
```

The shape:

- The agent is an **HTTP client of its own oRPC peer**, not a
  workspace consumer.
- The oRPC router gets a new procedure (`issue-context`) that pulls
  the relevant data. The procedure is just a normal oRPC procedure;
  no special integration.
- The agent authenticates with a service token (or via OIDC if
  deployed to Vercel). The token lives in Vercel env, not in the
  agent's code.

What this enables:

- The agent can answer "did this break in the last deploy?" without
  us wiring deploy metadata into the agent directly.
- The agent can surface "we have 12 open issues about this area" by
  calling our own issue query.
- The agent can route to the right owner by calling our CODEOWNERS
  resolver.

What this **doesn't** require:

- No new package in `packages/`. The oRPC contract is already there;
  we just add a procedure.
- No shared types in the build. The agent types the response itself
  (Zod) or imports the SDK (`packages/sdk`) — either works.
- No change to the Electron or web apps. The agent is a peer, not a
  dependency.

### 3.3 The agent's output surfaces — where it talks

The agent's natural outputs are:

- **GitHub** — the channel the agent listens on. Labels, comments,
  assignments, escalations. The PR-triage reference's whole shape.
- **Slack** — the human-facing channel for escalations, daily
  digests, and "this needs your eyes" pings. Per the
  `vercel-labs/eve-content-agent-template` reference, the Slack
  channel uses Vercel Connect for credentials; no shared secret in
  code.
- **Webhook** — for the rare case where the agent's output goes to
  an internal system (PagerDuty for p0, an internal Slack channel
  for routing). The `defineChannel` helper with a custom route
  handles this.

For an MVP, GitHub-only is enough. Add Slack as a second channel in
v1.5 — the cross-channel handoff is one of `eve`'s strongest
features (see `runtime.md` § 1 and `issue-triage.md` § 9).

### 3.4 The agent's knowledge sources — the docs

The agent reads `docs/` to ground its decisions. The natural sources:

- `docs/internal/` — the team's own docs. The agent can fetch
  specific URLs as needed.
- `docs/learnings/` — what we've figured out. The agent doesn't
  read these directly, but the `instructions.md` and skill content
  can be derived from them.
- `docs/reports/` — post-incident reports, retrospectives. The
  agent should reference these when classifying incidents.
- `docs/plans/` — current initiatives. The agent should consider
  these when classifying feature requests.

The cleanest integration: a `webFetch` connection (built-in
`eve/tools/defaults`) that points at our docs. The agent fetches
specific URLs when it needs to. **This requires the docs to be
publicly addressable** — either via the GitHub raw URLs, via a
public Vercel deploy of the docs site, or via an authenticated
internal docs service.

The simpler integration: bake the relevant doc content into the
agent's skills at build time. A `label-conventions/SKILL.md` that
quotes `CLAUDE.md` directly. An `escalation-policy/SKILL.md` that
quotes `docs/internal/oncall-rotation.md`. This is build-time
baking, but the cost is "edit two places when the policy changes,"
which is the same cost as the `triage.yml` mirroring.

### 3.5 The team's existing tooling — what the agent can call

The agent can call any tool the team already has:

- **The oRPC router** (see § 3.2) — for issue context, deploys,
  metrics, etc.
- **GitHub MCP** — for everything GitHub (covered separately in
  `issue-triage.md` § 7).
- **Vercel MCP** (when needed) — for our own Vercel projects,
  deploys, env, etc.
- **Internal APIs** — via OpenAPI connections. If we have a REST
  API with an OpenAPI document, `defineOpenAPIConnection` exposes
  it to the model as `connection__<name>__<operation>`.

What the agent **cannot** do is reach into the Electron app. The
agent is a server-side process. It doesn't run in the user's
machine. The Electron app is the user's UI; the agent is the
team's automation. Different audiences, different trust models,
different runtime.

---

## 4. The CI story

The monorepo's CI is 17 workflows, one action each (per `CLAUDE.md`
§ "CI/CD Philosophy"). The agent's CI follows the same principle:

```text
.github/workflows/
├── build-triage-agent.yml       # builds the agent
├── lint-triage-agent.yml        # eslint / biome
├── typecheck-triage-agent.yml   # tsc --noEmit
├── test-triage-agent.yml        # if we add evals-as-tests
├── deploy-triage-agent.yml      # manual / tagged deploy to Vercel
└── secrets-check.yml            # block any GITHUB_APP_PRIVATE_KEY in code
```

The agent's CI is **independent** of the template's CI. Changes to
the agent don't re-run the template's typecheck; changes to the
template don't re-run the agent's typecheck. This is the value of
the "sibling, not workspace" decision.

The deploy workflow is the only one with a side effect. It uses
`vercel deploy --prod` with `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`
/ `GITHUB_WEBHOOK_SECRET` from GitHub Actions secrets. Manual trigger
or `v*.*.*` tag.

---

## 5. The dev experience

The day-to-day loop for someone working on the agent:

```bash
cd triage-agent
npm install
eve dev              # local TUI; /model to link a provider
npx eve info         # confirm discovery
pnpm typecheck       # if we use pnpm here
eve build            # verify a clean build
eve eval             # when we have evals
```

The dev experience is the same as the PR-triage reference's. The
local TUI drives the agent over the same HTTP API that production
uses. `eve info` is the first thing to run when something misbehaves.

For testing the webhook end-to-end, the
[`gh webhook` extension](https://docs.github.com/en/developers/webhooks-and-events/webhooks/receiving-webhooks-with-the-github-cli)
forwards real GitHub events to a local server. The same pattern
the Rust triagebot docs document.

---

## 6. The "agent as a peer" principle

The single most important framing decision: **the agent is a peer
to our services, not a feature of them**. It runs in its own
runtime, deploys on its own cadence, has its own CI, and has its
own team (if only one person today). It calls our oRPC API as a
client; we don't import from it.

Concretely:

- The Electron app does not embed the agent.
- The web app does not call the agent directly.
- The agent does not import from `packages/`.
- The agent deploys independently of the template.
- The agent's CI does not run on template PRs.
- The agent's deploys do not trigger template CI.

This framing is the difference between "an automation script that
lives in our repo" and "a service that happens to share our repo
for review convenience." The latter is what scales. The former
turns into a coupling tax the moment the agent needs to evolve
faster than the template.

---

## 7. The boundary with the `github-expert` Claude Code agent

This repo has a `github-expert` Claude Code sub-agent (per
`.claude/agents/github-expert/`). The `github-expert` agent and the
`eve` triage agent are **complementary, not redundant**:

| | `github-expert` | `eve` triage agent |
| --- | --- | --- |
| **Direction** | Outbound (humans drive it) | Inbound (events drive it) |
| **Trigger** | `@github-expert` mention in Claude Code | `issues.opened` webhook |
| **Runtime** | Claude Code session | Vercel-hosted `eve` agent |
| **Audience** | The team's developers | The team's issues |
| **Purpose** | Help with GitHub operations on demand | Triage every new issue automatically |

The two can interoperate:

- `github-expert` can call the `eve` agent over HTTP to ask "what
  would you do with this issue?" — useful for ad-hoc "should I pick
  this up?" questions.
- The `eve` agent's commands surface (the `@triage-bot` lesson from
  `prior-art.md` § 3) can be used by `github-expert` to apply
  labels, escalate, or close as duplicate.

The boundary is clean: `github-expert` is the human's tool;
the `eve` agent is the system's tool. They share the same label
taxonomy and the same GitHub App credentials, but they have
different runs, different lifecycles, and different audiences.

---

## 8. The cost and risk register

| Concern | Mitigation |
| --- | --- |
| **Sonnet-4.6 at 100 issues/day is real money.** | Env-var override `EVE_TRIAGE_MODEL`; drop to Haiku under cost pressure. The PR-triage reference's source comment is the guideline. |
| **Vercel lock-in.** | The `eve` framework is Apache 2.0; the production story is Vercel. The agent is replaceable by Mastra (TS-portable) or LangGraph (Python) with effort. The label taxonomy, the ruleset, the persona — those are ours. |
| **GitHub rate limits.** | The MCP `tools: { allow: [...] }` filter limits the call surface. Cache `get_issue` results on session state (`defineState`). Use GraphQL MCP tools for fewer round-trips. The GitHub MCP itself has open issues about rate limit handling; the upstream fix isn't shipped. |
| **Drift between `CLAUDE.md` labels and the agent's catalog.** | Mirror in the same PR. `AGENTS.md` in the agent project enforces. |
| **The agent misclassifies a security issue.** | The persona discipline: "Escalate when uncertain." The MCP `tools: { block: [...] }` filter keeps destructive operations out of reach. The OTel trace is the audit story — replay any decision. |
| **The agent posts something embarrassing on a public issue.** | The `add_issue_comment` tool's `needsApproval: always` (or `once`) gates the first comment in a session. The persona is explicit: "One comment per issue." |
| **The deploy ordering trick catches us.** | It's documented in the deploy sequence (`issue-triage.md` § 10). The first PR will hit it; the second deploy goes smoothly. |
| **The Vercel Deployment Protection trap.** | Disable it for the agent's Vercel project. The PR-triage reference shouts this; we should too. |
| **The agent's CI slows down the template's CI.** | The agent is a sibling, not a workspace. Its CI is independent. |
| **The team loses trust in the agent.** | OTel traces are the recovery path. Replay any decision, see why. The first time trust breaks, the trace is what rebuilds it. |
