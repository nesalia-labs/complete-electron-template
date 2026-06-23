---
name: hooks
description: Claude Code lifecycle hooks — events, matchers, exit codes, stdin payloads, hook types (command/http/mcp_tool/prompt/agent), and where they're defined
metadata:
  type: reference
---

# Hooks

Hooks are user-defined shell commands, HTTP endpoints, MCP tool calls, LLM prompts, or agents that execute automatically at specific points in Claude Code's session lifecycle. The runtime sends JSON context to the hook and the hook communicates back through exit codes, stdout, or structured JSON. Hooks are deterministic — the model cannot bypass them — which makes them the right tool for guard rails, formatting, secret scanning, audit logging, and any rule that "must always happen" rather than "should usually happen".

This is the operational reference. For a quickstart with examples, see the upstream guide at `https://code.claude.com/docs/en/hooks-guide`.

## Mental model

Configuration has three levels of nesting:

1. **Hook event** — the lifecycle point (`PreToolUse`, `Stop`, etc.)
2. **Matcher group** — a filter that narrows when the event fires (e.g. only for `Bash` tools)
3. **Hook handler** — the actual command, HTTP endpoint, MCP tool, prompt, or agent that runs

A single event can have multiple matcher groups; a single matcher group can have multiple handlers. All matching handlers run **in parallel**; identical command handlers are deduplicated automatically (by `command + args` for command hooks, by URL for HTTP hooks).

## All hook events

Events fall into three cadences: once per session, once per turn, and inside the agentic loop on every tool call.

| Event | When it fires | Can block via exit 2? | Matcher |
| --- | --- | --- | --- |
| `SessionStart` | New session or `/resume`/`/continue` | No (stderr to user) | `startup`, `resume`, `clear`, `compact` |
| `Setup` | `claude --init-only`, `-p --init`, `-p --maintenance` | No | `init`, `maintenance` |
| `InstructionsLoaded` | CLAUDE.md / `.claude/rules/*.md` loaded into context (eagerly at start, lazy on subdirectory access) | No (exit code ignored) | `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` |
| `UserPromptSubmit` | User submits a prompt, before Claude processes it | Yes | no matcher |
| `UserPromptExpansion` | A `/command` expands into a prompt (covers path `PreToolUse` does not) | Yes | command name |
| `PreToolUse` | Before a tool call executes | Yes (with structured `permissionDecision`) | tool name |
| `PermissionRequest` | When a permission dialog is about to be shown | Yes (allow/deny) | tool name |
| `PermissionDenied` | Auto mode classifier denied a tool call | No (denial already happened; use `retry: true` to allow retry) | tool name |
| `PostToolUse` | After a tool call succeeds | No (tool already ran) | tool name |
| `PostToolUseFailure` | After a tool call fails | No | tool name |
| `PostToolBatch` | Once after all parallel tool calls resolve, before next model call | Yes (stops the agentic loop) | no matcher |
| `Notification` | Claude Code sends a notification | No | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_complete`, `elicitation_response` |
| `MessageDisplay` | While assistant message text streams to the screen | No (display-only) | no matcher |
| `SubagentStart` | A subagent is spawned | No | agent type (`Explore`, `general-purpose`, `Plan`, or custom name) |
| `SubagentStop` | A subagent finishes | Yes (with `decision: "block"` keeps subagent running) | agent type |
| `TaskCreated` | A `TaskCreate` call | Yes (exit 2 rolls back; `continue: false` stops teammate) | no matcher |
| `TaskCompleted` | A `TaskUpdate` completes a task | Yes (same as `TaskCreated`) | no matcher |
| `Stop` | Main agent finishes responding | Yes (prevents stop) | no matcher |
| `StopFailure` | Turn ended due to API error | No (output ignored) | error type (`rate_limit`, `overloaded`, etc.) |
| `TeammateIdle` | An agent-team teammate is about to go idle | Yes | no matcher |
| `ConfigChange` | A settings file changes during a session | Yes (except for `policy_settings`) | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| `CwdChanged` | Working directory changes (e.g. via `cd`) | No (returns `watchPaths` to update FileChanged watch list) | no matcher |
| `FileChanged` | A watched file changes on disk | No (returns `watchPaths`) | literal filenames to watch (split on `\|`) |
| `WorktreeCreate` | A worktree is being created via `--worktree` | Yes (any non-zero exit fails) | no matcher |
| `WorktreeRemove` | A worktree is being removed | No | no matcher |
| `PreCompact` | Before `/compact` or auto-compact | Yes | `manual`, `auto` |
| `PostCompact` | After compaction completes | No | `manual`, `auto` |
| `Elicitation` | An MCP server requests user input | Yes (denies the elicitation) | MCP server name |
| `ElicitationResult` | After user responds to MCP elicitation | Yes (action becomes `decline`) | MCP server name |
| `SessionEnd` | Session terminates | No | `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |

