# Eve Expert Agent Memory Index

## Project Memories
- [Issue-Triage Agent v1 Scaffold](project/issue-triage-agent-v1-scaffold.md) — `agent/` directory at repo root scaffolded 2026-06-24; locked authority model (autonomous type:/priority:/effort:, propose-only status:); cite this when iterating on the agent.
- [Agent workspace setup (2026-06-24)](project/agent-workspace-setup-2026-06-24.md) — pinned eve@^0.13.3 / ai@7.0.0-beta.178 (peer exact), Node 24 required for eve CLI, pre-existing scaffold TS errors surfaced
- [eve@0.13.3 tool → GitHub pattern (2026-06-24)](project/eve-0.13.3-tool-github-pattern-2026-06-24.md) — beta `ctx.github.request(...)` is gone; tools must use `ctx.getToken(provider)` + inline installation-token mint + `fetch`. The labeled-action re-triage trigger is not implementable.
