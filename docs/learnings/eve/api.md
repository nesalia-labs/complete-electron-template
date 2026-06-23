# `eve` — API & Authoring Reference

> The practical "how do I write an agent on `eve`" reference. This is **not** a
> tutorial — see the [official docs](https://beta.eve.dev/docs) for that. This
> is the cheat sheet, derived from the official TypeScript API reference and
> from the `vercel-labs/eve-pr-triage-agent-template` source. Keep it open
> while you author.

---

## 1. The `define*` import map

Everything you author is a default export of a `define*` helper, imported from a
path that names the slot. The full public surface is exported from
`packages/eve/src/public/index.ts` in the framework repo; anything not
re-exported there is internal.

```ts
// Agent config (the only required file in agent/)
import { defineAgent, defineRemoteAgent } from "eve";

// Capability primitives
import { defineTool, defineDynamic, disableTool, ExperimentalWorkflow } from "eve/tools";
import { always, once, never } from "eve/tools/approval";
import {
  bash, readFile, writeFile, glob, grep, webFetch, webSearch, todo, loadSkill,
} from "eve/tools/defaults";

import { defineMcpClientConnection, defineOpenAPIConnection, defineInteractiveAuthorization,
         ConnectionAuthorizationRequiredError, ConnectionAuthorizationFailedError,
         isConnectionAuthorizationRequiredError, isConnectionAuthorizationFailedError } from "eve/connections";

import { defineSkill, defineDynamic } from "eve/skills";
import { defineInstructions, defineDynamic } from "eve/instructions";

import { defineHook } from "eve/hooks";
import { defineSchedule } from "eve/schedules";
import { defineState } from "eve/context";
import { defineSandbox, defaultBackend } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import { docker } from "eve/sandbox/docker";
import { microsandbox } from "eve/sandbox/microsandbox";
import { justbash } from "eve/sandbox/just-bash";
import { defineInstrumentation, isChannel } from "eve/instrumentation";

// Channels
import { defineChannel, GET, POST, PUT, PATCH, DELETE, WS } from "eve/channels";
import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, placeholderAuth } from "eve/channels/auth";
import {
  slackChannel, discordChannel, teamsChannel,
  telegramChannel, twilioChannel, githubChannel, linearChannel,
} from "eve/channels/<platform>";

// Evals
import { defineEval, defineEvalConfig } from "eve/evals";
import { includes, equals, matches, similarity } from "eve/evals/expect";
import { Braintrust, JUnit } from "eve/evals/reporters";
import { loadJson, loadYaml } from "eve/evals/loaders";

// Frontend
import { useEveAgent } from "eve/react"; // also: eve/vue, eve/svelte
import { Client, ClientSession } from "eve/client";
```

The exhaustive list is in [`packages/eve/src/public/index.ts`](https://github.com/vercel/eve).
Types are co-located: `ToolDefinition`, `ToolContext`, `AgentDefinition`, etc.
ship from the same entrypoint as the helper they describe.

---

## 2. The slot table — where each `define*` lives

Identity comes from the path. Move the file, the identity moves. There is no
`name:` field, no `register()` call.

| Path | Helper | Required on root? | Subagent? |
| --- | --- | --- | --- |
| `agent/agent.ts` | `defineAgent` | optional (defaults to `claude-sonnet-4.6`) | yes (root form) |
| `agent/instructions.md` / `.ts` / dir | markdown or `defineInstructions` | yes on root, optional on subagents | optional |
| `agent/tools/<name>.ts` | `defineTool` | no | yes |
| `agent/skills/<name>.md` or `<name>/SKILL.md` | `defineSkill` | no | yes |
| `agent/connections/<name>.ts` | `defineMcpClientConnection` / `defineOpenAPIConnection` | no | yes |
| `agent/subagents/<name>/agent.ts` | `defineAgent` with `description` | no | n/a |
| `agent/channels/<name>.ts` | `defineChannel` or platform factory | no | **root-only** |
| `agent/schedules/<name>.ts` / `.md` | `defineSchedule` | no | **root-only** |
| `agent/sandbox.ts` or `agent/sandbox/sandbox.ts` | `defineSandbox` | no | yes (own sandbox) |
| `agent/sandbox/workspace/**` | seeded into `/workspace` at session start | no | yes |
| `agent/lib/**` | import-only — never reaches the sandbox | no | yes |
| `agent/hooks/**` | `defineHook` | no | yes |
| `agent/instrumentation.ts` | `defineInstrumentation` | no | **root-only** |
| `evals/<name>.eval.ts` | `defineEval` (in `evals/`, sibling of `agent/`) | no | n/a |
| `evals/evals.config.ts` | `defineEvalConfig` (exactly one per `evals/`) | no | n/a |

`lib/` is import-only and never reaches the sandbox workspace. `skills/` and
`sandbox/workspace/**` do. Authoring `agent/sandbox/workspace/skills/...` is
rejected as a collision (the skills already seed there).

Subagents are *fully isolated* in their authored slots: a declared subagent at
`agent/subagents/<name>/` discovers its own `tools/`, `connections/`,
`skills/`, `sandbox/`, `hooks/`, and (recursively) `subagents/`. It inherits
**nothing** from the root's authored surface. The exception is the built-in
`agent` tool — a copy of the parent — which shares the parent's sandbox and
tools.

---

## 3. The agent config (`agent/agent.ts`)

```ts
import { defineAgent } from "eve";

export default defineAgent({
  // Gateway-routed model id (resolves through Vercel AI Gateway)
  model: "anthropic/claude-sonnet-4.6",
});
```

Full shape (all fields optional except `model` if `agent.ts` is present):

```ts
export default defineAgent({
  model: "anthropic/claude-opus-4.8",          // gateway id or LanguageModel
  modelOptions: { /* provider option overrides */ },
  compaction: { thresholdPercent: 0.75 },        // default 0.9
  experimental: { codeMode: true },              // unstable; may change
  outputSchema: z.object({ ok: z.boolean() }),  // task-mode structured output
  build: { externalDependencies: ["@aws-sdk/client-s3"] },
});
```

When `agent.ts` is omitted entirely, `eve` defaults to
`anthropic/claude-sonnet-4.6`. To use a direct provider model, import the
provider's `LanguageModel` factory and pass the model directly — eve will
skip the gateway.

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

export default defineAgent({
  model: anthropic("claude-opus-4.8"),
});
```

The provider package (e.g. `@ai-sdk/anthropic`) is a regular project
dependency — install it; `eve init` does not install every provider.

---

## 4. Tools — the typed action surface

A tool is a default export of `defineTool`. The filename is the model-facing
tool name. The tool runs in the **app runtime** (full `process.env`, can
import `lib/`), not the sandbox.

```ts
// agent/tools/refund.ts → model-visible tool "refund"
import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Refund a charge.",                       // written for the model
  inputSchema: z.object({                               // Zod, Standard Schema, or JSON Schema
    chargeId: z.string(),
    amount: z.number().positive(),
  }),
  outputSchema: z.object({ ok: z.boolean() }).optional(),
  needsApproval: always(),                              // or once() / never() / ({ toolInput }) => boolean
  toModelOutput: (out) => ({ type: "text", value: `refund ${out.ok ? "ok" : "failed"}` }),
  async execute(input, ctx) {
    // ctx.session, ctx.getSandbox(), ctx.getSkill(id), ctx.getToken(), ctx.requireAuth()
    return await refund(input);
  },
});
```

Field reference:

- `description` — required, written for the model, not for you.
- `inputSchema` — required; `z.object({})` for no-input tools. Standard
  Schema (Zod, Valibot, ArkType) types the `input` parameter in `execute`.
  Plain JSON Schema types it as `Record<string, unknown>`.
- `outputSchema` — optional; types the `execute` return and is included in
  the model's view when no `toModelOutput` is set.
- `needsApproval` — `always()`, `once()`, `never()`, or a predicate
  `({ toolInput }) => boolean`. When truthy, the session parks (durably
  suspends) until a human approves.
- `toModelOutput` — projects a rich return down to what the model needs to
  see. Channel event handlers and hooks still get the full output on
  `action.result`; a Slack channel can render Block Kit the model never sees.
- `execute(input, ctx)` — the implementation. May be sync or async.

`execute` runtime contract:

- `ctx.session` — current session, turn, auth, optional parent lineage.
- `ctx.getSandbox()` — live sandbox handle (`await`-ed).
- `ctx.getSkill(id)` — read a packaged skill's metadata and files.
- `ctx.getToken()` — resolve the bearer token for a tool's declared `auth`
  (throws without `auth`).
- `ctx.requireAuth()` — force the tool's authorization flow before proceeding.

Critical runtime semantics:

- **`eve` never runs authored tools during discovery** — the model sees
  descriptors first, only model-called tools execute.
- **Completed steps never re-run** — `eve` replays the recorded result.
- **Interrupted steps DO re-run** — make side effects idempotent (charges,
  emails) or gate them with `needsApproval`.
- **Don't return secrets, credentials, or unbounded PII** from tools.
  Filter, minimize, redact.

To disable one of the built-in sandbox tools, import the helper and call it
in a tool definition:

```ts
import { disableTool, bash } from "eve/tools";