`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, and `CwdChanged` **do not support matchers** — if you add one, it is silently ignored. `FileChanged` matchers are literal filenames, not regex (despite using the same field syntax as other events).

## Hook types (handler kinds)

There are five handler types, each with different strengths:

| Type | What it does | Best for |
| --- | --- | --- |
| `command` | Runs a shell script. Receives JSON on stdin, returns via exit code + stdout/stderr | Anything deterministic and fast: guard rails, formatters, linters, loggers |
| `http` | POSTs JSON to a URL, reads response body for JSON output | Centralized validation services, internal policy engines |
| `mcp_tool` | Calls a tool on an already-connected MCP server | Reusing existing MCP tools for validation/audit |
| `prompt` | Sends a prompt to a fast Claude model (default Haiku) for a `{ok, reason}` decision | Fuzzy rules: "is this prompt asking for something off-limits?" |
| `agent` | Spawns a subagent with tool access (Read/Grep/Glob) for up to 50 turns, returns `{ok, reason}` | Verification that needs to inspect files or run code |

`SessionStart` and `Setup` only support `command` and `mcp_tool` (not `http`, `prompt`, or `agent`). All other events that support decisions support all five types.

## Exit code semantics

Three channels: exit code, stdout, stderr.

| Exit code | Meaning | What Claude Code does |
| --- | --- | --- |
| `0` | Success | Parses stdout as JSON if present. For most events, JSON output is required to control behavior |
| `2` | Blocking error | Ignores stdout entirely. **Stderr is fed to Claude** (or user) as the reason. Blocks the action where the event allows it |
| Other non-zero | Non-blocking error | Tool call (if applicable) fails. Stderr's first line is shown in the transcript as a `hook error` notice; full stderr is in the debug log |

Exit code `1` is treated as a generic non-blocking error and does **not** stop the action — even though it is the conventional Unix failure code. **To enforce a hard deny, always `exit 2`.**

Special case: `WorktreeCreate` blocks on any non-zero exit code. `StopFailure` ignores both exit code and output entirely.

### Exit 2 behavior per event (decision table)

| Event | On exit 2 |
| --- | --- |
| `PreToolUse` | Blocks the tool call |
| `PermissionRequest` | Denies the permission |
| `UserPromptSubmit` | Blocks prompt processing and erases the prompt |
| `UserPromptExpansion` | Blocks the expansion |
| `Stop` | Prevents Claude from stopping; conversation continues |
| `SubagentStop` | Prevents subagent from stopping |
| `TeammateIdle` | Teammate keeps working |
| `TaskCreated` | Rolls back task creation |
| `TaskCompleted` | Prevents task from being marked completed |
| `ConfigChange` | Blocks the change (except `policy_settings`) |
| `PostToolBatch` | Stops the agentic loop before next model call |
| `PreCompact` | Blocks compaction |
| `Elicitation` | Denies the elicitation |
| `ElicitationResult` | Action becomes `decline` |
| `WorktreeCreate` | Any non-zero aborts creation |
| `StopFailure`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Notification`, `SubagentStart`, `SessionStart`, `Setup`, `SessionEnd`, `CwdChanged`, `FileChanged`, `PostCompact`, `WorktreeRemove`, `InstructionsLoaded`, `MessageDisplay` | Stderr shown to user; no blocking effect |

`Stop` has a built-in protection: after **8 consecutive `block` returns**, Claude Code overrides the hook and ends the turn. The `stop_hook_active` field in the input is `true` once a stop hook has already continued the turn — check it to avoid infinite loops.

## JSON input via stdin

All command hooks receive JSON on stdin. The shape includes common fields plus event-specific fields.

**Common fields on every event:**

| Field | Description |
| --- | --- |
| `session_id` | Current session identifier |
| `transcript_path` | Path to conversation JSONL |
| `cwd` | Working directory at hook invocation |
| `permission_mode` | `"default"`, `"plan"`, `"acceptEdits"`, `"auto"`, `"dontAsk"`, or `"bypassPermissions"` (not all events) |
| `effort` | `{level: "low"\|"medium"\|"high"\|"xhigh"\|"max"}` for tool-use-context events |
| `hook_event_name` | The event that fired |
| `agent_id`, `agent_type` | Present when running inside a subagent or with `--agent` |

**Example PreToolUse input:**

