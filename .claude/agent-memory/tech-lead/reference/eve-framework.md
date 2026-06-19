---
name: eve-framework
description: Vercel eve — filesystem-first agent framework (npm `eve`, Apache 2.0). Mental model, define* API surface, quick start, and Vercel-platform dependencies.
metadata:
  type: reference
---

# Vercel `eve` — agent framework

Vercel's open-source (Apache 2.0, npm `eve`) framework for building durable AI agents. Launched 2026-06-17 at Vercel Ship. GitHub: `vercel/eve`. **Public preview / beta** — APIs and behaviour will change before GA.

Positioned as **"Next.js for agents"** — same Vercel story, same Vercel lock-in.

## Mental model: the filesystem IS the interface

No registry, no `name:` fields. **Identity comes from the path.** Move/rename the file, the identity follows. Every authored file is a default export of a `define*` helper.

Minimum agent = 2 files: `agent/agent.ts` + `agent/instructions.md`. If you omit `agent.ts`, eve defaults to `anthropic/claude-sonnet-4.6`.

The "agent is a directory" layout:

| Path | Slot |
|---|---|
| `agent/agent.ts` | runtime config (`defineAgent`) — model, compaction, modelOptions, experimental, outputSchema, build |
| `agent/instructions.md` (or `.ts`, or a directory of them) | always-on system prompt |
| `agent/tools/<name>.ts` | typed tool, filename = model-facing tool name |
| `agent/skills/<name>.md` | on-demand procedure, loaded only when relevant |
| `agent/connections/<name>.ts` | MCP or OpenAPI client; surfaced to model as `connection__<name>__<tool>` |
| `agent/subagents/<name>/agent.ts` | declared subagent (same shape, nested; `description` required) |
| `agent/channels/<name>.ts` | surface adapter (HTTP on by default; Slack, Discord, Teams, Telegram, Twilio, GitHub, Linear included) |
| `agent/schedules/<name>.ts` or `.md` | cron-triggered job; root-only |
| `agent/sandbox/sandbox.ts` + `sandbox/workspace/**` | override sandbox + seed files into `/workspace` |
| `agent/lib/**` | import-only shared code; never reaches the sandbox |
| `agent/hooks/**` | lifecycle/stream-event subscribers |
| `agent/instrumentation.ts` | OTel + AI SDK span config; root-only |
| `evals/<name>.eval.ts` | scored test suite; needs one `evals/evals.config.ts` |

`lib/` never enters the sandbox. `skills/` and `sandbox/workspace/**` do (mirrored under `/workspace`). Don't author `agent/sandbox/workspace/skills/...` — rejected as a collision.

## Quick start

```bash
npx eve@latest init my-agent        # scaffold + install + git init + start dev TUI
cd my-agent
# edit agent/agent.ts and agent/instructions.md
npm run dev                          # = eve dev
eve eval                             # run evals against local
eve deploy                           # = vercel deploy --prod (links first if needed)
```

Add eve to an existing project: `npx eve@latest init .` (deps added, `agent/` must not exist yet; pass `--channel-web-nextjs` only on a fresh scaffold).

**Required for first run**: `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` (from `vercel link`) for the default gateway-routed model. The dev TUI's `/model` flow walks you through pasting a key. Or use a direct provider model: `model: anthropic("claude-opus-4.8")` + `npm install @ai-sdk/anthropic` + `ANTHROPIC_API_KEY`.

## The `define*` cheat sheet

```ts
import { defineAgent } from "eve";
import { defineTool, defineDynamic, disableTool } from "eve/tools";
import { always, once, never } from "eve/tools/approval";
import { bash, readFile, writeFile, glob, grep, webFetch, webSearch, todo, loadSkill } from "eve/tools/defaults";
import { defineMcpClientConnection, defineOpenAPIConnection, defineInteractiveAuthorization, ConnectionAuthorizationRequiredError, ConnectionAuthorizationFailedError, isConnectionAuthorizationRequiredError } from "eve/connections";
import { defineChannel, GET, POST, PUT, PATCH, DELETE, WS } from "eve/channels";
import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, placeholderAuth } from "eve/channels/auth";
import { slackChannel, discordChannel, teamsChannel, telegramChannel, twilioChannel, githubChannel, linearChannel } from "eve/channels/<platform>";
import { defineHook } from "eve/hooks";
import { defineSchedule } from "eve/schedules";
import { defineSkill, defineDynamic } from "eve/skills";
import { defineInstructions, defineDynamic } from "eve/instructions";
import { defineState } from "eve/context";
import { defineSandbox, defaultBackend } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import { docker } from "eve/sandbox/docker";
import { microsandbox } from "eve/sandbox/microsandbox";
import { justbash } from "eve/sandbox/just-bash";
import { defineInstrumentation, isChannel } from "eve/instrumentation";
import { defineRemoteAgent } from "eve";
import { defineEval, defineEvalConfig } from "eve/evals";
import { includes, equals, matches, similarity } from "eve/evals/expect";
import { Braintrust, JUnit } from "eve/evals/reporters";
import { useEveAgent } from "eve/react";  // also: eve/vue, eve/svelte, eve/next, eve/nuxt, eve/sveltekit
import { Client, ClientSession } from "eve/client";
```