export default disableTool(bash); // bash is no longer exposed to the model
```

---

## 5. Skills — on-demand procedures

A skill is a Markdown file (or a directory with a `SKILL.md`). When the model
decides the topic is relevant, `eve` injects the skill's content into the
prompt. Skills are **not an execution surface** — they only add instructions.

```md
<!-- agent/skills/revenue-definitions.md -->
---
description: How this team defines revenue. Load before answering any revenue question.
---
Revenue is recognized net of refunds, over the subscription term.
Weeks are Monday-anchored, in UTC.
Exclude trial and internal accounts from every number.
```

Packaged form (recommended for anything non-trivial): a directory with
`SKILL.md` and a `references/` subtree the model can pull from on demand.

```text
agent/skills/blog-style/
├── SKILL.md                  # required; has description: frontmatter
└── references/
    ├── good-post.md
    └── banned-words.json
```

The `description:` frontmatter is the routing hint — the model uses it to
decide when to load the skill. Write it for the model.

To author a skill programmatically (e.g., for a skill whose content is
generated at build time):

```ts
// agent/skills/regulatory-text.ts → skill "regulatory-text"
import { defineSkill } from "eve/skills";

export default defineSkill({
  description: "Cites the relevant regulatory text before any compliance question.",
  body: () => loadTextFromSomewhere(),
});
```

---

## 6. Connections — MCP and OpenAPI

A connection is a default export that points at an external server. The
filename is the connection name. The runtime surfaces remote tools to the
model as `connection__<name>__<tool>` (e.g. `connection__linear__list_issues`).
The model never sees the URL or credentials.

```ts
// agent/connections/linear.ts → connection "linear"
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/sse",
  description: "Linear workspace: issues, projects, cycles, and comments.",
  auth: {
    getToken: async () => ({ token: process.env.LINEAR_API_TOKEN! }),
  },
  tools: { allow: ["search_issues", "get_issue"] },  // or { block: [...] }
  approval: once(),                                  // or always() / never()
});
```

For OpenAPI:

```ts
import { defineOpenAPIConnection } from "eve/connections";