```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

**Event-specific fields to remember:**

- `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PermissionRequest` / `PermissionDenied`: `tool_name`, `tool_input`, `tool_use_id`
- `UserPromptSubmit`: `prompt`
- `UserPromptExpansion`: `expansion_type`, `command_name`, `command_args`, `command_source`, `prompt`
- `Stop` / `SubagentStop`: `stop_hook_active`, `last_assistant_message`, `background_tasks` (array), `session_crons` (array)
- `SessionStart`: `source` (`startup`/`resume`/`clear`/`compact`), optionally `model`, `agent_type`, `session_title`
- `Notification`: `message`, optional `title`, `notification_type`
- `TaskCreated` / `TaskCompleted`: `task_id`, `task_subject`, optional `task_description`, `teammate_name`, `team_name`
- `PreCompact` / `PostCompact`: `trigger` (`manual`/`auto`), `custom_instructions` (PreCompact only) / `compact_summary` (PostCompact only)
- `CwdChanged`: `old_cwd`, `new_cwd`
- `FileChanged`: `file_path`, `event` (`change`/`add`/`unlink`)
- `ConfigChange`: `source`, optional `file_path`

`tool_input` schema depends on the tool. Common ones: `Bash` has `command`/`description`/`timeout`/`run_in_background`; `Write` has `file_path`/`content`; `Edit` has `file_path`/`old_string`/`new_string`/`replace_all`; `Agent` has `prompt`/`description`/`subagent_type`/`model`.

The `PostToolUse` input also includes `tool_response` (the tool's structured output) and `duration_ms`. `PostToolBatch` differs: its `tool_calls` array contains the **serialized** `tool_result` content the model sees, not the structured `Output` object — for `Read` that means line-number-prefixed text.

## JSON output and decision control

For richer control beyond blocking, exit `0` and print a JSON object to stdout. **You must choose one approach per hook** — either exit codes alone, or exit 0 + JSON. Claude Code only processes JSON on exit 0; if you exit 2, any JSON is ignored.

The JSON must be the only thing on stdout. A shell profile that prints text on startup (e.g. `echo "loading"`) will corrupt JSON parsing — use `2>/dev/null` or quiet login shells. Output strings are capped at 10,000 characters; longer strings are saved to a file and replaced with a preview + path.

### Universal fields (any event)

| Field | Default | Description |
| --- | --- | --- |
| `continue` | `true` | If `false`, Claude stops processing entirely. Takes precedence over event-specific decisions |
| `stopReason` | none | Shown to the user when `continue: false`. Not shown to Claude |
| `suppressOutput` | `false` | Hides hook stdout from transcript (still in debug log) |
| `systemMessage` | none | Warning message shown to the user |
| `terminalSequence` | none | Allowlisted terminal escape sequence (OSC 0/1/2/9/99/777 or BEL) — preferred way to fire desktop notifications since hooks have no `/dev/tty` |

### Per-event decision patterns

| Events | Pattern | Key fields |
| --- | --- | --- |
| `UserPromptSubmit`, `UserPromptExpansion`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `SubagentStop`, `ConfigChange`, `PreCompact` | Top-level `decision` | `decision: "block"`, `reason` |
| `TeammateIdle`, `TaskCreated`, `TaskCompleted` | Exit 2 or `continue: false` | Either blocks action; `continue: false` stops the teammate entirely |
| `PreToolUse` | `hookSpecificOutput` | `permissionDecision` (`allow`/`deny`/`ask`/`defer`), `permissionDecisionReason`, `updatedInput` (rewrites tool args), `additionalContext` |
| `PermissionRequest` | `hookSpecificOutput` | `decision.behavior` (`allow`/`deny`), `decision.updatedInput`, `decision.updatedPermissions`, `decision.message` |
| `PermissionDenied` | `hookSpecificOutput` | `retry: true` lets the model retry the denied call |
| `WorktreeCreate` | Path on stdout | `echo /absolute/path`; HTTP uses `hookSpecificOutput.worktreePath` |
| `Elicitation` / `ElicitationResult` | `hookSpecificOutput` | `action` (`accept`/`decline`/`cancel`), `content` (form values) |
| `MessageDisplay` | `hookSpecificOutput` | `displayContent` replaces on-screen text only — transcript is unchanged |
| `SessionStart`, `Setup`, `SubagentStart` | Context only | `hookSpecificOutput.additionalContext`; `SessionStart` also accepts `initialUserMessage`, `watchPaths`, `sessionTitle`, `reloadSkills` |
| `WorktreeRemove`, `Notification`, `SessionEnd`, `PostCompact`, `InstructionsLoaded`, `StopFailure`, `CwdChanged`, `FileChanged` | None | Side-effect only — logging, cleanup, notifications |

`PreToolUse` decision precedence when multiple hooks return different values: `deny` > `defer` > `ask` > `allow`. `PreToolUse.updatedInput` **replaces the entire input object**, so include unchanged fields alongside the modified ones.

**`additionalContext`** is the most useful universal primitive — string injected into Claude's context as a system reminder at the hook's position. Use it for:
- Environment state (current branch, deploy target, active feature flags)
- Conditional project rules (which test command applies to the file just edited)
- External data (open issues assigned, recent CI results)

For static instructions that never change, prefer `CLAUDE.md` (no script needed). Write context as **factual statements**, not imperative system commands — out-of-band imperative framing can trigger Claude's prompt-injection defenses and surface the text to the user instead.

## Configuration locations

Hooks can be defined in five scopes. Scope determines who they apply to and whether they are shareable:

| Location | Scope | Shareable | Gitignored by Claude? |
| --- | --- | --- | --- |
| `~/.claude/settings.json` | All your projects | No (local machine) | No |
| `.claude/settings.json` | Single project | Yes (commit it) | No |
| `.claude/settings.local.json` | Single project | No | **Yes** |
| Managed policy settings | Org-wide | Yes (admin) | No |
| Plugin `hooks/hooks.json` | When plugin is enabled | Yes (bundled) | No |
| Skill / agent YAML frontmatter | While the component is active | Yes (in the file) | No |

Enterprise admins can set `allowManagedHooksOnly` to block user/project/plugin hooks. Plugin hooks force-enabled in managed `enabledPlugins` are exempt from that block.

Direct edits to settings files are normally picked up by the file watcher. To disable all hooks temporarily, set `"disableAllHooks": true` — this respects the managed settings hierarchy, so managed hooks survive a `disableAllHooks` set at the user/project level.

### Frontmatter form (skills, agents, subagents)

Hooks in skill/agent frontmatter use the same shape as settings hooks but are scoped to the component's lifetime and cleaned up when it finishes. For subagents, `Stop` hooks are auto-converted to `SubagentStop`.

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

Skills also honor the `once: true` field on a hook — it runs once per session then is removed. **Settings files and agent frontmatter ignore `once`** (skill-frontmatter only).

## Matcher patterns

The `matcher` field's evaluation depends on its characters:

| Matcher value | Evaluated as | Example |
| --- | --- | --- |
| `"*"`, `""`, omitted | Match all | fires on every event occurrence |
| Only letters, digits, `_`, `\|` | Exact string or `\|`-separated list | `Bash`, `Edit\|Write`, `mcp__memory__.*` becomes a regex because of `.` and `*` |
| Contains any other char | JavaScript regex | `^Notebook`, `mcp__.*__write.*` |

**MCP tools** are `mcp__<server>__<tool>`. To match every tool from a server, append `.*` — required, since a bare `mcp__memory` is an exact string and matches no real tool. Examples:
- `mcp__memory__.*` — all tools from the memory server
- `mcp__.*__write.*` — any tool starting with `write` from any server

**`if` field on individual handlers** uses permission-rule syntax, only on tool events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`). It matches tool name + arguments together:
- `"Bash(git *)"` — runs on any `git …` subcommand
- `"Edit(*.ts)"` — runs only for TypeScript files