The exhaustive public surface is in `packages/eve/src/public/index.ts` of the repo — anything not re-exported there is internal.

## Tool shape

```ts
// agent/tools/refund.ts → model-visible tool "refund"
import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Refund a charge.",                    // written for the model
  inputSchema: z.object({ chargeId: z.string() }),     // Zod | Standard Schema | plain JSON Schema
  needsApproval: always(),                             // or once() / never() / ({ toolInput }) => boolean
  outputSchema: z.object({ ok: z.boolean() }).optional(),
  toModelOutput: (out) => ({ type: "text", value: `refund ${out.ok ? "ok" : "failed"}` }),
  async execute(input, ctx) {
    // ctx.session, ctx.getSandbox(), ctx.getSkill(id), ctx.getToken(), ctx.requireAuth()
    return await refund(input);
  },
});
```

`execute` runs in the **app runtime** (full `process.env`, can import `lib/`) — NOT the sandbox. Eve never runs authored tools during discovery; only model-called tools execute. Completed steps don't re-run (eve replays the recorded result); interrupted steps DO re-run — **make side effects idempotent or gate them with approval**.

`toModelOutput` only affects what the model sees; channel event handlers and hooks still get the full `execute` return on `action.result` (so a Slack channel can render Block Kit the model never sees).

## Eval shape

```ts
// evals/weather/forecast.eval.ts → eval id "weather/forecast"
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "...",
  async test(t) {
    await t.send("Weather in Brooklyn?");
    t.completed();                                      // gate
    t.calledTool("get_weather");                        // gate
    t.check(t.reply, includes("Sunny"));                // gate
    t.judge.autoevals.closedQA("cites a source").atLeast(0.7);  // soft, gated under --strict
  },
});
```

Three assertion surfaces, all on the same `t`: run-level (`t.completed()`, `t.calledTool(name)`, `t.usedNoTools()`, `t.toolOrder([...])`), value-based (`t.check(value, assertion)`), and LLM-as-judge (`t.judge.autoevals.*` driven by `judge: { model }` in `evals.config.ts`).

Severity rides on the assertion: `.soft()` / `.gate()` / `.atLeast(0.7)`. `eve eval` exits 0/1/2 (pass / fail / config error). `--strict` promotes below-threshold soft scores to failures. Targets: local (`eve eval`) or remote (`eve eval --url https://<app>`).

## Subagents: two kinds

- **Built-in `agent` tool** — every agent gets one; the model calls it to delegate to a copy of itself. **Shares** the parent's sandbox and tools. Child file writes are immediately visible to the parent. Fresh conversation history.
- **Declared subagent** at `agent/subagents/<name>/agent.ts` — `description` is required (parent uses it to decide when to delegate). **Inherits nothing** from the root's authored slots; must re-author its own instructions/tools/connections/skills/sandbox. `schedules/` and `channels/` are root-only. `state` is never shared (built-in or declared).

Set `outputSchema` on the subagent tool call to run it in **task mode** (structured output, no parking). The parent packs the child's `message` with everything it needs; the child never sees the parent's history.

## Durable sessions — the load-bearing runtime

- Built on Vercel's open-source **Workflow SDK**. Every step checkpointed; session can park (durably suspend) and resume after a crash, a deploy, or a long pause.
- Deploys don't interrupt mid-task sessions — they finish on the version they started.
- Markdown `instructions.md` → static compose at build time. For dynamic content, use `defineInstructions` + `defineDynamic` from `eve/instructions` (resolves at runtime).
- `defineState` from `eve/context` — never shared across sessions, never shared across subagents.

## HTTP API (the integration surface)

`POST /eve/v1/session` creates a session, returns `continuationToken` + `x-eve-session-id` header. `GET /eve/v1/session/:id/stream` is the NDJSON event stream. The HTTP channel is on by default; the dev TUI is just a client over the same events, so `curl` / a test script / CI can drive the agent and check exactly what it did.

