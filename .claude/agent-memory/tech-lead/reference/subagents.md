---
name: subagents
description: How Claude Code subagents work — built-in types (Explore/Plan/general-purpose), frontmatter spec, tool/MCP/permission scoping, hooks, memory, isolation, forks, nested subagents, and composition with skills.
metadata:
  type: reference
---

# Subagents

Subagents are **specialized AI assistants that run in their own context window** with a custom system prompt, specific tool access, and independent permissions. Claude delegates to them when the task description matches the subagent's `description`. The whole point is **input isolation** — the verbose output stays in the subagent, only the summary returns to your main conversation.

## When to reach for a subagent vs main conversation

| Main conversation | Subagent |
|---|---|
| Frequent back-and-forth, iterative refinement | Verbose output you don't need in main context |
| Multi-phase work sharing context (plan → impl → test) | Need to enforce specific tool restrictions |
| Quick targeted change | Self-contained work that returns a summary |
| Latency matters (subagent starts fresh, needs time to gather context) | OK with spawn overhead |

**Tip:** for a question already answerable from main context, use `/btw` instead — sees your full context, no tools, answer discarded not added to history.

## Built-in subagents

Always registered in interactive sessions. Override scope with `permissions.deny: ["Agent(Explore)"]` to block specific types. Disable all with `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` in non-interactive / SDK mode.

| Agent | Model | Tools | Purpose |
|---|---|---|---|
| **Explore** | Haiku | Read-only (no Write/Edit) | Fast codebase search, file discovery. Used by main thread for lookups. |
| **Plan** | inherits | Read-only | Plan-mode research. Reads code without modifying it. |
| **general-purpose** | inherits | All tools | Complex multi-step tasks with both exploration and modification. |
| **statusline-setup** | Sonnet | specialized | `/statusline` configuration |
| **claude-code-guide** | Haiku | specialized | Questions about Claude Code features |

**Hardcoded quirk:** Explore and Plan **skip your CLAUDE.md files and the parent's git status** to stay fast and cheap. No frontmatter field or per-agent setting changes this. The main conversation reads their output with full CLAUDE.md context, so most rules don't need to reach the subagent itself. If a rule must reach the subagent (e.g. "ignore vendor/"), restate it in the delegation prompt.

## File structure & scopes

Subagent files are **Markdown with YAML frontmatter**. Body = system prompt. Subagent files are loaded at session start; restart to load edits. `/agents` interface edits take effect immediately.

### Scope priority (high → low)

| Location | Scope | Priority |
|---|---|---|
| Managed settings `.claude/agents/` | Org-wide | 1 |
| `--agents` CLI flag (JSON) | Current session | 2 |
| `.claude/agents/` walked up to repo root | Current project | 3 |
| `~/.claude/agents/` | All your projects | 4 |
| Plugin's `agents/` | Where plugin enabled | 5 |

`.claude/agents/` is recursively scanned → organize into subfolders (e.g. `agents/review/`, `agents/research/`). **Subfolder path is NOT in the scoped name** for project/user scope — identity comes only from the `name` field. Plugin subfolders ARE in the scoped name: `my-plugin:review:security`.

Project agents via `--add-dir` directories are also loaded. Duplicate `name` across files in one scope → one is silently discarded.

## Frontmatter fields

Only `name` and `description` are required. Hooks receive `name` as `agent_type`.