`if` is **a single rule only** — no `&&`/`||`/lists. For multiple conditions, define multiple handlers. The filter is best-effort and fails open on unparseable Bash commands, so use the permission system (not a hook) to enforce hard allow/deny.

For Bash, leading `VAR=value` assignments are stripped before matching, and `$()`/backtick subshells are inspected:

| `if` pattern | Bash command | Match? | Why |
| --- | --- | --- | --- |
| `Bash(git *)` | `FOO=bar git push` | yes | leading assignment stripped |
| `Bash(git *)` | `npm test && git push` | yes | each subcommand checked |
| `Bash(rm *)` | `echo $(rm -rf /)` | yes | `$()` subshells are checked |
| `Bash(rm *)` | `echo $(date)` | no | no subcommand matches |
| `Bash(git push *)` | `echo $(date)` | yes | patterns with more than the command name always run on `$()`/backticks/`$VAR` |

## Settings schema (complete)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "if": "Bash(rm *)",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": ["./block-rm.sh"],
            "async": false,
            "asyncRewake": false,
            "shell": "bash",
            "timeout": 600,
            "statusMessage": "Validating command…",
            "once": false
          },
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/pre-tool-use",
            "headers": { "Authorization": "Bearer $MY_TOKEN" },
            "allowedEnvVars": ["MY_TOKEN"],
            "timeout": 30
          },
          {
            "type": "mcp_tool",
            "server": "my_server",
            "tool": "security_scan",
            "input": { "file_path": "${tool_input.file_path}" }
          },
          {
            "type": "prompt",
            "prompt": "Evaluate if $ARGUMENTS should be allowed",
            "model": "haiku",
            "timeout": 30,
            "continueOnBlock": false
          },
          {
            "type": "agent",
            "prompt": "Verify $ARGUMENTS is safe",
            "model": "sonnet",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

### Common fields (all handler types)

| Field | Required | Description |
| --- | --- | --- |
| `type` | yes | `"command"`, `"http"`, `"mcp_tool"`, `"prompt"`, or `"agent"` |
| `if` | no | Permission-rule filter; only evaluated on tool events |
| `timeout` | no | Seconds. Default: 600 (command/http/mcp_tool), 30 (prompt), 60 (agent). `UserPromptSubmit` lowers cmd/http/mcp_tool to 30; `MessageDisplay` to 10; `SessionEnd` to 1.5 |
| `statusMessage` | no | Spinner text while hook runs |
| `once` | no | Skill-frontmatter only; runs once per session then is removed |

### Command hook fields

| Field | Required | Description |
| --- | --- | --- |
| `command` | yes | Shell command. With `args`, the executable to spawn directly |
| `args` | no | Argument vector. When present, `command` is spawned directly with no shell |
| `async` | no | Run in background; hook cannot block |
| `asyncRewake` | no | Async + wakes Claude on exit 2 (implies `async`). Stderr/stdout shown to Claude as a system reminder |
| `shell` | no | `"bash"` (default) or `"powershell"`. On Windows, setting `powershell` spawns PowerShell directly. Ignored when `args` is set |

### HTTP hook fields

| Field | Required | Description |
| --- | --- | --- |
| `url` | yes | POST target |
| `headers` | no | Extra headers. Values support `$VAR`/`${VAR}` interpolation, but only variables listed in `allowedEnvVars` resolve (others become empty) |
| `allowedEnvVars` | no | Env var whitelist for header interpolation |

### MCP tool hook fields

| Field | Required | Description |
| --- | --- | --- |
| `server` | yes | MCP server name. Must already be connected; no OAuth/connect flow from a hook |
| `tool` | yes | Tool name on that server |
| `input` | no | Args. String values support `${tool_input.field}` substitution |

### Prompt and agent hook fields

| Field | Required | Description |
| --- | --- | --- |
| `prompt` | yes | Prompt text. Use `$ARGUMENTS` for hook input JSON. `\$` escapes a literal `$` (e.g. `\$1.00` → `$1.00`) |
| `model` | no | Defaults to a fast model |
| `continueOnBlock` | no | Prompt hooks only. When `ok: false`, feed reason back to Claude and continue the turn instead of ending it |

**Prompt response schema:** `{"ok": true}` to allow, `{"ok": false, "reason": "..."}` to block. Agent hooks use the same schema.

## Exec form vs shell form (Windows trap)

This is the biggest source of platform-specific bugs. **Always prefer exec form** (`args` set) for hooks that reference path placeholders — each `args` element is passed verbatim with no quoting needed.

- **Shell form** (`args` omitted): `command` is `sh -c` on macOS/Linux, Git Bash on Windows, or PowerShell when Git Bash isn't installed. The shell tokenizes, expands variables, interprets pipes/`&&`/redirects/globs. Requires quoting for paths with spaces.
- **Exec form** (`args` set): `command` is resolved as an executable and spawned directly with `args` as the argv. No shell. Path placeholders are substituted into both `command` and each `args` element as plain strings.

**On Windows, exec form requires `command` to be a real `.exe`.** The `.cmd`/`.bat` shims that npm/npx/eslint install in `node_modules/.bin` are **not executables** and cannot be spawned without a shell. To run a JS script via exec form on Windows:

```json
{
  "type": "command",
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR}/node_modules/eslint/bin/eslint.js", "--fix"]
}
```

`node.exe` is a real binary, so `node` + script-path works on every platform. To run a `.cmd`/`.bat` shim by name, use shell form. Setting `shell: "powershell"` spawns PowerShell directly (auto-detects `pwsh.exe` 7+ with fallback to `powershell.exe` 5.1) — no need for `CLAUDE_CODE_USE_POWERSHELL_TOOL`.

In exec form, a bare `command` with no path separator that contains whitespace alongside `args` triggers a warning and a failed spawn — there is no executable named `node script.js`. Move extra tokens into `args`.

## Path placeholders

Use these in `command` / `args` / `url` / `input` to reference paths independent of the working directory when the hook runs:

- `${CLAUDE_PROJECT_DIR}` — project root. Also exported as an env var.
- `${CLAUDE_PLUGIN_ROOT}` — plugin's install directory (changes on plugin update).
- `${CLAUDE_PLUGIN_DATA}` — plugin's persistent data directory (survives updates).

In MCP tool `input`, string values support `${tool_input.<field>}` and similar substitutions from the hook's JSON input.

**Prefer exec form when using these placeholders** — shell form needs double-quoting for paths with spaces: `"${CLAUDE_PROJECT_DIR}/.claude/hooks/check.sh"`.

## Environment variable persistence

`SessionStart`, `Setup`, `CwdChanged`, and `FileChanged` hooks have access to `CLAUDE_ENV_FILE`, a path to a file where `export FOO=bar` lines are persisted. Variables written there are available in all subsequent Bash tool calls during the session. Use append (`>>`) to preserve variables from other hooks:

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  echo 'export PATH="$PATH:./node_modules/.bin"' >> "$CLAUDE_ENV_FILE"
fi
```

## Debugging

Hook execution details (which hooks matched, exit codes, full stdout/stderr) go to the debug log. Set `claude --debug` to enable, or `claude --debug-file /path/to/log` to control the location. Default path: `~/.claude/debug/<id>.txt`.

`CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher counts and per-hook query matching.

A useful `Notification` hook pattern for confirming a config works:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": ".*", "hooks": [
        { "type": "command", "command": "bash -c 'date >> /tmp/hook.log'" }
      ]}
    ]
  }
}
```

Then `tail -f /tmp/hook.log` in another terminal while you exercise Claude.

Use the `/hooks` menu to inspect all registered hooks in a read-only browser — each is labeled with `[type]` and a source (`User` / `Project` / `Local` / `Plugin` / `Session` / `Built-in`).

## Common patterns

These are the patterns that show up in real production hooks configs.

### 1. PreToolUse: block destructive Bash

The canonical first hook every team should ship. Block `rm -rf`, `git push --force`, `drop database`, etc., before they reach the shell.

```bash
#!/usr/bin/env bash
# .claude/hooks/block_destructive.sh
set -euo pipefail
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

