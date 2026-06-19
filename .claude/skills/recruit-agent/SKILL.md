---
name: recruit-agent
description: Procedural recipe for proposing, drafting, and applying a new or modified agent definition. Use when considering creating a new agent, tightening an existing one, or auditing the .claude/agents/ fleet against the Hiring Standard.
when_to_use: Also triggers when work repeatedly delegates to general-purpose that should be specialized, when an existing agent's output quality drifts, or during periodic fleet audits.
allowed-tools: Read Glob Grep
---

# Recruit an Agent

Loading this skill means you've decided we need a new (or materially revised) agent. The procedure below codifies how to do that without breaking the Hiring Standard or skipping the user-approval gate.

## 1. Discovery — before drafting anything

Run these checks first. Skip them and you risk proposing an agent that already exists, or duplicating one with a tweak:

- **List project agents:** `Glob` for `**/README.md` under `.claude/agents/` (and `manifest.yaml` / `guides/` for context)
- **List user agents:** check `~/.claude/agents/` if relevant to the user's workflow
- **Read each existing agent's frontmatter** — name, description, tools, model, memory. Build a one-line summary per agent.
- **Check delegation anti-patterns** in recent transcripts or tasks: work repeatedly delegated to `general-purpose` that should be specialized. That repetition is the strongest signal a new agent is warranted.
- **Check built-ins** — Explore, Plan, general-purpose, statusline-setup, claude-code-guide. Don't reinvent these.

If an existing agent can handle the work with a brief tightening (e.g. clearer description, an added skill), propose that first. New agents are expensive — last resort, not first.

## 2. Need analysis — the "why hire"

Articulate the case. The user will ask these questions; pre-empt them:

- **Frequency** — daily / weekly / per-feature / one-off? If one-off, a skill or one-time brief is better than an agent.
- **Pain point** — what's the failure mode of NOT having this agent? Quality drift? Slow delegation? Wrong tool choices? Repeated prompting?
- **Adjacent options considered** — could a skill do it instead? A skill preloaded into an existing agent? A new section in an existing agent's README?
- **Cost** — agents consume tokens (description + system prompt loaded for every selection). Justify the cost.

If you can't articulate a concrete pain point with evidence, **don't recruit**. Skills are cheaper.

## 3. Scope design — the "what role"

Build the mission and boundaries. Reference the Hiring Standard in `.claude/agents/tech-lead/README.md` for the full template. Key fields:

- **Mission** — 2-3 sentences. What this agent exists to do.
- **When to use** — concrete triggers. What request makes this agent fire.
- **When NOT to use** — adjacent problems that look like this one but go elsewhere. This is the most important section for keeping the fleet non-overlapping.
- **Working principles** — how the agent thinks, what it optimizes for, what it refuses.
- **Output shape** — what "done" looks like.

## 4. Tooling & skills — the "what tools, what knowledge"

- **Tools allowlist** — minimum needed. Default to deny; grant what's required.
- **Disallowed tools** — anything dangerous for the role. Use MCP server patterns (`mcp__github`) or single tools (`Write`, `Bash`).
- **Skills to preload** — list each in frontmatter `skills:` with a one-line reason per skill in the body. Don't preload skills the agent won't use — costs context.
- **MCP servers** — if the role needs external integrations (GitHub, Slack, Postgres). Reference by name if shared with parent; inline if scoped.
- **Hooks** — for validation (PreToolUse), audit (PostToolUse), or constraint enforcement.
- **Model** — `inherited` (default), `sonnet` / `opus` / `haiku` / `fable`, or a full ID. Justify the choice.
- **Memory** — `user` / `project` / `local` / `none`. Project is the safe default for repo-shared agents.
- **Isolation** — `worktree` if the agent mutates files in parallel and would otherwise conflict with the main checkout.

## 5. Examples — the "what work looks like"

3-5 realistic request examples. For each:

- **Input** — the natural-language request a user would give
- **Expected response shape** — what the agent returns (format, length, key elements)
- **Knowledge/skills drawn on** — which preloaded skill makes this work

If you can't write 3 examples, the scope is too vague. Tighten the mission.

## 6. Approval gate — ALWAYS come back

Compose the **full job description** following the Hiring Standard (8 required body sections). Surface to the user with:

- Proposed name (kebab-case)
- One-line mission
- Why now (pain point + frequency)
- Scope boundaries (when to use / when NOT to use)
- Tools + skills + model + memory choices with reasons
- 3-5 examples
- Any proposed deletion or merge of existing agents

**WAIT for explicit approval** before writing to `.claude/agents/<name>/README.md`. The user is the hiring manager. The gate applies even for tightening existing agents, not just new ones.

If declined, save the draft in `.claude/agent-memory/tech-lead/reference/drafts/` with a short rationale so the work isn't lost.

## 7. Post-recruitment

Once approved and applied:

- **Update tech-lead README's Delegation Reference table** with the new agent (or modified row for an existing one)
- **Cross-link** from related memories if any
- **Run a brief audit** — does this new agent overlap with anything existing? Does it leave a gap?
- **Add to memory** any patterns learned (e.g. "we tend to over-specify agent permissions when X")

## Anti-patterns

- **Recruiting on a one-off task** — use a skill or a brief instead
- **Copy-pasting another agent's prompt** — re-derive the mission from the specific work
- **Granting all tools "just in case"** — costs context, expands attack surface
- **Skipping the approval gate** — agent definitions are durable and team-wide
- **Forgetting to update the delegation table** — the new agent becomes invisible to selection