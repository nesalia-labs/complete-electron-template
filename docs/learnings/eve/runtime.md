# `eve` — Runtime, Sandbox, Channels, Deploy

> The runtime story: how a session actually runs, where state lives, what
> the sandbox is for, how channels deliver messages, and how an agent goes
> from `npx eve@latest init` to production. Anchored in the public docs and
> the `vercel-labs/eve-pr-triage-agent-template` reference.

---

## 1. Durable sessions — the load-bearing runtime

Every conversation with an `eve` agent is a **durable session** built on
Vercel's open-source [Workflow SDK](https://vercel.com/blog/introducing-workflow).
This is the headline feature and it really is built in.

Concretely, a session can:

- **Stream progress** while work is happening (NDJSON event stream over
  `GET /eve/v1/session/:id/stream`).
- **Call tools and subagents** as the model requests them.
- **Pause for approval or a human answer** — durably suspend without
  consuming compute.
- **Resume after that answer arrives** — or after a crash, a deploy, or a
  long pause.
- **Keep durable state across turns** via `defineState`.

The mechanics: each step is checkpointed. A completed step never re-runs
(`eve` replays the recorded result). An interrupted step **does** re-run —
this is the load-bearing reason to make side effects idempotent or gate
them with `needsApproval`.

### Markdown vs dynamic instructions

Static `instructions.md` is composed at build time. For runtime-resolved
content, use `defineInstructions` plus `defineDynamic` from
`eve/instructions`:

```ts
import { defineInstructions, defineDynamic } from "eve/instructions";

export default defineInstructions({
  sources: [
    defineDynamic(async (ctx) => {
      const user = await ctx.session.auth.current;
      return user ? `Address the user as ${user.displayName}.` : "";
    }),
    import.meta.glob("./fragments/*.md", { query: "?raw", import: "default" }),
  ],
});
```

For most agents, the static `instructions.md` is enough. Reach for
`defineDynamic` only when the prompt needs session-scoped context (per-user
preferences, the current date, the active channel, etc.).

### Cross-turn state with `defineState`

`defineState` from `eve/context` is the per-session, durable scratchpad:

```ts
import { defineState } from "eve/context";

export default defineState(() => ({
  questionsAsked: 0,
  lastTopic: null as string | null,
}));
```

The state is keyed to the session. **It is never shared across sessions.**
**It is never shared across subagents** (for either kind — built-in copy or
declared). This is a load-bearing design decision: it forces per-session
isolation and keeps the agent from leaking context across user boundaries.

### Why "durable" matters in practice

The use cases this unlocks, beyond the obvious "session survives a crash":

- **Park on a long human reply** — the agent asks a question, parks, the
  human replies hours later, the same session resumes with the same
  context. No "we lost your place" UX.
- **Resumable cron output delivery** — a schedule hands off to a channel,
  the channel parks on a Slack reply, the cron task waits (`waitUntil`),
  the work settles, the task ends. (See `schedules` in `api.md`.)
- **Deploys that don't interrupt in-flight work** — a session mid-task
  when you push finishes on the version it started.

The OTel spans tell the story per turn: `ai.eve.turn → ai.streamText →
ai.toolCall`. Spans are standard OTel and export to Braintrust, Honeycomb,
Datadog, or Jaeger. The Vercel Observability dashboard has a dedicated
"Agent Runs" tab.

---

## 2. The sandbox — four backends, one namespace

The sandbox is the agent's isolated bash environment. `/workspace` is one
namespace across every backend — the same path points at the same file
whether the backend is local or hosted.

The default is a working sandbox with no authoring required. Override only
to add setup, seed files, pick a backend, or lock down the network.

### Built-in sandbox tools

Every agent gets these by default, all targeting `/workspace`:

| Tool | What it does |
| --- | --- |
| `bash` | run a shell command |
| `read_file` / `write_file` | read/write files under `/workspace` |
| `glob` | find files by pattern |
| `grep` | search file contents |

Disable any of them with `disableTool(name)` from `eve/tools`. **For a
read-only agent, disabling `bash` and `write_file` is the single highest-
leverage safety control.**

### The `ctx.getSandbox()` handle

Authored code (a tool, a step, a model callback) gets a live handle:

```ts
async execute({ script }, ctx) {
  const sandbox = await ctx.getSandbox();
  await sandbox.writeTextFile({ path: "analysis/run.py", content: script });
  const result = await sandbox.run({ command: "python analysis/run.py" });
  return { stdout: result.stdout };
}
```

Methods (every method takes paths relative to `/workspace` unless absolute):