deny='(^|[^A-Za-z])(rm[[:space:]]+-rf?|drop[[:space:]]+database|truncate[[:space:]]+table|git[[:space:]]+push[[:space:]]+.*--force|psql.*--command=.*delete[[:space:]]+from)'

if echo "$cmd" | grep -qiE "$deny"; then
  echo "Blocked by guard rail: command matches destructive pattern. Reword the request, or ask a human to run this manually." >&2
  exit 2
fi
exit 0
```

The rejection text in stderr is what Claude sees, so make it actionable — suggest an alternative. A bare "blocked" message causes the model to retry the same command in a loop.

### 2. PostToolUse: format + lint on every edit

Auto-format and surface lint findings as `additionalContext` so the model fixes them on its next turn.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/post_edit.py",
            "args": []
          }
        ]
      }
    ]
  }
}
```

```python
#!/usr/bin/env python3
# .claude/hooks/post_edit.py — format, surface lint failures as context
import json, subprocess, sys
data = json.load(sys.stdin)
paths = [data["tool_input"]["file_path"]] if data.get("tool_input", {}).get("file_path") else []
py = [p for p in paths if p.endswith(".py")]
if not py:
    sys.exit(0)
subprocess.run(["ruff", "format", *py], check=False)
r = subprocess.run(["ruff", "check", *py], capture_output=True, text=True)
if r.returncode != 0:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": f"Lint findings:\n{r.stdout}\nFix before continuing."
        }
    }))
sys.exit(0)
```

