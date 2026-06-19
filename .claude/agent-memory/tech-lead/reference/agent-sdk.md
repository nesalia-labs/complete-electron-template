---
name: agent-sdk
description: Comprehensive reference for the Claude Agent SDK (@anthropic-ai/claude-agent-sdk and claude_agent_sdk) — programmatic Claude Code with query(), ClaudeAgentOptions, sessions, permissions, MCP, skills, subagents, and sandboxing.
metadata:
  type: reference
---

# Claude Agent SDK

The Claude Agent SDK is Claude Code as a library: the same tools, agent loop, and context management that power the CLI, exposed as Python and TypeScript packages (and a headless `claude -p` form). It is the production-grade path for CI/CD, automation, custom harnesses, batch processing, and any application that needs an autonomous Claude in its own process.

Two official packages:

- **TypeScript**: `npm install @anthropic-ai/claude-agent-sdk` (bundles a native CLI binary per platform as optional dep)
- **Python**: `pip install claude_agent_sdk` (Python 3.10+)

Authentication is via `ANTHROPIC_API_KEY` by default; also supports Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`), Vertex (`CLAUDE_CODE_USE_VERTEX=1`), and Azure Foundry (`CLAUDE_CODE_USE_FOUNDRY=1`). You may NOT offer claude.ai login to third-party products built on the SDK.

## API surface at a glance

| Concern | TypeScript | Python |
|---|---|---|
| One-shot query | `query({ prompt, options })` -> `AsyncGenerator<SDKMessage>` | `query(*, prompt, options)` -> `AsyncIterator[Message]` |
| Continuous conversation | `query()` + `continue: true` (no client object) | `ClaudeSDKClient` (async context manager) |
| Pre-warm subprocess | `startup()` -> `WarmQuery` | n/a |
| Custom MCP tools | `tool()` + `createSdkMcpServer()` | `@tool` decorator + `create_sdk_mcp_server()` |
| Session metadata | `listSessions`, `getSessionMessages`, `getSessionInfo`, `renameSession`, `tagSession` | `list_sessions`, `get_session_messages`, `get_session_info`, `rename_session`, `tag_session` |
| Inspect settings | `resolveSettings()` (alpha) | n/a |
| Custom transport | spawnClaudeCodeProcess callback | `Transport` ABC (low-level) |

The TypeScript SDK has no client object — pass `continue: true` on each subsequent call. The Python SDK provides `ClaudeSDKClient` which holds session state and supports `interrupt()`, `set_permission_mode()`, `set_model()`, `reconnect_mcp_server()`, etc.

## Full TypeScript example

```typescript
import { query, tool, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { appendFile } from "fs/promises";

// In-process MCP tool with Zod schema
const searchTool = tool(
  "search_docs",
  "Search internal documentation",
  { query: z.string(), limit: z.number().int().min(1).max(50).default(10) },
  async ({ query, limit }) => ({
    content: [{ type: "text", text: `Top ${limit} docs for: ${query}` }]
  }),
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const docsServer = createSdkMcpServer({
  name: "docs",
  version: "1.0.0",
  tools: [searchTool]
});

// Programmatic subagents
const agents: Record<string, AgentDefinition> = {
  "code-reviewer": {
    description: "Expert code reviewer. Use for quality and security reviews.",
    prompt: "You are a code review specialist. Identify security issues and suggest improvements.",
    tools: ["Read", "Grep", "Glob"],
    model: "sonnet"
  },
  "test-runner": {
    description: "Runs tests and analyzes output.",
    prompt: "You execute test suites and report results.",
    tools: ["Bash", "Read", "Grep"],
    model: "inherit"
  }
};

// Hook for audit logging
const logFileChange = async (input: any) => {
  const p = input?.tool_input?.file_path ?? "unknown";
  await appendFile("./audit.log", `${new Date().toISOString()}: ${input.hook_event_name} ${p}\n`);
  return {};
};

for await (const message of query({
  prompt: "Review this codebase for security issues and run the test suite",
  options: {
    cwd: "/path/to/project",
    settingSources: ["user", "project"],     // load ~/.claude, .claude/
    allowedTools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "Agent", "Skill"],
    agents,
    mcpServers: { docs: docsServer, playwright: { command: "npx", args: ["@playwright/mcp@latest"] } },
    systemPrompt: { type: "preset", preset: "claude_code", append: "Always cite file paths." },
    permissionMode: "acceptEdits",
    maxTurns: 50,
    maxBudgetUsd: 5.00,
    model: "claude-opus-4-6",
    fallbackModel: "claude-sonnet-4-6",
    thinking: { type: "adaptive" },
    effort: "high",
    skills: "all",
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [logFileChange] }]
    },
    env: { ...process.env, API_TIMEOUT_MS: "120000", CLAUDE_CODE_MAX_RETRIES: "2" },
    stderr: (d) => process.stderr.write(d)
  }
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log(block.text);
      if (block.type === "tool_use") console.log(`[tool] ${block.name}`);
    }
  }
  if (message.type === "result" && message.subtype === "success") {
    console.log(`\n[done] ${message.result}`);
    console.log(`[cost] $${message.total_cost_usd.toFixed(4)}`);
  }
}
```

## Full Python example

```python
import asyncio
from datetime import datetime
from claude_agent_sdk import (
    query, ClaudeAgentOptions, ClaudeSDKClient,
    AgentDefinition, HookMatcher, tool, create_sdk_mcp_server,
    AssistantMessage, TextBlock, ResultMessage,
)

# Audit-logging hook
async def log_tool(input_data, tool_use_id, context):
    tool = input_data.get("tool_name", "?")
    fp = input_data.get("tool_input", {}).get("file_path", "")
    with open("./audit.log", "a") as f:
        f.write(f"{datetime.now()}: {tool} {fp}\n")
    return {}

