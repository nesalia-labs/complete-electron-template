# Vercel `eve` — Framework Orientation

> Senior-level orientation to Vercel `eve` (Apache 2.0, npm `eve`), an
> filesystem-first agent framework launched 2026-06-17. Public preview; APIs and
> behaviour will change before GA. Vercel-locked in production (the
> "batteries-included" story is the Vercel platform), platform-portable for
> self-hosted runs.

This folder collects what we learned while evaluating `eve` for our own use
(specifically a GitHub issue-triage agent — see `issue-triage.md`). It is **not**
an `eve` tutorial; the official docs at [beta.eve.dev/docs](https://beta.eve.dev/docs)
are. It is a set of design and architecture notes grounded in the public docs
and the `vercel-labs/eve-pr-triage-agent-template` reference implementation.

---

## 1. What `eve` is, in one sentence

`eve` is Vercel's "Next.js for agents": a TypeScript framework where an AI agent
is **a directory of files on disk**, and dropping a file in the right slot
wires it into a working agent — durable session, sandboxed compute, MCP /
OpenAPI connections, channels, approvals, evals, and deploy.

The single sharpest mental model: **identity comes from the path, never from a
field on the definition**. A tool at `agent/tools/get_weather.ts` is the tool
`get_weather`; a connection at `agent/connections/linear.ts` is the connection
`linear`. There is no registry to keep in sync.

---

## 2. When `eve` is the right tool

Strong fits:

- **Long-running, event-driven agents** that need to park on a human reply and
  resume after a deploy — durable sessions are the headline feature and they
  really are built in.
- **High-volume triage / classification** with a stable, well-defined surface —
  GitHub issue triage, PR review, support routing, lead scoring. The Vercel
  Labs PR-triage template is the worked example.
- **Multi-channel agents** that need the same brain behind Slack, Discord, a
  web chat, and a webhook — channels are first-class and one session can hand
  off across them.
- **Teams that already live on Vercel** and want a single platform for the
  agent runtime, the model gateway, OAuth (Connect), and the sandbox.

Weak fits / use a different tool:

- **Portable agents that must run on Cloudflare, AWS, or your own infra** —
  `eve` is Apache 2.0 but the production-grade features (Workflows, Sandbox,
  Connect, AI Gateway) are Vercel platform services. **Mastra** is the
  platform-agnostic TypeScript alternative. `eve build && eve start` is a
  self-hostable path, but custom HTTP-only hosts won't fire cron and the
  sandbox story is degraded.
- **Stateless one-shot LLM calls** — use the AI SDK directly. `eve` earns its
  keep when there's a session, a durable state, an approval, or a long pause.
- **Python-first teams** — `eve` is TypeScript. LangGraph or the
  Bedrock AgentCore path is more natural if Python is the lingua franca.

---

## 3. The framework in one diagram

```text
my-agent/
├── agent/                        # the directory IS the agent
│   ├── agent.ts                  # defineAgent — model + runtime config
│   ├── instructions.md           # the always-on system prompt
│   ├── tools/<name>.ts           # typed functions, run in the app runtime
│   ├── skills/<name>.md          # on-demand procedures (loadable)
│   ├── connections/<name>.ts     # MCP / OpenAPI clients
│   ├── subagents/<name>/         # declared child agents (same shape)
│   ├── channels/<name>.ts        # Slack, Discord, HTTP, custom...
│   ├── schedules/<name>.ts       # cron-triggered jobs
│   ├── sandbox.ts                # per-agent sandbox override
│   ├── lib/                      # import-only shared code
│   ├── hooks/                    # lifecycle / stream-event subscribers
│   └── instrumentation.ts        # OTel + AI SDK span config
├── evals/                        # scored test suites
│   ├── evals.config.ts
│   └── *.eval.ts
├── triage.yml                    # optional: project-specific policy (baked at build)
├── package.json
└── tsconfig.json
```

Minimum viable agent: `agent/agent.ts` + `agent/instructions.md`. Add files
when the agent needs more; do not centralize the wiring.

---

## 4. Doc index

Read in order when evaluating. Skip ahead when adopting.

| Doc | What it covers | Read it when... |
| --- | --- | --- |
| `README.md` | This file. Framework orientation, when to use, when not to. | You're deciding whether `eve` is the right tool. |
| `api.md` | The `define*` import map, the practical "how do I write a tool/connection/skill" reference, the CLI surface. | You're writing code. Keep it open. |
| `runtime.md` | Durable sessions, the sandbox backends, channels, schedules, evals, the deploy story. | You're choosing how the agent will run, where state lives, and how it deploys. |
| `prior-art.md` | What the Vercel Labs PR-triage template, the Vercel Labs content-agent template, and the Rust `triagebot` teach us. The patterns and the anti-patterns. | You want to learn from what already shipped instead of rediscovering. |
| `issue-triage.md` | The full design for a GitHub issue-triage agent grounded in the prior art, with the corrected slot table, the ruleset, the channel implementation, the evals, and the deploy sequence. | You're building the issue-triage agent — or any agent with a similar shape. |
| `monorepo.md` | How `eve` projects fit alongside our Electron + oRPC monorepo, including the integration seams (label taxonomy, oRPC-backed tools, where the agent lives). | You're deciding where the agent goes in this repo. |

---

## 5. Core references

External, in priority order:

- [`eve` docs](https://beta.eve.dev/docs) — the canonical reference. `introduction`, `tutorial/first-agent`, and the slot pages (`tools`, `connections`, `subagents`, `schedules`, `sandbox`, `evals/overview`, `channels/overview`) cover everything.
- [`vercel/eve` GitHub](https://github.com/vercel/eve) — the source, the public API surface in `packages/eve/src/public/index.ts`, and the per-version changelog.
- [`vercel-labs/eve-pr-triage-agent-template`](https://github.com/vercel-labs/eve-pr-triage-agent-template) — the gold-standard reference implementation for a webhook-driven agent. The issue-triage design in `issue-triage.md` is derived from this.
- [`vercel-labs/eve-content-agent-template`](https://github.com/vercel-labs/eve-content-agent-template) — the worked example of a multi-skill, multi-channel agent. `ARCHITECTURE.md` is required reading for the project-structure shape.
- [`vercel.com/blog/introducing-eve`](https://vercel.com/blog/introducing-eve) — the launch post; useful for the "what Vercel actually built it for" framing.
- [`rust-lang/triagebot`](https://github.com/rust-lang/triagebot) — eight-year-old, still in production. The contrast with `eve` (LLM-based, event-driven) is the lesson for the command surface.
- [`github/github-mcp-server`](https://github.com/github/github-mcp-server) — the first-party GitHub MCP server. The de facto integration target for any GitHub-shaped agent.