The discipline: format silently, surface only failures. Successful lint output will drown the model in noise.

### 3. UserPromptSubmit: secret scrub

Reject prompts that contain obvious credentials before they enter context. `exit 2` blocks the prompt and erases it from the transcript.

```bash
#!/usr/bin/env bash
# .claude/hooks/scrub_secrets.sh
input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // ""')

if echo "$prompt" | grep -qE '(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)'; then
  echo "Prompt contains what looks like a credential. Redact it and resend." >&2
  exit 2
fi
exit 0
```

A more advanced version rewrites the prompt with `hookSpecificOutput.modifyInput.user_prompt` to substitute a placeholder, so the model still answers the user's intent.

### 4. Stop: soft completion gate

In 2026, Stop and SubagentStop can return `hookSpecificOutput.additionalContext` to add a new instruction **without** raising a hook error — the transcript labels it `Stop hook feedback` rather than `Stop hook error`, and the same `stop_hook_active` / 8-consecutive-blocks cap applies.

```python
#!/usr/bin/env python3
# .claude/hooks/stop_gate.py
import json, sys
data = json.load(sys.stdin)
bg = data.get("background_tasks", [])
crons = data.get("session_crons", [])

if bg or crons:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": (
                f"{len(bg)} background task(s) and {len(crons)} cron(s) are still scheduled. "
                "Confirm they are intentional, or cancel them before ending the turn."
            )
        }
    }))
sys.exit(0)
```