export default defineOpenAPIConnection({
  spec: "https://petstore3.swagger.io/api/v3/openapi.json",
  description: "Pet store inventory and orders.",
  auth: { getToken: async () => ({ token: process.env.PETSTORE_TOKEN! }) },
  operations: { allow: ["getInventory", "placeOrder"] },
});
```

Auth options:

- **Static bearer** — `getToken: async () => ({ token, expiresAt? })`. Set
  `expiresAt` (ms since epoch) so `eve` refreshes ahead of the 401.
- **Per-user OAuth via Vercel Connect** — `auth: connect("linear")`. Connect
  brokers the OAuth, refreshes, and stores encrypted tokens.
- **Self-hosted interactive OAuth** — `defineInteractiveAuthorization({...})`
  with `getToken` / `startAuthorization` / `completeAuthorization`. The
  runtime mints a callback URL, parks the turn on a framework-owned webhook,
  and resumes when the token comes back.
- **No auth** — drop the `auth` block for services that need no token.
  Recommended only for intentionally-public or local-only servers.

Two error classes drive the consent flow when `getToken` throws them
(exported from `eve/connections`):

```ts
import {
  ConnectionAuthorizationRequiredError,
  ConnectionAuthorizationFailedError,
} from "eve/connections";

throw new ConnectionAuthorizationRequiredError("linear");
throw new ConnectionAuthorizationFailedError("linear", { reason: "access_denied", retryable: false });
```

To narrow a caught error: use the `is*` helpers (match on `err.name`, not
`instanceof` — they survive bundling).

For a tool that calls the API itself, signal "I need auth" with
`ctx.requireAuth()` if the upstream returns 401 — `eve` will evict the
rejected token and re-run the consent flow.

**Critical safety property** — set `tools: { block: [...] }` (or
`operations: { block: [...] }`) to keep destructive remote tools out of the
model's reach entirely. For a read-only triage agent, this is the single
highest-leverage safety control.

---

## 7. Channels — inbound and outbound surfaces

Channels are how a message reaches the agent and how the agent's reply is
delivered. The HTTP channel (`/eve/v1/session`) is on by default; the rest
are platform-specific adapters.

```ts
// agent/channels/slack.ts
import { slackChannel } from "eve/channels/slack";
import { connectSlackCredentials } from "@vercel/connect/eve";