| Method | Use |
| --- | --- |
| `run({ command })` | run one command, block until exit, return `{ stdout, stderr, ... }` |
| `spawn(options)` | launch a long-running process (server, watcher), return a `SandboxProcess` |
| `readTextFile` / `writeTextFile` | UTF-8 read/write; `readTextFile` supports 1-based line ranges |
| `readBinaryFile` / `writeBinaryFile` | raw bytes |
| `readFile` / `writeFile` | streaming read/write |
| `removePath({ path, force, recursive })` | delete one file or directory |
| `resolvePath(path)` | anchor a relative path to its absolute `/workspace/...` form |
| `setNetworkPolicy(policy)` | change egress policy mid-turn (backend-dependent) |

`run` blocks until the command exits; use `spawn` for processes that should
keep running while the agent does other work:

```ts
const server = await sandbox.spawn({ command: "python -m http.server 8000" });
// ...do other work against the server...
await server.kill();
```

`SandboxProcess` exposes `stdout`/`stderr` byte streams, `wait()`, and
`kill()` (idempotent).

`sandbox.id` is stable per session and safe as a cache key for per-session
state that must outlive individual step executions.

### Backends

| Backend | Where it runs |
| --- | --- |
| `vercel()` | Vercel Sandbox (hosted) |
| `docker()` | local Docker (drives the `docker` CLI; override binary with `EVE_DOCKER_PATH`) |
| `microsandbox()` | local VM (macOS Apple Silicon, or glibc Linux + KVM) |
| `justbash()` | pure-JS interpreter fallback; no real binaries, no network isolation |
| `defaultBackend()` | auto-picks: Vercel on hosted → Docker → microsandbox → just-bash |

`docker()` always requires a reachable Docker daemon. `vercel()` always
creates hosted sandboxes (including from local dev, with Vercel
credentials). `defaultBackend()` resolves on first use in the priority
order above.

### Authoring the sandbox

There are two layouts:

- `agent/sandbox.ts` — shorthand for "definition only, no seeded files."
- `agent/sandbox/sandbox.ts` + `agent/sandbox/workspace/**` — folder
  layout, also seeds files into `/workspace` at session start.

If both exist, the folder layout wins.

```ts
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

export default defineSandbox({
  backend: vercel({ runtime: "node24", resources: { vcpus: 2 } }),
  revalidationKey: () => "repo-bootstrap-v1",
  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({ command: "apt-get install -y jq" });
  },
  async onSession({ use, ctx }) {
    await use({ networkPolicy: "deny-all" });
    const user = ctx.session.auth.current;
    if (user) {
      await sandbox.writeTextFile({ path: "SESSION_USER.txt", content: user.principalId });
    }
  },
});
```

`bootstrap({ use })` runs once when the template is built. `onSession({ use,
ctx })` runs once per session. Use `revalidationKey` to force template
rebuilds when external inputs change (authored source and seed contents are
already tracked for you).

### Network policy

Critical for production. Defaults to `allow-all`. Three forms:

```ts
networkPolicy: "allow-all";
networkPolicy: "deny-all";

networkPolicy: {
  allow: ["ai-gateway.vercel.sh", "*.github.com"],
  subnets: { deny: ["10.0.0.0/8"] },
};
```

For non-public, sensitive, regulated, or production workloads, configure
`"deny-all"` or an explicit allow-list before running untrusted tools or
handling sensitive data.

**The common pattern** combines factory and `onSession`: leave the factory
open so `bootstrap` can `git clone`, then lock down in `onSession`. To
change mid-turn, call `sandbox.setNetworkPolicy(...)`.

**Credential brokering** — `vercel()` and `microsandbox()` support
injecting auth headers at the firewall, so secrets never enter the
sandbox process:

```ts
async onSession({ use }) {
  await use({
    networkPolicy: {
      allow: {
        "github.com": [{ transform: [{ headers: { authorization: "Basic your_base64_creds" } }] }],
        "*": [],
      },
    },
  });
}
```

The Docker backend honors only `"allow-all"` / `"deny-all"`. The just-bash
backend rejects `setNetworkPolicy` entirely.

### What reaches the workspace

`eve` does not mount the whole tree. Only two sources land in the sandbox
workspace:

- `skills/` → `/workspace/skills/...`
- `agent/sandbox/workspace/**` → `/workspace/...` at session bootstrap

Everything in `lib/` stays import-only. Authoring
`agent/sandbox/workspace/skills/...` is rejected as a collision.

### When to skip the sandbox entirely