For a hard gate (you really want the model to keep going), use the older `decision: "block"` + `reason` pattern instead.

### 5. SessionStart: warm project context

Inject branch / open issue / deploy target into Claude's context at session start. Pair with `reloadSkills: true` if the hook installs new skills.

```bash
#!/usr/bin/env bash
input=$(cat)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
issue=$(gh issue list --assignee @me --state open --json number,title --jq '.[0] | "[\(.number)] \(title)"' 2>/dev/null || echo "")

jq -nc \
  --arg branch "$branch" \
  --arg issue "$issue" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: ("Current branch: \($branch)\nOpen issue: \($issue)\nUse 'pnpm test' for unit tests.")}}'
```

Plain stdout is also added as context for `SessionStart`, but the JSON form lets you combine `additionalContext` with `suppressOutput` or `sessionTitle`.

### 6. Notification: mirror to Slack/observability

`Notification` hooks cannot modify the notification, but they are perfect for forwarding it. Use matchers to handle `permission_prompt` and `idle_prompt` differently.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          { "type": "command", "command": "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Claude is waiting\"}' $SLACK_WEBHOOK" }
        ]
      }
    ]
  }
}
```

## Common gotchas

These are the bugs the upstream issue tracker shows most often.

1. **Trailing commas in `settings.json` silently disable the whole file.** Validate with `python3 -m json.tool < ~/.claude/settings.json` (or `jq .`) on every edit. A single trailing comma before `]` or `}` makes the entire config file fail to parse and Claude Code ignores it without warning.
2. **Matcher is case-sensitive.** Tool names are `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`. `bash` or `BASH` matches nothing.
3. **Windows: `SessionStart` hooks can silently fail to invoke** (v2.1.141+). Backslashes in absolute paths are mangled, and PowerShell encoding errors can prevent Stop hooks from running. Use forward slashes, exec form, and `shell: "powershell"` explicitly when needed.
4. **CRLF line endings in shell scripts** on Windows: shebang fails, hook silently does nothing. `sed -i 's/\r//' /path/to/script.sh` to fix. `file your-script.sh` reports "CRLF" if broken.
5. **Missing execute permission** (`chmod +x`) on script files. Hook fires, but the shell can't run the script. Add a shebang (`#!/usr/bin/env bash`).
6. **`.cmd`/`.bat` shims in `node_modules/.bin` are not real executables** on Windows. Use `node script.js` via exec form, or fall back to shell form.
7. **WSL2 mixing Windows and Linux paths.** Use Linux paths in hook commands (`/home/user/...` or `/mnt/c/...`), not `C:\...`.
8. **Shell profile text on stdout corrupts JSON parsing.** If your `~/.bashrc` prints `Welcome!` on login, hooks that emit JSON fail. Either fix the profile or invoke hooks with `bash --noprofile --norc -c …`.
9. **`exit 1` does not block** — only `exit 2` does. A failed `grep` that returns `1` is the most common accidental block: test patterns with `|| true` or wrap in `set +e` first if you want non-matches to pass.
10. **`if` filter fails open** on unparseable Bash. Don't rely on `if` for hard enforcement — use the permission system.
11. **`once: true` is ignored** in settings files and agent frontmatter. It is only honored in skill frontmatter.
12. **SessionEnd hook default timeout is 1.5 seconds.** Bump the per-hook `timeout` if you need more. The global budget auto-raises to the highest per-hook timeout (capped at 60s) unless overridden via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` (env var, milliseconds). Plugin hook timeouts do **not** raise the global budget.
13. **`Stop` infinite-loop protection is 8 consecutive blocks.** If your Stop hook keeps returning `decision: "block"`, Claude Code will override it after 8 iterations. Check `stop_hook_active: true` to detect you're already in a continuation.
14. **Async hook output is delivered on the next turn.** If the session is idle, response waits for next user interaction. The `asyncRewake: true` flag wakes Claude immediately on exit 2.
15. **No `/dev/tty` from hooks.** Writing escape sequences directly fails (the hook process has no controlling terminal). Use the `terminalSequence` JSON field instead, with allowlisted OSC codes (0/1/2/9/99/777 + BEL) — anything else is silently dropped.
16. **`MCP` tool hooks fail when the server isn't connected.** `SessionStart` and `Setup` typically fire before servers finish connecting — design those hooks to handle the "not connected" error gracefully.
17. **`updatedInput` replaces the entire input object**, not a partial update. Include unchanged fields alongside modifications or Claude will lose them.
18. **Plugin `hooks/hooks.json` with shell-spawning commands may be silently skipped on Windows** (issue #54772). Use exec form or `shell: "powershell"` explicitly.
19. **The `matcher` on `UserPromptSubmit`/`Stop`/`TeammateIdle`/`TaskCreated`/`TaskCompleted`/`PostToolBatch`/`CwdChanged`/`WorktreeCreate`/`WorktreeRemove` is silently ignored.** These events do not support matchers.
20. **`PostToolUseFailure` does not get `tool_response`** — it gets `error` and `is_interrupt` as top-level fields instead.

## Hook chaining and execution order

- All matching handlers in a matcher group run **in parallel**.
- Identical command hooks are deduplicated by `command + args`; identical HTTP hooks are deduplicated by URL.
- Identical plugin hooks can be silently skipped on Windows in some versions — make handler configs unique if you need them to run.
- For `PreToolUse`, when multiple hooks return different decisions, precedence is `deny` > `defer` > `ask` > `allow`. The user's existing deny/ask rules are still evaluated regardless of what the hook returns.
- For `PermissionRequest`, a hook returning `"allow"` does not override a matching deny rule.
- The `/hooks` menu shows execution source (User / Project / Local / Plugin / Session / Built-in) so you can trace which file a hook came from.

## Security checklist

Hooks run with the user's full permissions. They are the first line of defense but also a supply-chain risk: a malicious PR that adds a hook to `.claude/settings.json` is the cheapest way to attack a developer's machine.

- Treat `.claude/settings.json` as code: review in PRs, require approvals.
- Pin hook scripts in `.claude/hooks/` inside the repo, audited like build scripts.
- Use `.claude/settings.local.json` (gitignored) only for personal overrides; anything protecting production belongs in the shared file.
- Sanitize stdin JSON — treat `command`, `user_prompt`, `tool_input` as untrusted input.
- Always quote shell variables (`"$VAR"`, not `$VAR`); check for `..` in file paths.
- Skip sensitive paths (`.env`, `.git/`, key files) by default.
- Use absolute paths. In exec form, `${CLAUDE_PROJECT_DIR}` needs no quoting. In shell form, double-quote: `"${CLAUDE_PROJECT_DIR}/…"`.
- Log hook decisions to your audit pipeline, including denials — you'll want this when an engineer asks why a command was blocked.
- Test hooks: keep a `tests/hooks/` folder with golden inputs and expected exit codes, run in CI.
- **Don't put business logic in hooks.** A rule that should also apply to humans belongs in CI, a DB trigger, or a deploy gate. Hooks are agent-only by definition; a duplicate rule that lives only in `.claude/settings.json` is a hidden production assumption.
- **Don't use hooks as a substitute for unclear product specs.** If the model is doing the wrong thing because it doesn't know the right thing, write a Skill or `CLAUDE.md` first. The mental model: hooks fight noncompliance, not ignorance.

## Performance rules

Every `PreToolUse` hook adds latency to every matched tool call. Keep them under 100ms in the hot path.

- Match narrowly — a specific tool-name regex, not `.*`.
- Skip work cheaply — read the input first, exit `0` when nothing applies.
- Push heavy checks to `PostToolUse` (the model is waiting on a summary, not a permit).
- Use `async: true` for genuinely slow work (test suites, deployments).
- For external services, set a tight 1–2s timeout and **fail open with a logged warning** — never fail closed on an audit service, or you turn every Claude Code session into a hostage of your audit uptime.

## Sources

- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/agent-sdk/hooks.md
- https://www.totalum.app/blog/claude-code-hooks-totalum
- https://claudelab.net/en/articles/claude-code/claude-code-hooks-not-firing-troubleshooting
- https://github.com/anthropics/claude-code/issues/14219 (Windows silent hook failures)
- https://github.com/anthropics/claude-code/issues/54772 (Plugin hooks.json Windows)
- https://github.com/anthropics/claude-code/issues/54640 (Windows path backslash mangling)
- https://github.com/anthropics/claude-code/issues/57946 (Python3 Windows Store stub)

Related: [[skills-overview]], [[skills-frontmatter]], [[skills-invocation]], [[subagents]], [[workflows]], [[loops-and-scheduling]], [[goals]], [[orpc-bridge]]