export default slackChannel({
  credentials: connectSlackCredentials("slack/my-agent"),
  // optional: events: { ... } to override default lifecycle handlers
});
```

The GitHub channel — used by the issue-triage design — is more involved
(webhook signature verification, installation token minting, opt-in event
filters). See `runtime.md` § 5 and `issue-triage.md` § 4 for the worked
example.

For custom channels:

```ts
import { defineChannel, POST } from "eve/channels";

export default defineChannel({
  onMessage: async (event, ctx) => {
    // deliver to the agent
    return { text: event.text };
  },
  routes: {
    "POST /webhook": async (req, ctx) => {
      // ...
    },
  },
});
```

Route verbs: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `WS` — imported from
`eve/channels`. Auth helpers: `localDev()`, `vercelOidc()`,
`placeholderAuth()` — imported from `eve/channels/auth`. Use them in the
route definition to gate inbound traffic.

---

## 8. Schedules — cron-triggered jobs

Schedules are root-only. The filename (path under `schedules/`) is the
schedule name.

```ts
// agent/schedules/heartbeat.ts → schedule "heartbeat"
import { defineSchedule } from "eve/schedules";
import slack from "../channels/slack.js";

export default defineSchedule({
  cron: "0 9 * * 1-5",  // 5-field, minute granularity, UTC on Vercel
  async run({ receive, waitUntil, appAuth }) {
    waitUntil(
      receive(slack, {
        message: "Summarize yesterday's activity and post the digest.",
        target: { channelId: "C0123ABC" },
        auth: appAuth,
      }),
    );
  },
});
```

Two forms:

- **Markdown form** (fire-and-forget, task mode): `markdown: "..."` — the
  agent runs and its output is discarded (it can still call tools along the
  way). A task-mode session cannot park.
- **Handler form** (`run: ...`) — full control. Use `waitUntil(promise)` to
  keep the cron task alive while a parked session settles.

`eve dev` does **not** fire schedules on their cron cadence. To trigger one
while iterating: `curl -X POST http://localhost:3000/eve/v1/dev/schedules/heartbeat`.
Production builds serve Nitro scheduled tasks; on Vercel, those are wired
to Vercel Cron Jobs automatically.