| Field | Notes |
|---|---|
| `name` | Unique, lowercase + hyphens. Filename doesn't need to match. |
| `description` | When Claude should delegate. Include "use proactively" for auto-delegation. |
| `tools` | Allowlist. Omit `Skill` to block skill invocation. Use `Agent(a, b)` to restrict nested spawning (main thread only). |
| `disallowedTools` | Denylist. Accepts MCP server patterns: `mcp__github`, `mcp__*`. |
| `model` | Alias (`sonnet`/`opus`/`haiku`/`fable`), full ID, or `inherit` (default). |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`. Ignored for plugin subagents. |
| `maxTurns` | Cap agentic turns. |
| `skills` | Preload full skill content into context at startup. Subagent can still invoke unlisted skills via Skill tool. |
| `mcpServers` | Inline definitions (scoped to this subagent) OR name refs (share parent connection). Ignored for plugins. |
| `hooks` | Lifecycle hooks scoped to this subagent. Ignored for plugins. |
| `memory` | `user` / `project` / `local` — enables persistent cross-session memory. |
| `background` | `true` = always run as background task. |
| `effort` | `low` / `medium` / `high` / `xhigh` / `max`. Overrides session. |
| `isolation` | `worktree` = run in temp git worktree (cleaned up if no changes). |
| `color` | UI display color. |
| `initialPrompt` | Auto-submitted as first user turn when this agent runs as the main session agent. |

## Model resolution order

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var
2. Per-invocation `model` parameter
3. Subagent's `model` frontmatter
4. Main conversation's model

## Tools not available to subagents

These depend on main UI/session state — never inherit even if listed:
- `AskUserQuestion`
- `EnterPlanMode`
- `ExitPlanMode` (unless `permissionMode: plan`)
- `ScheduleWakeup`
- `WaitForMcpServers`

## Tool allowlist + denylist interaction

If both `tools` and `disallowedTools` are set: **denylist applied first**, then `tools` resolved against the remaining pool. A tool listed in both is removed.

## Restricting nested spawning

`Agent(worker, researcher)` syntax in `tools` is an **allowlist that ONLY applies when the agent runs as the main thread** (`claude --agent` or `agent` setting). In a subagent definition, listing `Agent` lets it spawn nested subagents, but the type list inside parentheses is **ignored** (any type permitted).

To block all spawning: omit `Agent` from `tools`. To block specific agents while allowing all: use `permissions.deny: ["Agent(Explore)"]` instead.

## MCP server scoping

- **Inline definition:** connects when subagent starts, disconnects when finishes. Tools not visible to parent.
- **String reference:** shares parent session's existing connection.

To keep an MCP server entirely out of main conversation context, **define it inline in the subagent** rather than in `.mcp.json`. The subagent gets the tools; the parent doesn't.

v2.1.153+: `--strict-mcp-config`, managed MCP config, and `allowedMcpServers`/`deniedMcpServers` policies all apply to subagent frontmatter. Managed-settings restrictions apply to every subagent regardless of source. `--strict-mcp-config` does NOT filter servers passed via `--agents` or SDK `agents` (explicit caller input).

## Permission mode precedence

| Parent mode | Subagent behavior |
|---|---|
| `bypassPermissions` or `acceptEdits` | Takes precedence, subagent cannot override |
| `auto` | Subagent inherits auto; frontmatter `permissionMode` ignored — same classifier evaluates tool calls |
| `default` | Subagent can override via `permissionMode` frontmatter |

`bypassPermissions` skips prompts but still prompts on: explicit `ask` rules, root and home directory removals like `rm -rf /`. Allows writes to `.git`, `.config/git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn` without prompting.

## Persistent memory

`memory` field gives subagent a persistent directory that survives across conversations.

| Scope | Location | Share |
|---|---|---|
| `user` | `~/.claude/agent-memory/<name>/` | All projects (user-private) |
| `project` | `.claude/agent-memory/<name>/` | Git-shared with team |
| `local` | `.claude/agent-memory-local/<name>/` | Local-only, not committed |

When enabled:
- System prompt includes memory directory instructions
- First 200 lines OR 25KB of `MEMORY.md` is included (whichever smaller)
- Read/Write/Edit tools auto-enabled so subagent manages its own memory

**Prompt the subagent explicitly:** "check your memory for patterns you've seen before" / "save what you learned". Build the knowledge base over time.

## Composition with skills

Two complementary mechanisms — **inverse operations**:

| Mechanism | Direction | Effect |
|---|---|---|
| Subagent `skills: [...]` | Agent → Skills | Subagent's system prompt + full skill content at startup |
| Skill `context: fork` | Skill → Agent | Skill content is injected into the specified agent's prompt |

Cannot preload skills with `disable-model-invocation: true` (they're not in the invocable set).

To block a subagent from invoking ANY skill: omit `Skill` from `tools` or add it to `disallowedTools`.

## Hooks on subagents

Two configuration surfaces:

**1. Frontmatter hooks** — fire only while the subagent is active:
```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks: [{type: command, command: "./scripts/validate.sh"}]
  PostToolUse:
    - matcher: "Edit|Write"
      hooks: [{type: command, command: "./scripts/lint.sh"}]