# In-process MCP tool
@tool("lookup_user", "Look up a user by id", {"user_id": str})
async def lookup_user(args):
    return {"content": [{"type": "text", text": f"User #{args['user_id']}"}]}

users_server = create_sdk_mcp_server(name="users", version="1.0.0", tools=[lookup_user])

# Programmatic subagents
AGENTS = {
    "code-reviewer": AgentDefinition(
        description="Code quality and security reviewer.",
        prompt="You are a security-focused reviewer.",
        tools=["Read", "Grep", "Glob"],
        model="sonnet",
    ),
    "test-runner": AgentDefinition(
        description="Runs and analyzes tests.",
        prompt="Execute tests and report failures.",
        tools=["Bash", "Read", "Grep"],
    ),
}

async def main():
    # One-shot query
    options = ClaudeAgentOptions(
        cwd="/path/to/project",
        setting_sources=["user", "project"],
        allowed_tools=["Read", "Grep", "Glob", "Bash", "Edit", "Write", "Agent", "Skill"],
        agents=AGENTS,
        mcp_servers={"users": users_server},
        system_prompt={"type": "preset", "preset": "claude_code", "append": "Always cite paths."},
        permission_mode="acceptEdits",
        max_turns=50,
        max_budget_usd=5.0,
        model="claude-opus-4-6",
        thinking={"type": "enabled", "budget_tokens": 20000},
        effort="high",
        skills="all",
        hooks={
            "PostToolUse": [HookMatcher(matcher="Edit|Write", hooks=[log_tool])],
        },
        env={"API_TIMEOUT_MS": "120000", "CLAUDE_CODE_MAX_RETRIES": "2"},
    )

    async for message in query(prompt="Audit this codebase", options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(f"Result: {message.result}")
            print(f"Cost: ${message.total_cost_usd:.4f}")

    # Continuous conversation with ClaudeSDKClient
    async with ClaudeSDKClient(options=options) as client:
        await client.query("Review the auth module")
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for b in msg.content:
                    if isinstance(b, TextBlock):
                        print(b.text)

        # Switch permission mode mid-session
        await client.set_permission_mode("dontAsk")

        # Interrupt a long task
        # await client.interrupt()

        await client.query("Now refactor the issues you found")
        async for msg in client.receive_response():
            print(msg)

asyncio.run(main())
```

## ClaudeAgentOptions — complete field reference

### Identity / session

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `prompt` | `prompt` | `string` or `AsyncIterable` | required | One-shot prompt or streaming user messages |
| `cwd` | `cwd` | `string` | `process.cwd()` | Working directory for the agent |
| `sessionId` | n/a | `string` | auto-gen | Pre-supplied UUID for the session |
| `resume` | `resume` | `string` | undefined | Session ID to resume |
| `resumeSessionAt` | n/a | `string` | undefined | Resume at specific message UUID |
| `continue` | `continue_conversation` | `boolean` | `false` | Resume the most recent session in cwd |
| `forkSession` | `fork_session` | `boolean` | `false` | When resuming, branch into a new session ID |
| `persistSession` | n/a | `boolean` | `true` | Write transcripts to disk |
| `enableFileCheckpointing` | `enable_file_checkpointing` | `boolean` | `false` | Enable `rewindFiles()` snapshots |
| `title` | n/a | `string` | undefined | Display title; `renameSession()` overrides |

### Tools and MCP

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `allowedTools` | `allowed_tools` | `string[]` | `[]` | Tools auto-approved without prompting |
| `disallowedTools` | `disallowed_tools` | `string[]` | `[]` | Tools to deny (bare names or scoped like `"Bash(rm *)"`) |
| `tools` | `tools` | `string[]` or `{type:"preset", preset:"claude_code"}` | undefined | Tool config; use preset for Claude Code defaults |
| `mcpServers` | `mcp_servers` | `Record<string, McpServerConfig>` or path | `{}` | MCP server configs (stdio, sse, http, sdk) |
| `strictMcpConfig` | `strict_mcp_config` | `boolean` | `false` | Ignore project/user .mcp.json and plugins |
| `toolAliases` | n/a | `Record<string,string>` | undefined | Map built-in tool names to MCP tool names |
| `toolConfig` | n/a | `ToolConfig` | undefined | Built-in tool behavior (e.g., AskUserQuestion.previewFormat) |

### Permissions

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `permissionMode` | `permission_mode` | `PermissionMode` | `"default"` | See permission modes below |
| `allowDangerouslySkipPermissions` | n/a | `boolean` | `false` | Required to use `bypassPermissions` |
| `canUseTool` | `can_use_tool` | `CanUseTool` | undefined | Custom permission callback |
| `permissionPromptToolName` | `permission_prompt_tool_name` | `string` | undefined | MCP tool name for permission prompts |

### Model and thinking

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `model` | `model` | `string` | CLI default | Alias (`"opus"`, `"sonnet"`, `"haiku"`, `"fable"`, `"inherit"`) or full ID |
| `fallbackModel` | `fallback_model` | `string` | undefined | Fallback if primary fails |
| `maxThinkingTokens` | `max_thinking_tokens` | `number` | undefined | Deprecated; use `thinking` |
| `thinking` | `thinking` | `ThinkingConfig` | adaptive for supported | `{type:"enabled", budget_tokens}` or `{type:"adaptive"}` or `{type:"disabled"}` |
| `effort` | `effort` | `EffortLevel` | model default | `"low"`/`"medium"`/`"high"`/`"xhigh"`/`"max"` |
| `betas` | `betas` | `SdkBeta[]` | `[]` | Beta features (e.g. `context-1m-2025-08-07`, retired April 2026) |
| `taskBudget` | n/a | `{total:number}` | undefined | Alpha. API-side token budget pacing |

### System prompt and memory

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `systemPrompt` | `system_prompt` | `string` or preset object | undefined | `"You are..."` or `{type:"preset", preset:"claude_code", append?, excludeDynamicSections?}` |
| `settingSources` | `setting_sources` | `("user"|"project"|"local")[]` | all | Which filesystem settings to load |
| `settings` | `settings` | `string` or `Settings` | undefined | Inline settings or path to settings file |
| `managedSettings` | n/a | `Settings` | undefined | Policy-tier settings from host |
| `additionalDirectories` | `add_dirs` | `string[]` | `[]` | Extra dirs Claude can access |

### Skills, subagents, plugins

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `skills` | `skills` | `string[]` or `"all"` or `[]` | undefined | Filter discovered skills; SDK adds `Skill` to `allowedTools` |
| `agents` | `agents` | `Record<string, AgentDefinition>` | undefined | Programmatic subagents |
| `agent` | n/a | `string` | undefined | Agent name to use as main thread (must be in `agents`) |
| `plugins` | `plugins` | `SdkPluginConfig[]` | `[]` | Load local plugins `{type:"local", path}` |
| `agentProgressSummaries` | n/a | `boolean` | `false` | Forward subagent progress as `task_progress.summary` |
| `forwardSubagentText` | n/a | `boolean` | `false` | Stream subagent text/thinking as assistant messages |

### Limits and budgeting

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `maxTurns` | `max_turns` | `number` | undefined | Cap on agentic turns |
| `maxBudgetUsd` | `max_budget_usd` | `number` | undefined | Stop when client-side cost estimate hits USD value |
| `abortController` | n/a | `AbortController` | new | Cancel in-flight operation |
| `maxBufferSize` | n/a | `number` | undefined | Stdout buffer cap (Py) |

### Hooks, output, runtime

| Field (TS) | Field (Py) | Type | Default | Purpose |
|---|---|---|---|---|
| `hooks` | `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | Lifecycle hooks |
| `includeHookEvents` | `include_hook_events` | `boolean` | `false` | Stream hook lifecycle messages |
| `includePartialMessages` | `include_partial_messages` | `boolean` | `false` | Stream `stream_event` deltas |
| `outputFormat` | `output_format` | `{type:"json_schema", schema}` | undefined | Validate final output against JSON schema |
| `sandbox` | `sandbox` | `SandboxSettings` | undefined | Bash sandboxing, network/fs limits |
| `planModeInstructions` | n/a | `string` | undefined | Custom plan-mode workflow body |
| `promptSuggestions` | n/a | `boolean` | `false` | Emit `prompt_suggestion` after each turn |
| `sessionStore` | `session_store` | `SessionStore` | undefined | External backend for cross-host resume |
| `sessionStoreFlush` | `session_store_flush` | `"batched"` or `"eager"` | `"batched"` | Flush cadence |
| `loadTimeoutMs` | n/a | `number` | `60000` | Alpha. `sessionStore.load()` timeout |
| `onElicitation` | n/a | callback | undefined | Handle MCP elicitation requests |
| `extraArgs` | `extra_args` | `Record<string,string\|null>` | `{}` | Pass-through CLI flags |
| `env` | `env` | `Record<string,string>` | inherited | Subprocess env (set `CLAUDE_AGENT_SDK_CLIENT_APP` for UA) |
| `executable` | n/a | `"bun"|"deno"|"node"` | auto-detect | JS runtime for the CLI subprocess |
| `executableArgs` | n/a | `string[]` | `[]` | Args to the JS runtime |
| `pathToClaudeCodeExecutable` | `cli_path` | `string` | bundled binary | Override CLI binary path |
| `spawnClaudeCodeProcess` | n/a | function | undefined | Spawn CLI in VM/container/remote |
| `debug` | n/a | `boolean` | `false` | CLI debug mode |
| `debugFile` | n/a | `string` | undefined | Write debug logs to file |
| `stderr` | `stderr` | callback | undefined | Capture subprocess stderr |
| `user` | `user` | `string` | undefined | User identifier |

### Permission modes (`PermissionMode`)

| Mode | Behavior |
|---|---|
| `"default"` | Standard; unmatched tools fall through to `canUseTool` |
| `"dontAsk"` | Deny anything not pre-approved by `allowedTools` / allow rules; `canUseTool` is never called |
| `"acceptEdits"` | Auto-approve Edit, Write, plus filesystem ops (`mkdir`, `rm`, `mv`, `cp`, `sed`, `touch`) inside cwd |
| `"bypassPermissions"` | Auto-approve all tools unless an explicit `ask` rule matches (use with caution; requires `allowDangerouslySkipPermissions: true`) |
| `"plan"` | Read-only exploration; file edits prompt via `canUseTool` regardless of allow rules |
| `"auto"` | TypeScript only. Model classifier approves/denies each call |

Note: `allowedTools` does NOT constrain `bypassPermissions` — only `disallowedTools`, `ask` rules, and hooks do.

## Message types

The Python `Message` and TypeScript `SDKMessage` unions include (key ones):

- **UserMessage / SDKUserMessage**: input from user or tool result. `parent_tool_use_id` ties tool results back to their tool call. `isSynthetic` marks loop-injected messages.
- **AssistantMessage / SDKAssistantMessage**: model response with `content: ContentBlock[]`. `error` is one of `authentication_failed`, `oauth_org_not_allowed`, `billing_error`, `rate_limit`, `overloaded`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `unknown`.
- **SystemMessage / SDKSystemMessage**: `subtype: "init"` carries `session_id`, `cwd`, `tools`, `mcp_servers`, `model`, `permissionMode`, `slash_commands`, `skills`, `plugins`, `claude_code_version`. In TS the session_id is a top-level field; in Py it lives at `SystemMessage.data["session_id"]`.
- **ResultMessage / SDKResultMessage**: end-of-turn. `subtype` is `"success"`, `"error_during_execution"`, `"error_max_turns"`, `"error_max_budget_usd"`, `"error_max_structured_output_retries"`. Carries `total_cost_usd`, `usage` (input/output/cache_creation/cache_read tokens), `modelUsage`, `permission_denials`, `num_turns`, `duration_ms`, `duration_api_ms`, `session_id`. Success arm also has `result`, `ttft_ms`, `ttft_stream_ms`, `structured_output`. Error arms have `errors: string[]`.
- **StreamEvent / SDKPartialAssistantMessage**: raw `BetaRawMessageStreamEvent` when `includePartialMessages` is true.
- **SDKCompactBoundaryMessage**: marks compaction with `{trigger: "manual"|"auto", pre_tokens}`.
- **SDKPluginInstallMessage**: `system/plugin_install` progress.
- **SDKPermissionDeniedMessage**: streamed auto-denial event (Claude Code v2.1.136+).
- **SDKTaskStartedMessage / SDKTaskProgressMessage / SDKTaskUpdatedMessage / SDKTaskNotificationMessage**: background-task lifecycle.
- **SDKHookStartedMessage / SDKHookProgressMessage / SDKHookResponseMessage**: hook lifecycle when `includeHookEvents` is true.
- **SDKStatusMessage / SDKLocalCommandOutputMessage / SDKAuthStatusMessage / SDKToolProgressMessage / SDKPromptSuggestionMessage / SDKAPIRetryMessage / SDKFilesPersistedEvent**: assorted loop events.
- **SDKMessageOrigin** (TS): provenance of a user message — `human`, `channel`, `peer`, `task-notification`, `coordinator`, `auto-continuation`.

Content blocks include `TextBlock`, `ToolUseBlock`, `ToolResultBlock`, `ThinkingBlock`, `ImageBlock`.

## Non-interactive mode (`claude -p`)

`claude -p "..."` is the headless CLI form of the Agent SDK. Same capability surface, no message objects. Add `--bare` to skip filesystem discovery (recommended for CI):

```bash
# Bare mode: no ~/.claude, no .claude, no plugins
claude --bare -p "Summarize this file" --allowedTools "Read"

# Structured JSON output with cost tracking
claude -p "Summarize" --output-format json | jq '.result, .total_cost_usd'

# JSON Schema validation
claude -p "Extract functions" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}}'

# Streaming NDJSON
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages

# Continue / resume
session_id=$(claude -p "Start review" --output-format json | jq -r '.session_id')
claude -p "Continue" --resume "$session_id"

# Pipe data (capped at 10MB as of v2.1.128)
cat build-error.txt | claude -p "explain this error" > output.txt
```

Key flags: `-p`/`--print`, `--bare`, `--output-format {text|json|stream-json}`, `--json-schema`, `--allowedTools`, `--permission-mode`, `--continue`, `--resume <id>`, `--append-system-prompt`, `--append-system-prompt-file`, `--mcp-config`, `--agents`, `--plugin-dir`, `--plugin-url`, `--settings`, `--include-partial-messages`, `--verbose`. Built-in commands requiring interactive UI (e.g. `/login`) are not available in `-p`.

## Session lifecycle

Sessions persist the conversation (not the filesystem). They live at `~/.claude/projects/<sanitized-cwd>/<uuid>.jsonl` (or `$CLAUDE_CONFIG_DIR/projects/...` if set). The cwd sanitization replaces every non-alphanumeric char with `-`, so `/Users/me/proj` becomes `-Users-me-proj`.

| API | Use case |
|---|---|
| Single `query()` | One-shot, no follow-up |
| `ClaudeSDKClient` (Py) / `continue: true` (TS) | Multi-turn chat in one process; SDK tracks session |
| `continue_conversation=True` / `continue: true` after restart | Resume most-recent session in cwd without an ID |
| `resume=<id>` | Resume a specific session (must match cwd) |
| `fork_session=True` / `forkSession: true` | Branch from a session into a new ID; original preserved |
| `persistSession: false` (TS) | In-memory only; cannot resume later. Py always persists. |

Resume across hosts: either copy the JSONL to the new host (cwd must match) or capture results into app state and pass into a fresh prompt.

`enableFileCheckpointing: true` + `rewindFiles(userMessageId, {dryRun?})` lets you roll back file changes to a prior user turn. Subagent transcripts persist independently and survive main-conversation compaction (default cleanup: 30 days via `cleanupPeriodDays`).

## Permissions in SDK

No user to prompt, so the SDK uses rules-based evaluation. Order (first match wins, but hooks always run first):

1. **Hooks** — can deny outright; returning `allow` does NOT skip deny/ask rules below
2. **Deny rules** — `disallowedTools` and settings.json `deny` rules; bare names remove the tool from Claude's context, scoped patterns like `"Bash(rm *)"` only deny matching calls
3. **Ask rules** — settings.json `ask` rules; fall through to `canUseTool` (or deny in `dontAsk`)
4. **Permission mode** — `bypassPermissions` approves everything; `acceptEdits` approves file ops; `plan` forces edits through `canUseTool`
5. **Allow rules** — `allowedTools` and settings.json `allow` rules
6. **canUseTool callback** — runtime decision (skipped in `dontAsk`)

Rule syntax:

- `allowedTools: ["Read", "Grep"]` — auto-approve listed tools; unlisted still fall through
- `disallowedTools: ["Bash"]` — remove `Bash` from context entirely
- `disallowedTools: ["Bash(rm *)"]` — keep `Bash` available, deny matching calls in every mode
- `disallowedTools: ["*"]` — remove every tool
- Allow globs require literal `mcp____<server>__*` prefix; `allowedTools: ["*"]` or `["mcp__*"]` is IGNORED with a warning

`canUseTool` callback signature:

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; suggestions?: PermissionUpdate[]; blockedPath?: string; decisionReason?: string; toolUseID: string; agentID?: string }
) => Promise<PermissionResult>;

type PermissionResult =
  | { behavior: "allow"; updatedInput?: ...; updatedPermissions?: PermissionUpdate[]; toolUseID?: string }
  | { behavior: "deny"; message: string; interrupt?: boolean; toolUseID?: string };
```

```python
async def can_use_tool(
    tool_name: str, input_data: dict, context: ToolPermissionContext
) -> PermissionResultAllow | PermissionResultDeny: ...
```

Returning `updated_permissions` with `localSettings` destination persists the rule to `.claude/settings.local.json` so the user is not prompted again. Subagents inherit `bypassPermissions`/`acceptEdits`/`auto` and CANNOT override per-agent.

## MCP in SDK

Two paths: file-based (`mcpServers` references configs loaded from disk) or inline (`McpStdioServerConfig`, `McpSSEServerConfig`, `McpHttpServerConfig`, or in-process `McpSdkServerConfig`).

```typescript
// Inline stdio
mcpServers: {
  github: { command: "npx", args: ["@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN } }
}

// In-process server with custom tools
const server = createSdkMcpServer({
  name: "workspace",
  version: "1.0.0",
  tools: [tool("bash", "Run shell", { cmd: z.string() }, async ({ cmd }) => ({ content: [{type:"text", text: await runShell(cmd)}] }))]
});
mcpServers: { workspace: server }
```

`McpSdkServerConfigWithInstance` (TS) / `McpSdkServerConfig` (Py) carries the live instance. `strictMcpConfig: true` (CLI flag `--strict-mcp-config`) ignores project `.mcp.json`, user settings, plugin MCP servers, and claude.ai connectors.

## Skills in SDK

Skills MUST live on the filesystem as `.claude/skills/<name>/SKILL.md`. Discovery goes through `settingSources`/`setting_sources`. The `skills` option is a filter (not a sandbox):

- Omitted -> all discovered skills enabled; `Skill` tool added to `allowedTools`
- `"all"` -> explicitly enable every discovered skill
- `["pdf", "docx"]` -> enable only these; `Skill` tool still available
- `[]` -> no skills exposed to the model

The Skill tool is added to `allowedTools` automatically when `skills` is set. If you also pass `tools` explicitly, include `"Skill"` in that list. Unlisted skills remain reachable via `Read` and `Bash` (the option is a context filter, not a sandbox).

The `allowed-tools` frontmatter field on `SKILL.md` is CLI-only and ignored by the SDK — control tool access via the main `allowedTools` option.

## Subagents in SDK

Three sources, in priority order:

1. Programmatic `agents` option (highest)
2. Filesystem `.claude/agents/<name>.md` (loaded at startup only)
3. Built-in `general-purpose` (always available via the `Agent` tool)

`AgentDefinition` fields:

| Field | Required | Notes |
|---|---|---|
| `description` | yes | When to use this subagent — Claude matches by description |
| `prompt` | yes | Subagent's system prompt |
| `tools` | no | Allowed tools; omit to inherit all |
| `disallowedTools` | no | Remove tools; supports `mcp__server`, `mcp__server__*`, `mcp__*` patterns |
| `model` | no | Alias or full ID; `"inherit"` uses parent model |
| `skills` | no | Preload skill names into subagent context |
| `memory` | no | `"user"`, `"project"`, or `"local"` memory source |
| `mcpServers` | no | Server names or inline configs |
| `initialPrompt` | no | Auto-submitted first user turn when run as main thread |
| `maxTurns` | no | Turn cap for this agent |
| `background` | no | Run as non-blocking background task |
| `effort` | no | Per-agent reasoning effort |
| `permissionMode` | no | Per-agent permission mode (cannot override inherited bypass/acceptEdits/auto) |

Include `Agent` in the parent's `allowedTools` so subagent invocations auto-approve. As of Claude Code v2.1.63, the tool name is `"Agent"` (was `"Task"`); old SDKs emit `"Task"`. Check both in code. As of v2.1.172, subagents can spawn subagents (foreground at any depth, background capped at depth 5).

Resuming a subagent: parse `agentId:` from the Agent tool result text, capture `session_id` from the result message, pass `resume: sessionId` plus the agent definition, then mention `agentId` in the next prompt.

For dozens to hundreds of agents, use the `Workflow` tool (TS SDK v0.3.149+, requires `Workflow` in `allowedTools`) to move orchestration into an out-of-context script.

## CLI vs SDK comparison

| Capability | CLI (`claude -p`) | TypeScript SDK | Python SDK |
|---|---|---|---|
| Run agent autonomously | yes | yes | yes |
| Async iteration over messages | no (NDJSON only) | yes (`AsyncGenerator<SDKMessage>`) | yes (`AsyncIterator[Message]`) |
| `claude -p` / headless mode | yes | n/a | n/a |
| `startup()` warm subprocess | n/a | yes | no |
| Custom tools in-process | no | yes (`tool()` + `createSdkMcpServer`) | yes (`@tool` + `create_sdk_mcp_server`) |
| `canUseTool` callback | no | yes | yes |
| Programmatic subagents | yes (`--agents <json>`) | yes (`agents` option) | yes (`agents` option) |
| Skills filter | yes | yes (`skills` option) | yes (`skills` option) |
| MCP servers | yes (`--mcp-config`) | yes (`mcpServers` option, inline or file) | yes (`mcp_servers` option) |
| Interactive `AskUserQuestion` | yes (TTY) | yes (via `canUseTool`) | yes (via `can_use_tool`) |
| `ClaudeSDKClient` multi-turn helper | n/a | n/a | yes |
| `continue: true` style auto-resume | n/a | yes | n/a (`continue_conversation: true`) |
| `forkSession` / `fork_session` | yes (`--fork-session`) | yes | yes |
| `rewindFiles` / `rewind_files` | n/a | yes (with `enableFileCheckpointing`) | yes |
| `persistSession: false` | n/a | yes (in-memory only) | n/a (always persists) |
| Custom transport | n/a | `spawnClaudeCodeProcess` | `Transport` ABC |
| `resolveSettings()` | n/a | yes (alpha) | no |
| External `sessionStore` | n/a | yes | yes |
| `applyFlagSettings()` mid-session | n/a | yes | no |
| `set_permission_mode()` mid-session | n/a | yes | yes |
| `set_model()` mid-session | n/a | yes | yes |
| `interrupt()` mid-session | n/a | yes | yes |
| `rewindFiles` mid-session | n/a | yes | yes |
| Custom runtime | n/a | `executable: "bun"|"deno"|"node"` | n/a |
| Cross-compiled single executable | n/a | yes (`extractFromBunfs`) | n/a |
| File checkpointing | CLI only flag | yes (`enableFileCheckpointing`) | yes |
| `--bare` mode (skip discovery) | yes | n/a (use `settingSources: []`) | n/a (use `setting_sources: []`) |
| Output format JSON Schema | yes (`--json-schema`) | yes (`outputFormat`) | yes (`output_format`) |
| Plugins | yes (`--plugin-dir`, `--plugin-url`) | yes (`plugins`) | yes (`plugins`) |
| Cost & usage tracking | yes (`--output-format json`) | yes (`ResultMessage`) | yes (`ResultMessage`) |
| Background tasks | yes | yes | yes |
| Brand requirements | "Claude Agent" / "Claude" (preferred) — NOT "Claude Code" | same | same |

## Common patterns

### CI/CD pipeline

```typescript
// .github/workflows/agent.yml
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const m of query({
  prompt: `Review this PR: ${process.env.PR_DIFF}`,
  options: {
    cwd: process.cwd(),
    settingSources: ["project"],
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "dontAsk",
    systemPrompt: { type: "preset", preset: "claude_code" },
    maxTurns: 10,
    maxBudgetUsd: 1.0
  }
})) {
  if (m.type === "result" && m.subtype === "success") process.stdout.write(m.result);
}
```

### Custom harness / chat app

```typescript
// Stream UI updates and accept user mid-session permissions
for await (const m of query({
  prompt: userMessageStream,
  options: {
    canUseTool: async (name, input, { signal, toolUseID, suggestions }) => {
      const approved = await showApprovalPrompt(name, input);
      if (!approved) return { behavior: "deny", message: "User declined", toolUseID };
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: suggestions, // persist allow rules
        toolUseID
      };
    },
    allowedTools: ["Read", "Edit", "Write", "Bash", "Agent", "Skill"],
    permissionMode: "default"
  }
})) {
  yield m; // pipe to client
}
```

### Batch processing

```typescript
const tasks = [...]; // list of bug reports
for (const task of tasks) {
  for await (const m of query({
    prompt: `Fix: ${task.description}`,
    options: {
      cwd: task.repoPath,
      allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob"],
      permissionMode: "acceptEdits",
      maxTurns: 20,
      maxBudgetUsd: 0.50
    }
  })) {
    if (m.type === "result") console.log(`${task.id}: ${m.subtype} $${m.total_cost_usd}`);
  }
}
```

### Parallel subagents

```typescript
for await (const m of query({
  prompt: "Run security-reviewer, performance-reviewer, and test-runner agents in parallel",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Bash", "Agent"],
    agents: {
      "security-reviewer": { description: "Security expert.", prompt: "...", tools: ["Read","Grep","Glob"], model: "opus" },
      "performance-reviewer": { description: "Performance expert.", prompt: "...", tools: ["Read","Grep","Glob"], model: "sonnet" },
      "test-runner": { description: "Test expert.", prompt: "...", tools: ["Bash","Read","Grep"], model: "haiku" }
    },
    permissionMode: "acceptEdits"
  }
})) {
  if (m.type === "assistant" && m.message.content.some((b:any) => b.type === "tool_use" && (b.name === "Agent" || b.name === "Task"))) {
    console.log("Subagent dispatched:", m.message.content.find((b:any) => b.name === "Agent" || b.name === "Task").input.subagent_type);
  }
}
```

### Test runner / custom harness

```typescript
const warm = await startup({ options: { maxTurns: 30 }, initializeTimeoutMs: 30000 });
// ...later, per test case
for await (const m of warm.query(testCase.prompt)) {
  // assert on m
}
warm.close();
```

### Resumable long-running analysis

```typescript
let sessionId: string | undefined;
for await (const m of query({ prompt: "Analyze the repo", options: { allowedTools: ["Read","Glob"] } })) {
  if (m.type === "system" && m.subtype === "init") sessionId = m.session_id;
}
// Process restart... later:
for await (const m of query({ prompt: "Continue", options: { resume: sessionId, allowedTools: ["Read","Edit","Write"] } })) {
  // ...
}
```

### Read-only audit agent (locked down)

```typescript
allowedTools: ["Read", "Grep", "Glob"],
permissionMode: "dontAsk",
disallowedTools: ["Bash", "Write", "Edit"] // defense in depth
```

### Plugin + MCP composition

```typescript
mcpServers: { docs: { command: "npx", args: ["@docs/mcp"] } },
plugins: [{ type: "local", path: "./plugins/internal-tools", skipMcpDiscovery: true }]
```

## Sandbox configuration

`SandboxSettings` (TS type) lets you program bash execution, network, and filesystem isolation. Read `code.claude.com/docs/en/sandbox-environments` and `code.claude.com/docs/en/agent-sdk/secure-deployment` for the full reference. In short:

- Bash sandboxing via `sandbox.bash`: regex/glob allowlist with command-scoped policy
- Network restrictions via `sandbox.network`: per-host or per-CIDR allowlist
- Filesystem limits via `sandbox.filesystem`: read-only paths, write allowlist, deny paths

Pass via `options.sandbox`. The CLI exposes equivalent settings under `.claude/settings.json` (e.g. `sandbox.enable`, `sandbox.network.allowDomains`).

## Token and cost tracking

Three layers:

1. **Per message**: `AssistantMessage.usage` carries `{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` for that response (TS: `message.usage`).
2. **Per turn**: `ResultMessage.usage` aggregates the whole turn; `modelUsage` breaks it down by model name with camelCase keys.
3. **Hard cap**: `maxBudgetUsd` stops the query when the client-side estimate reaches the threshold. Caveat: it's compared against `total_cost_usd`, which is itself an estimate — set with margin.

`output_format: {type: "json_schema", schema: ...}` constrains the final output to a JSON Schema. Useful for downstream parsers. Combined with structured output retries (subtype `error_max_structured_output_retries`).

## Error handling

Common error surfaces:

- **API errors**: bubble into `AssistantMessage.error` (`authentication_failed`, `oauth_org_not_allowed`, `billing_error`, `rate_limit`, `overloaded`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `unknown`). On final-result `subtype: "success"` with `is_error: true`, check `api_error_status` for the HTTP code and `result` for the error string.
- **Loop limits**: `ResultMessage.subtype` becomes `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`. Resume with the session ID and higher caps.
- **Mid-stream errors**: `subtype: "error_during_execution"`. Includes `errors: string[]`.
- **Permission denials**: `ResultMessage.permission_denials: SDKPermissionDenial[]` lists every denied tool call. Streamed denials arrive earlier as `SDKPermissionDeniedMessage` (v2.1.136+).
- **Stall / retry**: `SDKAPIRetryMessage` with `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, `error`. Subagent stalls abort after `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (default 600000ms) and surface to the parent with partial result.
- **Tool result retries**: `tool_use_result` blocks include `is_error` flag.

Retry tuning via `env` on `ClaudeAgentOptions`:

```typescript
env: {
  ...process.env,
  API_TIMEOUT_MS: "120000",                    // per-request (default 600000)
  CLAUDE_CODE_MAX_RETRIES: "5",                // default 10
  CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: "120000",
  CLAUDE_ENABLE_STREAM_WATCHDOG: "1",
  CLAUDE_STREAM_IDLE_TIMEOUT_MS: "300000"      // default 300000, clamped
}
```

Worst-case wall time is roughly `API_TIMEOUT_MS × (CLAUDE_CODE_MAX_RETRIES + 1)` plus backoff.

Interrupt a running query with `abortController.abort()` (TS) or `client.interrupt()` (Py, streaming mode only).

## TypeScript type cheat sheet

```typescript
// Core types
type Options; // query() config
type Query; // AsyncGenerator<SDKMessage, void> with methods
type WarmQuery; // from startup()
type SDKMessage; // union of all messages
type PermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions" | "auto";
type CanUseTool; // custom permission callback
type PermissionResult; // allow | deny
type AgentDefinition; // subagent config
type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>;
type SettingSource = "user" | "project" | "local";
type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfigWithInstance;
type McpSdkServerConfigWithInstance = { type: "sdk"; name: string; instance: McpServer };
type SdkPluginConfig = { type: "local"; path: string; skipMcpDiscovery?: boolean };
type SandboxSettings; // sandbox.bash, sandbox.network, sandbox.filesystem
type ThinkingConfig = ThinkingConfigAdaptive | ThinkingConfigEnabled | ThinkingConfigDisabled;
type HookEvent = "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "PostToolBatch" | "Notification" | "UserPromptSubmit" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStart" | "SubagentStop" | "PreCompact" | "PermissionRequest" | "Setup" | "TeammateIdle" | "TaskCompleted" | "ConfigChange" | "WorktreeCreate" | "WorktreeRemove" | "MessageDisplay";
type HookCallback; // (input, toolUseID, options) => Promise<HookJSONOutput>;
type HookCallbackMatcher = { matcher?: string; hooks: HookCallback[]; timeout?: number };
type SDKSessionInfo; // listSessions() result shape
type SessionStore; // external session backend
type ToolConfig = { askUserQuestion?: { previewFormat?: "markdown" | "html" } };

// Key SDKMessage variants
type SDKAssistantMessage = { type: "assistant"; uuid: UUID; session_id: string; message: BetaMessage; parent_tool_use_id: string | null; error?: SDKAssistantMessageError };
type SDKResultMessage = { type: "result"; subtype: "success" | "error_max_turns" | "error_during_execution" | "error_max_budget_usd" | "error_max_structured_output_retries"; session_id: string; total_cost_usd: number; usage: NonNullableUsage; modelUsage: { [modelName: string]: ModelUsage }; permission_denials: SDKPermissionDenial[]; ... };
type SDKSystemMessage = { type: "system"; subtype: "init"; session_id: string; cwd: string; tools: string[]; mcp_servers: {name:string;status:string}[]; model: string; permissionMode: PermissionMode; ... };
type SDKPermissionDeniedMessage = { type: "system"; subtype: "permission_denied"; tool_name: string; tool_use_id: string; agent_id?: string; decision_reason_type?: string; decision_reason?: string; message: string };
type SDKMessageOrigin = { kind: "human" } | { kind: "channel"; server: string } | { kind: "peer"; from: string; name?: string; senderTaskId?: string } | { kind: "task-notification" } | { kind: "coordinator" } | { kind: "auto-continuation" };
```

## Python type cheat sheet

```python
# Core
class ClaudeAgentOptions: ...  # dataclass; snake_case
class ClaudeSDKClient:
    async def query(self, prompt: str | AsyncIterable[dict], session_id: str = "default") -> None
    async def receive_messages(self) -> AsyncIterator[Message]
    async def receive_response(self) -> AsyncIterator[Message]
    async def interrupt(self) -> None
    async def set_permission_mode(self, mode: PermissionMode) -> None
    async def set_model(self, model: str | None = None) -> None
    async def rewind_files(self, user_message_id: str) -> None
    async def get_mcp_status(self) -> McpStatusResponse
    async def reconnect_mcp_server(self, server_name: str) -> None
    async def toggle_mcp_server(self, server_name: str, enabled: bool) -> None
    async def stop_task(self, task_id: str) -> None

# Subagent (camelCase — NOTE the inconsistency vs ClaudeAgentOptions)
@dataclass
class AgentDefinition:
    description: str
    prompt: str
    tools: list[str] | None = None
    disallowedTools: list[str] | None = None  # camelCase!
    model: str | None = None
    skills: list[str] | None = None
    memory: Literal["user","project","local"] | None = None
    mcpServers: list[str | dict[str, Any]] | None = None
    initialPrompt: str | None = None
    maxTurns: int | None = None
    background: bool | None = None
    effort: EffortLevel | int | None = None
    permissionMode: PermissionMode | None = None

# Permissions
PermissionMode = Literal["default","acceptEdits","plan","dontAsk","bypassPermissions"]
EffortLevel = Literal["low","medium","high","xhigh","max"]
SdkBeta = Literal["context-1m-2025-08-07"]  # retired April 30, 2026
SettingSource = Literal["user","project","local"]

CanUseTool = Callable[[str, dict[str, Any], ToolPermissionContext], Awaitable[PermissionResult]]
PermissionResult = PermissionResultAllow | PermissionResultDeny

@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict | None = None
    updated_permissions: list[PermissionUpdate] | None = None

@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False

@dataclass
class ToolPermissionContext:
    signal: Any | None = None
    suggestions: list[PermissionUpdate] = field(default_factory=list)
    blocked_path: str | None = None
    decision_reason: str | None = None
    title: str | None = None
    display_name: str | None = None
    description: str | None = None

@dataclass
class PermissionUpdate:
    type: Literal["addRules","replaceRules","removeRules","setMode","addDirectories","removeDirectories"]
    rules: list[PermissionRuleValue] | None = None
    behavior: Literal["allow","deny","ask"] | None = None
    mode: PermissionMode | None = None
    directories: list[str] | None = None
    destination: Literal["userSettings","projectSettings","localSettings","session"] | None = None

# MCP
McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig
McpStdioServerConfig = {"type"?: "stdio", "command": str, "args"?: list[str], "env"?: dict[str,str]}
McpSSEServerConfig = {"type": "sse", "url": str, "headers"?: dict[str,str]}
McpHttpServerConfig = {"type": "http", "url": str, "headers"?: dict[str,str]}
McpSdkServerConfig = {"type": "sdk", "name": str, "instance": Any}

# Plugins
SdkPluginConfig = {"type": "local", "path": str}

# Thinking
ThinkingConfig = ThinkingConfigAdaptive | ThinkingConfigEnabled | ThinkingConfigDisabled
ThinkingConfigAdaptive = {"type": "adaptive", "display"?: "summarized"|"omitted"}
ThinkingConfigEnabled = {"type": "enabled", "budget_tokens": int, "display"?: ...}
ThinkingConfigDisabled = {"type": "disabled"}

# Session metadata
def list_sessions(directory: str | None = None, limit: int | None = None, include_worktrees: bool = True) -> list[SDKSessionInfo]
def get_session_messages(session_id: str, directory: str | None = None, limit: int | None = None, offset: int = 0) -> list[SessionMessage]
def get_session_info(session_id: str, directory: str | None = None) -> SDKSessionInfo | None
def rename_session(session_id: str, title: str, directory: str | None = None) -> None
def tag_session(session_id: str, tag: str | None, directory: str | None = None) -> None

# Messages
Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent | RateLimitEvent

@dataclass
class UserMessage:
    content: str | list[ContentBlock]
    uuid: str | None = None
    parent_tool_use_id: str | None = None
    tool_use_result: dict | None = None

@dataclass
class AssistantMessage:
    content: list[ContentBlock]
    model: str
    parent_tool_use_id: str | None = None
    error: AssistantMessageError | None = None
    usage: dict | None = None
    message_id: str | None = None

AssistantMessageError = Literal["authentication_failed","billing_error","rate_limit","invalid_request","server_error","max_output_tokens","unknown"]

@dataclass
class SystemMessage:
    subtype: str
    data: dict[str, Any]   # session_id lives here for subtype=="init"

@dataclass
class ResultMessage:
    subtype: Literal["success","error_during_execution","error_max_turns","error_max_budget_usd","error_max_structured_output_retries"]
    duration_ms: int
    duration_api_ms: int
    is_error: bool
    num_turns: int
    session_id: str
    stop_reason: str | None = None
    total_cost_usd: float | None = None
    usage: dict | None = None
    result: str | None = None
    structured_output: Any = None
    model_usage: dict[str, Any] | None = None
    permission_denials: list[Any] | None = None
    deferred_tool_use: DeferredToolUse | None = None
    errors: list[str] | None = None
    api_error_status: int | None = None
    uuid: str | None = None
```

Note: `ClaudeAgentOptions` uses snake_case (`max_turns`, `permission_mode`); `AgentDefinition` uses camelCase (`maxTurns`, `permissionMode`) to match the wire format. Passing snake_case to `AgentDefinition` raises `TypeError` at construction.

## Gotchas and tips

- Subagent tool name was `"Task"` before Claude Code v2.1.63; new SDKs emit `"Agent"`. Check both.
- On Windows, long subagent prompts (>8191 chars) may fail due to command-line length limits. Keep prompts concise or use filesystem-based agents.
- Setting `setting_sources=[]` in Python SDK <0.1.59 was treated as "omit" rather than "empty". Upgrade.
- The TypeScript SDK ships a native CLI binary per platform as an OPTIONAL dependency. If your package manager skips optional deps, set `pathToClaudeCodeExecutable` to a separately installed `claude` binary.
- `bun build --compile` can't `require.resolve` the bundled binary — use `extractFromBunfs()` and pass the extracted path.
- `allowedTools: ["*"]` and `["mcp__*"]` are ignored with a warning. Use scoped globs.
- `allowedTools` does NOT constrain `bypassPermissions` — use `disallowedTools` for hard blocks.
- Skills are a context filter, not a sandbox. Unlisted skills are reachable through `Read` and `Bash`.
- Subagents cannot override an inherited `bypassPermissions` / `acceptEdits` / `auto` mode.
- For subagent depth: foreground can nest arbitrarily; background capped at depth 5.
- Resume requires matching `cwd` (sanitized to `-` separators in session path).
- `total_cost_usd` is an estimate; set `maxBudgetUsd` with margin.
- Background Bash tasks in `claude -p` are terminated ~5s after the result returns and stdin closes (since v2.1.163).
- Piped stdin capped at 10MB since v2.1.128.
- Branding: products built on the SDK should use "Claude Agent" or "Claude", NOT "Claude Code" or its ASCII art.

## Sources

- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/skills
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/python
- https://code.claude.com/docs/en/agent-sdk/permissions
- https://code.claude.com/docs/en/agent-sdk/sessions
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/secure-deployment
- https://code.claude.com/docs/en/sandbox-environments

Related: [[skills-overview]], [[skills-frontmatter]], [[skills-invocation]], [[subagents]], [[workflows]], [[loops-and-scheduling]], [[goals]], [[orpc-bridge]], [[monorepo-structure]], [[ci-cd-patterns]]