---

## 9. The runtime context (`ctx`)

`ctx` is passed to `execute`, hook handlers, and channel event handlers. It
is **live only while authored code is running** — reaching for it at module
top level throws.

```ts
async execute(input, ctx) {
  // session metadata
  const { sessionId, turn, auth, parent } = ctx.session;

  // the live sandbox handle (not available outside authored runtime)
  const sandbox = await ctx.getSandbox();

  // a packaged skill's files
  const skill = await ctx.getSkill("revenue-definitions");

  // the bearer token for a tool's declared `auth` (throws without `auth`)
  const { token } = await ctx.getToken();

  // force the auth flow mid-call (e.g. on a 401 from the upstream)
  if (response.status === 401) ctx.requireAuth();
}
```

`ctx` is **not** available during discovery. The model sees tool descriptors
that include `description`, `inputSchema`, etc. — not the runtime context.

---

## 10. The CLI

The `eve` binary runs from your app root. Every command first loads
`.env`/`.env.local` from that root. Running `eve` with no command runs
`eve dev`.

| Command | Purpose |
| --- | --- |
| `eve init [target] [--channel-web-nextjs]` | Scaffold a new agent, or add one to an existing project. |
| `eve info [--json]` | Print the resolved application — discovered tools, skills, subagents, schedules, channels, routes, artifact paths, and discovery diagnostics. **Run this first when something misbehaves.** |
| `eve build` | Compile `.eve/` artifacts and build the host output. |
| `eve start [--host --port]` | Serve the built `.output/` app. |
| `eve dev [options] [url]` | Start the local dev server + TUI. Pass a URL to connect the TUI to a remote deployment. |
| `eve link` | Link the directory to a Vercel project, pull AI Gateway credentials into `.env.local`. |
| `eve deploy` | Deploy to Vercel production. Links first if needed. |
| `eve eval [evalId...] [--url]` | Run evals against the local app or a remote target. |
| `eve channels add [kind] [-f] [-y]` | Scaffold a channel interactively or by kind (`slack` \| `web`). |
| `eve channels list` | List user-authored channels. |

The most-used flags on `eve dev`:

```text
--host, --port, --url, --no-ui, --name, --input,
--tools <full|collapsed|auto-collapsed|hidden>,
--reasoning, --subagents, --connection-auth,
--assistant-response-stats <tokens|tokensPerSecond>,
--context-size, --logs <all|stderr|sandbox|none>
```

`eve dev` writes a `.eve/dev-process.pid`. If another `eve dev` starts for
the same agent while that process is still running, `eve` exits with a
message that includes the command to stop the existing server. Stale
runtime snapshots under `.eve/dev-runtime/snapshots/` are pruned in the
background on startup.

---

## 11. A "right-sized" mental model

When you open a fresh `eve` project, ask in this order:

1. **What is the agent's job?** One sentence. Write it into `instructions.md`
   as the persona. Stop. Add skills when one procedure is too big for the
   persona to carry.
2. **What are the model-facing capabilities?** Tools, connections, skills.
   Add files for each; do not centralize.
3. **How does a message reach it?** A channel — webhook for GitHub, an event
   for a cron, an HTTP API call for a web UI.
4. **What can go wrong?** A human approval, a sandbox, a tool filter, an
   eval. Add each only when the failure mode is concrete.
5. **How does it ship?** `eve deploy`. Most of the time the answer is
   "the same way a Vercel project ships." The interesting question is
   whether the agent is locked to Vercel or self-hosted.

If you find yourself authoring a `register()` function, you're fighting the
framework. If you find yourself writing YAML, you're encoding policy that
should be in `instructions.md` or a skill. If you find yourself reaching for
`process.env` in a tool, you're doing it right — that's the contract.