```
- `Stop` in frontmatter auto-converts to `SubagentStop` for subagent context
- All hook events supported

**2. settings.json hooks** — fire in main session on subagent lifecycle:
- `SubagentStart` — when subagent begins; matcher = agent type name
- `SubagentStop` — when subagent completes; matcher = agent type name

Hook input: JSON via stdin to hook command. Exit code 2 = block operation, message via stderr feeds back to Claude.

## Invocation

| Pattern | Syntax | Behavior |
|---|---|---|
| **Natural language** | `Use the test-runner subagent to fix failing tests` | Claude decides whether to delegate |
| **@-mention** | `@"code-reviewer (agent)" look at the auth changes` | Guarantees that subagent runs (one task) |
| **Session-wide** | `claude --agent code-reviewer` or `agent: code-reviewer` in settings.json | Main thread takes that subagent's prompt, tools, model |

@-mention controls which subagent Claude invokes, NOT what prompt it receives. Your full message still goes to Claude which writes the task prompt.

Plugin subagents appear as scoped names in typeahead: `my-plugin:code-reviewer`, `my-plugin:review:security`.

Session-wide `--agent` makes the subagent's system prompt **replace** the default CC system prompt (like `--system-prompt`). CLAUDE.md and project memory still load via the normal message flow. Persists on `--resume`.

## Foreground vs background

| Mode | Behavior | Permissions |
|---|---|---|
| **Foreground** | Blocks main conversation until done | Prompts pass through to user |
| **Background** | Concurrent, main conversation continues | Auto-denies any tool call that would prompt |

- Ctrl+B to background a running task mid-flight
- "run this in the background" to ask Claude
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables background entirely
- `CLAUDE_CODE_FORK_SUBAGENT=1` forces ALL spawns to background
- If background subagent fails on missing permission, restart as foreground for retry with interactive prompts

## Nested subagents (v2.1.172+)

- Subagent can spawn its own subagents
- **Depth limit: 5 levels below main** (fixed, not configurable). A subagent at depth 5 does NOT receive the Agent tool.
- Omit `Agent` from `tools` → cannot spawn any
- Fork cannot spawn fork (can spawn other types; counts toward depth)

## Forks — subagents with full context

A **fork** inherits the entire conversation so far instead of starting fresh. Same system prompt, tools, model, message history as main session. **Tool calls stay isolated, only final result returns.**

| | Fork | Named subagent |
|---|---|---|
| Context | Full conversation history | Fresh + delegation prompt |
| System prompt + tools | Same as main | From subagent file |
| Model | Same as main | From `model` field |
| Permissions | Prompts surface in terminal | Auto-deny in background |
| Prompt cache | **Shared with main** | Separate |

Shared prompt cache = **forking is cheaper than spawning a fresh subagent** when the task needs the same context.

`/fork <directive>` — manually start a fork (named from first words). `CLAUDE_CODE_FORK_SUBAGENT=1` enables Claude spawning forks automatically (default in v2.1.161+). `=0` disables everywhere including server-side rollout.

**Panel controls** below prompt for active forks: ↑↓ navigate, Enter open transcript, x dismiss/stop, Esc return to prompt.

When Claude spawns a fork via the Agent tool, it can pass `isolation: "worktree"` so edits land in a separate git worktree.

## Resume

Each invocation = new instance with fresh context. Resumed subagents retain full conversation history, tool calls, results, reasoning — pick up exactly where stopped.

- **Built-in Explore and Plan: one-shot**, return no agent ID, **cannot resume**
- Use `general-purpose` or custom subagent when resumption matters
- Resume via Claude's `SendMessage` tool with agent ID in `to` field (only when agent teams enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
- Or ask Claude naturally: "Continue that code review and now analyze authorization"
- Stopped subagent that receives `SendMessage` auto-resumes in background without new `Agent` invocation

**Transcripts:**
- Path: `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
- Main conversation compaction does NOT affect subagent transcripts (separate files)
- Within-session resume works after restarting CC by resuming the same session
- Auto-cleanup: `cleanupPeriodDays` setting (default 30)

## Auto-compaction

Subagents use the same compaction logic as main conversation. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` applies to subagents. Compaction events logged in transcript:

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "compactMetadata": {"trigger": "auto", "preTokens": 167189}
}
```

## Plugin restrictions

Plugin subagents **do NOT support** `hooks`, `mcpServers`, or `permissionMode`. These fields are silently ignored when loading from plugin. Workaround: copy agent file into `.claude/agents/` or `~/.claude/agents/`.

`permissions.allow` rules in `settings.json` apply to entire session, not just the plugin subagent.

## Disabling subagents

- Block specific: `permissions.deny: ["Agent(Explore)", "Agent(my-agent)"]`
- CLI: `claude --disallowedTools "Agent(Explore)"`
- Block all delegation: deny the `Agent` tool itself

## Sources

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-sdk/subagents

Related: [[skills-overview]], [[skills-frontmatter]], [[goals]]