If the agent never needs bash or filesystem access (a webhook-driven
classifier, a router agent, a notification bot), the sandbox is pure
cost — a provisioned VM per session. The
`vercel-labs/eve-pr-triage-agent-template` reference overrides
`turn.started` to **skip the default sandbox checkout**:

```ts
// agent/channels/github.ts
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

export default githubChannel({
  onPullRequest: (ctx, pr) =>
    pr.action === "opened" ? { auth: defaultGitHubAuth(ctx) } : null,
  events: {
    "turn.started": async (_data, channel) => {
      try { await channel.thread.react("eyes"); } catch {}
    },
  },
});
```

Supplying a `turn.started` handler **replaces** the built-in — the default
also drops a reaction AND checks out the repo into a sandbox. Override
replaces both, and we keep the reaction (it's harmless) while skipping the
checkout (it's pure cost). The PR-open path never reads the repo on disk;
the diff is auto-injected by dispatch.

**For a read-only issue-triage agent, the same pattern applies** — the
agent never needs to clone, and skipping the checkout saves a sandbox VM
per issue.

---

## 3. Sessions, runs, and the HTTP API

The HTTP channel is on by default. It's the integration surface — every
other channel eventually calls into the same HTTP API.

```bash
# Start a session
curl -X POST http://127.0.0.1:3000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"What is the weather in Brooklyn?"}'
# → { "sessionId": "...", "continuationToken": "..." }, x-eve-session-id header

# Attach to the NDJSON stream
curl http://127.0.0.1:3000/eve/v1/session/<sessionId>/stream

# Send a follow-up
curl -X POST http://127.0.0.1:3000/eve/v1/session/<sessionId> \
  -H 'content-type: application/json' \
  -H "x-eve-continuation-token: <token>" \
  -d '{"message":"And tomorrow?"}'
```

The dev TUI is just a client over the same events, so `curl`, a test script,
or CI can drive the agent and inspect exactly what it did. **Evals drive
the same surface** — a passing eval means the agent booted, accepted a
request, and produced the result you asserted.

The `POST /eve/v1/dev/schedules/<scheduleId>` route is dev-only; it fires
a schedule on demand because `eve dev` doesn't run cron.

---

## 4. The GitHub channel — the worked example

The GitHub channel is the one used by the issue-triage design in
`issue-triage.md`. The reference implementation
(`vercel-labs/eve-pr-triage-agent-template`) gives us a complete shape:

```ts
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

export default githubChannel({
  onPullRequest: (ctx, pr) =>
    pr.action === "opened" ? { auth: defaultGitHubAuth(ctx) } : null,
  events: { "turn.started": /* see § 2 — skip the sandbox */ },
});
```

Three things this channel does:

1. **Verifies the webhook signature** — `x-hub-signature-256` against
   `GITHUB_WEBHOOK_SECRET`. Unsigned requests are rejected with `401`.
2. **Mints the installation token** for its own calls (via
   `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` env vars).
3. **Filters events** — `onPullRequest` returns `null` for non-opened
   actions, opting the agent OUT of `synchronize`, `reopened`, etc. The
   same `onIssue` filter pattern applies for the issue-triage agent.

`defaultGitHubAuth(ctx)` derives the session auth from the webhook payload
and stamps `auth.attributes` with the repo, issue/PR number, and
installation id. **Authored tools read these attributes to know which
issue they're acting on** — no re-passing context through tool arguments.

### Deploy ordering wrinkle

From the PR-triage reference, in big letters:

> The GitHub App's webhook URL needs the deployment URL, but the deployment
> doesn't need the App's credentials to exist first. So **deploy first, then
> create the App, then set the credentials and redeploy.**

This is not optional. A half-configured App with a 401-everything webhook
is the single most common first-deploy failure.

### Vercel Deployment Protection trap

> A GitHub webhook is unauthenticated from Vercel's point of view, so if
> the project sits behind **Vercel Deployment Protection** (Vercel
> Authentication / SSO), every delivery is rejected with `401` *before it
> reaches the agent*, and nothing happens.

Disable protection for the project, or every webhook is rejected with a
Vercel SSO HTML page (not the agent's own `401 unauthorized`).

### Required env vars (PR-triage reference)

```bash
# App ID (not secret)
printf '%s' '<APP_ID>' | vercel env add GITHUB_APP_ID production

# Webhook secret (interactive prompt — never in shell history)
vercel env add GITHUB_WEBHOOK_SECRET production

# Private key (pipe from file so newlines survive)
vercel env add GITHUB_APP_PRIVATE_KEY production < /path/to/app.private-key.pem
```

`GITHUB_WEBHOOK_SECRET` must be **byte-for-byte identical** to the value in
the App's Webhook secret field, or HMAC verification fails and every
delivery is rejected. The agent normalizes the key whether newlines are
real or escaped (`\n`).

---

## 5. Observability — the audit story

Every run emits OpenTelemetry spans. The hierarchy is:

```text
ai.eve.turn                      # one span per turn
├── ai.streamText                # the model call
│   └── ai.streamText.doStream
└── ai.toolCall                  # run_sql, with inputs and outputs
```

Spans are standard OTel and export to Braintrust, Honeycomb, Datadog, or
Jaeger. On Vercel, the same spans surface in **Agent Runs** under
Observability — one tab per session, drill-in per turn.

**This is the trust story for any agent that mutates state** (applies
labels, posts comments, closes issues, sends Slack messages). The team
must be able to replay any decision and see why the agent did what it did.
If they can't audit it, they won't trust it, and the work falls back to
humans. The OTel trace is not a nice-to-have.

Two related surfaces:

- `agent/instrumentation.ts` — root-only, configures the OTel exporter
  and AI SDK span settings. Auto-discovered and run before agent code.
- `agent/hooks/` — module-backed lifecycle and stream-event subscribers.
  Recursive directories supported.

---

## 6. Schedules and the deploy story

### Schedules in dev vs production

`eve dev` never fires schedules on their cron cadence. A built app served
with `eve start` does run production scheduled tasks. To trigger one while
iterating in dev, use the dispatch route (`POST /eve/v1/dev/schedules/...`).
The route is dev-only; production builds never mount it, and it needs no
auth since the dev server is local-only.

On Vercel, each schedule becomes a Vercel Cron Job. The expression is
written into `.vercel/output/config.json` and evaluated in UTC. Watch
execution history under Observability → Cron Jobs.

### Self-deployed hosts

`eve build && eve start` is the self-hostable path. The build registers
schedules as Nitro scheduled tasks. On Vercel, Nitro's Vercel preset wires
those task registrations into Vercel Cron for you. **Outside Vercel, the
standard path serves Nitro's Node output and starts Nitro's schedule
runner, so the tasks fire on their cron cadence while that process is
running.**

The gotcha is custom hosting: if you adapt the generated output to a
process manager, container platform, or Nitro preset that only serves HTTP
and does not start Nitro's scheduled task runner, the schedule definitions
still compile, but they will not fire automatically. In that case, run
`eve` through `eve start`, use a host that supports Nitro scheduled tasks,
or trigger the same work from your own scheduler through an authenticated
route, channel handoff, or application-specific job runner.

### The deploy sequence

For a webhook-driven agent, the reference sequence is:

1. `vercel link` (or `eve link`) — link the directory to a Vercel project,
   pull AI Gateway credentials into `.env.local`.
2. `vercel deploy --prod` (or `eve deploy`) — first deploy with no
   GitHub/App credentials. Note the production URL.
3. Disable Vercel Deployment Protection for the project.
4. Create the GitHub App with the production URL as the webhook URL. Set
   the webhook secret. Note the App ID.
5. Generate the App's private key. Download the `.pem`.
6. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
   on the Vercel project.
7. `vercel deploy --prod` — second deploy, with credentials.
8. Install the App on the target repo. Create any extra labels.
9. Open a test PR (or issue) and watch the agent fire.

**Trace.** The PR-open turn runs with **no sandbox provisioned**
(verified): `turn.started` → model step → `load_skill` → `apply_labels` →
`message.completed`, with no sandbox/checkout span. This is the
`turn.started` override at work: a diff-only triage never pays for a
sandbox.

---

## 7. Compaction, codeMode, and the unstable surface

A few things worth knowing that are easy to miss:

- **Compaction is on by default** at `thresholdPercent: 0.9`. Lower to
  compact sooner. Compaction summarizes older turns as you approach the
  context window — the model gets a fresher "now" at the cost of historical
  detail.
- **`codeMode` is experimental.** It routes executable tools through a
  sandboxed code-execution wrapper — the model writes JavaScript that
  calls the tools inside the sandbox. May change or be removed in any
  release; treat as unstable.
- **`externalDependencies` is a packaging control only.** It keeps
  selected packages as runtime dependencies in the hosted output. It does
  not authorize, configure, or review any third-party service those
  packages may call.
- **`outputSchema` is for task mode only.** Interactive conversation
  turns ignore it unless the client supplies a per-message schema. Set it
  on a subagent tool call to run the child in task mode (structured
  output, no parking).