Dev-only: `POST /eve/v1/dev/schedules/:scheduleId` to fire a schedule on demand (`eve dev` doesn't run cron).

## Sandbox — four backends, one namespace

| Backend | Where it runs |
|---|---|
| `vercel()` | Vercel Sandbox (hosted) |
| `docker()` | local Docker (drives the `docker` CLI; override binary via `EVE_DOCKER_PATH`) |
| `microsandbox()` | local VM (macOS Apple Silicon, or glibc Linux + KVM) |
| `justbash()` | pure-JS interpreter fallback; no real binaries, no network isolation |
| `defaultBackend()` | auto-picks: Vercel on hosted → Docker → microsandbox → just-bash |

`/workspace` is one namespace across backends. Authored code gets a live handle via `ctx.getSandbox()`. `sandbox.id` is stable per session and safe as a cache key for per-session state that must outlive individual step executions.

**Lifecycle hooks on `defineSandbox`**: `bootstrap({ use })` runs once when the template is built (clone repo, install deps, seed files); `onSession({ use, ctx })` runs once per session (network policy, per-user creds, per-session setup). Use `revalidationKey: () => string` to force template rebuilds when external inputs change.

**Network policy** is critical for production. Defaults to `allow-all`. Set `"deny-all"` or an explicit `allow: ["ai-gateway.vercel.sh", "*.github.com"]` allow-list on the backend factory and/or in `onSession`. `vercel()` and `microsandbox()` support credential brokering (inject auth headers at the firewall so secrets never enter the sandbox process).

Built-in sandbox tools (target `/workspace`): `bash`, `read_file`, `write_file`, `glob`, `grep`. Disable one with `disableTool(bash)` from `eve/tools`.

## Things that ship in the box (the "batteries")

1. **Durable execution** (Workflow SDK) — checkpoints, parks, resumes, crash-safe.
2. **Sandboxed compute** — per-agent bash, swappable backend.
3. **Human-in-the-loop** — `needsApproval` per tool; `always`/`once`/`never` helpers.
4. **Connections** — MCP + OpenAPI, file-based; model never sees URL or creds; `connect()` from `@vercel/connect/eve` for interactive OAuth; `defineInteractiveAuthorization` for self-hosted OAuth.
5. **Channels** — same agent across surfaces; cross-channel handoff supported.
6. **Tracing + evals** — OTel spans (`ai.eve.turn → ai.streamText → ai.toolCall`); exports to Braintrust / Honeycomb / Datadog / Jaeger; Agent Runs tab in Vercel Observability.

## The Vercel-lock-in tax (the central design choice)

The whole story assumes Vercel primitives: **AI Gateway + Workflows + Sandbox + Connect + Observability**. Multi-platform support is explicitly "on the way." If you want platform-agnostic, **Mastra** (TS, YC-backed, 1.0 in Jan 2026) is the alternative. Other named peers: LangGraph (Python), Inngest AgentKit, Cloudflare Workers + Durable Objects, AWS Bedrock AgentCore, Vertex AI Agent Engine, MS Agent Framework, OpenAI AgentKit.

`eve build && eve start` is the "self-hostable" path (Nitro-served, with schedule runner), but custom hosting platforms that only serve HTTP won't fire cron jobs automatically.

## What to read first

When a question comes up about eve, the docs I trust:
- `beta.eve.dev/docs` (index) — `introduction`, `tutorial/first-agent`
- `agent-config` — `defineAgent` fields
- `tools` — `defineTool`, `needsApproval`, `toModelOutput`, `ctx`
- `connections` — MCP/OpenAPI, Vercel Connect OAuth, `defineInteractiveAuthorization`
- `sandbox` — backends, lifecycle, network policy, credential brokering
- `subagents` — built-in `agent` tool vs declared
- `schedules` — markdown vs handler form, dev dispatch route
- `evals/overview` — `t` context, assertion surfaces, soft vs gate
- `reference/cli` — `eve init/info/build/start/dev/link/deploy/eval/channels`
- `reference/typescript-api` — full `define*` import map
- `reference/project-layout` — slot table, root vs subagent boundary, what reaches the workspace

Local in-package docs: once `eve` is installed, full docs are bundled at `node_modules/eve/docs` — so a coding agent can read them offline.

## Caveats to remember

- **Public preview / beta** — APIs, docs, behaviour will change before GA. Subject to Vercel beta terms.
- **Vercel-locked in practice** — the framework is Apache 2.0, but production-grade features are Vercel platform services.
- **Compaction is on by default** at `thresholdPercent: 0.9`. Lower to compact sooner.
- **`codeMode` is experimental** — routes executable tools through a sandboxed code-execution wrapper. May change or be removed.
- **Re-running interrupted steps** — make side effects idempotent or gate with approval.
- **Subagent names collide with tool names** — eve rejects the build rather than picking a winner.
- **Subagent delegation is NOT an approval boundary** — put sensitive tools behind `needsApproval` / connection approval / route auth, not just subagent isolation.
- **Defaults that bite** — `networkPolicy: "allow-all"`, persistence to `/workspace` (no TTL by default on Docker, 30-min idle on Vercel Sandbox).
