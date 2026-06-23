---
name: permissions-and-settings
description: Claude Code's permission modes, settings.json hierarchy, env var flags, and security model — the governance layer for what Claude can do.
metadata:
  type: reference
---

# Permissions & Settings

The governance layer for Claude Code. Three interlocking concepts:

1. **Permission modes** (`default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`) — control *how* tools get approved.
2. **Permission rules** (`allow` / `ask` / `deny` arrays) — control *which* tools/commands are approved.
3. **Settings hierarchy** (managed → CLI → local → project → user) — controls *where* rules apply and who can override them.

Permissions are enforced by Claude Code itself, not by the model. Instructions in `CLAUDE.md` or prompts shape what Claude *tries* to do; permissions shape what it *can* do.

---

## 1. The six permission modes

Set with `permissions.defaultMode` in settings, or `--permission-mode` flag, or `Shift+Tab` in the TUI to cycle modes.

| Mode | Behavior | When to use |
| --- | --- | --- |
| `default` | Prompts for permission on first use of each tool. "Yes, don't ask again" persists per-directory for Bash, until session end for Edit. | Standard interactive use. |
| `acceptEdits` | Auto-accepts file edits and common filesystem commands (`mkdir`, `touch`, `mv`, `cp`, etc.) for paths inside the working directory or `additionalDirectories`. | Local dev with trusted repo; reduces friction while still prompting for network/exec. |
| `plan` | Read-only: Claude can read files and run read-only shell commands to explore, but cannot edit source files. | Planning/refactoring conversations before committing to changes. |
| `auto` | Auto-approves tool calls with background safety checks that verify actions align with the request. Currently a research preview. | Experimental; only on Anthropic API by default, opt-in on Bedrock/Vertex/Foundry via `CLAUDE_CODE_ENABLE_AUTO_MODE=1`. |
| `dontAsk` | Auto-denies any tool not pre-approved via `/permissions` or `permissions.allow` rules. | Locked-down environments; explicit allowlist required. |
| `bypassPermissions` | Skips permission prompts except for explicit `ask` rules and circuit-breakers (`rm -rf /`, `rm -rf ~`). Still auto-allows writes to `.git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn`. | Isolated containers/VMs only. **Disable in production** with `disableBypassPermissionsMode: "disable"`. |

**Gotchas:**

- As of v2.1.142, `auto` is **ignored when set in project or local settings** (`.claude/settings.json`, `.claude/settings.local.json`) — set it in `~/.claude/settings.json` instead. A repository cannot grant itself auto mode.
- `disableBypassPermissionsMode: "disable"` and `disableAutoMode: "disable"` should typically live in **managed settings** so users can't override.
- `skipDangerousModePermissionPrompt: true` skips the confirmation dialog before entering `bypassPermissions` via `--dangerously-skip-permissions` or `defaultMode: "bypassPermissions"`. **Ignored when set in project settings** to prevent untrusted repos from auto-bypassing the prompt.
- `--allow-dangerously-skip-permissions` adds `bypassPermissions` to the `Shift+Tab` cycle without starting in it — useful when you want to begin in `plan` and switch later.

### Mode behavior in depth

**`bypassPermissions`** — what it actually allows:

- Writes to `.git`, `.config/git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn` are auto-approved.
- Explicit `ask` rules still force a prompt (deny-first precedence applies).
- `rm -rf /`, `rm -rf ~`, and removals targeting filesystem root or home directory still prompt as a circuit breaker against model error.
- Should only be used in isolated environments (containers, VMs) where Claude Code cannot cause damage.

**`plan` mode** — what it allows:

- Read files, run read-only shell commands.
- Cannot edit source files, but can write to plan files.
- `useAutoModeDuringPlan: true` (default) makes plan mode use auto-mode semantics when auto mode is available.

---

## 2. Permission rule syntax (`allow` / `ask` / `deny`)

Rules follow the format `Tool` or `Tool(specifier)`. Three categories:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(./docs/**)"],
    "ask":   ["Bash(git push *)"],
    "deny":  ["Bash(curl *)", "Read(./.env)", "WebFetch", "Agent(Explore)"]
  }
}
```

### Evaluation order

**Deny → Ask → Allow. First match wins. Specificity does NOT change order.**

A broad deny like `Bash(aws *)` blocks every matching call, even if a narrower allow like `Bash(aws s3 ls)` also matches. A deny rule cannot carry allowlist exceptions.

A matching ask rule prompts even when a more specific allow rule also matches the same call.

**Bare vs scoped deny rules behave differently:**

- Bare tool name (`Bash`, `Read`) **removes the tool from Claude's context entirely** — Claude never sees it.
- Scoped rule (`Bash(rm *)`) leaves the tool available but blocks matching calls.

### Matching by input parameter

Deny and ask rules can match a top-level input parameter:

| Rule | Matches |
| --- | --- |
| `Agent(model:opus)` | Agent calls that request the Opus model tier |
| `Agent(isolation:worktree)` | Agent calls that request a git worktree |
| `Bash(run_in_background:true)` | Bash calls that run in the background |

Rules:

- Each rule names one parameter. To gate on two, write two rules.
- Value supports `*` wildcard. `Agent(isolation:*)` matches any explicit isolation value.
- A parameter the model omits is never matched — `Agent(model:*)` does NOT match a call that leaves `model` unset.
- Value compared against literal input before normalization. `Agent(model:opus)` matches the alias `opus` but not a full model ID.
- Whitespace around the colon is ignored.
- Run with `--verbose` to see exact parameter names and values in each tool call.

**Tools whose canonicalizing rules already match**: `command` for Bash/PowerShell, `file_path` for Read/Edit/Write, `path` for Grep/Glob, `notebook_path` for NotebookEdit, `url` for WebFetch. A rule like `Bash(command:rm *)` would be bypassable by a compound command, so Claude Code ignores it and emits a startup warning.

### Bash wildcards

`Bash` rules support glob `*` at any position:

- `Bash(npm run build)` — exact command
- `Bash(npm run test *)` — starts with prefix
- `Bash(* install)` — ends with suffix
- `Bash(git * main)` — matches `git push origin main`, `git checkout main`, etc.

**Space matters**: `Bash(ls *)` matches `ls -la` but not `lsof`. `Bash(ls*)` matches both. The `:*` suffix is equivalent to ` *`.

**Compound commands** — Claude Code parses shell operators (`&&`, `||`, `;`, `|`, `|&`, `&`, newlines). A rule must match **each subcommand independently**. `Bash(safe-cmd *)` does NOT permit `safe-cmd && other-cmd`.

**Process wrappers** stripped before matching: `timeout`, `time`, `nice`, `nohup`, `stdbuf`, and bare `xargs`. So `Bash(npm test *)` also matches `timeout 30 npm test`. Note: `xargs -n1 grep pattern` is matched as `xargs`, not `grep`.

**Dev runners NOT stripped**: `direnv exec`, `devbox run`, `mise exec`, `npx`, `docker exec`. A rule `Bash(devbox run *)` matches whatever comes after `run`, including `devbox run rm -rf .`. To safely approve work inside a runner, write specific inner commands.

**Always-prompt wrappers**: `watch`, `setsid`, `ionice`, `flock`, and `find -exec`/`-delete`. Write exact-match rules for these.

**Read-only commands** (built-in, not configurable): `ls`, `cat`, `echo`, `pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`, `cd`, read-only `git`. Run without a prompt in every mode. To require a prompt for one of these, add an `ask` or `deny` rule.

### Read/Edit paths (gitignore-style)

| Pattern | Meaning | Example | Matches |
| --- | --- | --- | --- |
| `//path` | Absolute from filesystem root | `Read(//Users/alice/secrets/**)` | `/Users/alice/secrets/**` |
| `~/path` | From home directory | `Read(~/Documents/*.pdf)` | `/Users/alice/Documents/*.pdf` |
| `/path` | Relative to project root | `Edit(/src/**/*.ts)` | `/src/**/*.ts` |
| `path` or `./path` | Relative to current directory | `Read(*.env)` | `/*.env` |

**A pattern like `/Users/alice/file` is NOT absolute.** It's relative to project root. Use `//Users/alice/file` for absolute paths.

**On Windows**, paths are normalized to POSIX form before matching. `C:\Users\alice` becomes `/c/Users/alice`. Use `//c/**/.env` to match `.env` files anywhere on that drive.

**Symlinks**: permission rules check both the symlink path and its target. Allow rules fall back to prompting if either side fails; deny rules block if either side matches.

### WebFetch domain patterns

`WebFetch(domain:...)` matches against hostname (case-insensitive, strips trailing `.`):

- `WebFetch(domain:example.com)` — exact match
- `WebFetch(domain:*.example.com)` — any subdomain at any depth, but NOT `example.com` itself
- `WebFetch(domain:*)` — every domain (equivalent to bare `WebFetch`)

In any position other than a leading `*.` or a bare `*`, the wildcard matches only text between two dots. `WebFetch(domain:example.*)` matches `example.org` but not `example.evil.com`.

---

## 3. Tool-level restrictions

### `--disallowedTools` / `--disallowed-tools` flag

CLI-level deny rules. A bare tool name (`"Edit"`, `"*"`, `"mcp__*"`) removes the matching tools from the model's context. Scoped rules (`"Bash(rm *)"`) leave the tool available but deny matching calls.

Example:

```bash
claude --disallowedTools "Bash(git log *)" "Bash(git diff *)" "Edit"
```

Note: `--disallowedTools` can **add restrictions beyond** what managed settings define. Managed settings cannot be overridden by `--allowedTools`.

### `disallowedTools` frontmatter field

The `Agent` subagent frontmatter can declare `tools:` to limit the subagent to a specific allowlist, or `disallowedTools` (less common) to deny specific tools. See the subagents memory file for details.

---

## 4. Special permission patterns

### `Agent(name)` — block specific subagents

```json
{ "permissions": { "deny": ["Agent(Explore)", "Agent(Plan)"] } }
```

Or via CLI: `--disallowedTools "Agent(Explore)"`. Useful for locking down which subagents can be dispatched.

### `Bash(command:*)` — fine-grained bash

Already covered above. The space-before-`*` syntax enforces word boundaries. Compound commands require per-subcommand rules.

### `mcp__github` — entire MCP server

```json
{ "permissions": { "deny": ["mcp__github"] } }
```

Removes all tools from the `github` MCP server from Claude's context.

### `mcp__github__*` — all tools from one server

```json
{ "permissions": { "allow": ["mcp__github__get_*"] } }
```

The `mcp__` prefix is required in allow rules. The server segment must be glob-free — `mcp__github__get_*` is valid; `mcp__*__get_*` is not (deny rules allow this; allow rules don't).

### `mcp__*` — all MCP tools across all servers

```json
{ "permissions": { "deny": ["mcp__*"] } }
```

Deny-only pattern. Allow rules reject unanchored globs like `"*"` or `"mcp__*"` with a warning.

### Other patterns

| Rule | Effect |
| --- | --- |
| `WebFetch` | Matches all web fetch requests |
| `Read` | Matches all file reads (incl. Grep/Glob, `@` mentions, IDE selection) |
| `Cd(~/code/**)` | Allow `/cd` only into this directory (Cd is not model-invocable; user-only) |
| `PowerShell(Get-ChildItem *)` | Matches `gci`, `ls`, `dir` aliases too — matching is case-insensitive |

### Tool name wildcards in deny/ask

Deny and ask rules accept glob patterns in the tool-name position. The pattern must match the full tool name:

- `"*"` matches every tool
- `"mcp__*"` matches every MCP tool across all servers

A tool matched by a bare-name glob deny rule is removed from Claude's context.

---

## 5. `settings.json` hierarchy with precedence

### The five scopes (highest → lowest precedence)

1. **Managed** — server-managed settings, MDM/OS-level policies (plist on macOS, registry on Windows), or system `managed-settings.json`. **Cannot be overridden by anything**, including CLI flags. Within managed tier: server-managed > MDM/OS-level > file-based (`managed-settings.d/*.json` + `managed-settings.json`) > HKCU registry (Windows only). Only one managed source is used; sources do not merge across tiers.

2. **Command line arguments** — `--settings <path-or-JSON>` merges with file-based settings using same rules as other layers. A key set here overrides; omitting keeps the lower-layer value.

3. **Local project** — `.claude/settings.local.json`. Per-machine overrides, gitignored when Claude Code creates it.

4. **Shared project** — `.claude/settings.json`. Team-shared, committed to git.

5. **User** — `~/.claude/settings.json`. Personal, applies across all projects.

### Locations

| Scope | Location (per OS) |
| --- | --- |
| Managed (file) | macOS `/Library/Application Support/ClaudeCode/`, Linux `/etc/claude-code/`, Windows `C:\Program Files\ClaudeCode\` |
| Managed (plist) | macOS `com.anthropic.claudecode` managed preferences domain (deploy via MDM/Jamf/Iru) |
| Managed (registry) | Windows `HKLM\SOFTWARE\Policies\ClaudeCode` (admin), `HKCU\SOFTWARE\Policies\ClaudeCode` (user-level) |
| User | `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`) |
| Project | `.claude/settings.json` (committed) |
| Local | `.claude/settings.local.json` (gitignored) |

The legacy Windows path `C:\ProgramData\ClaudeCode\managed-settings.json` is no longer supported as of v2.1.75.

### Merge behavior

- **Scalar values**: higher precedence overrides lower.
- **Array values** (e.g., `permissions.allow`, `sandbox.filesystem.allowWrite`): **concatenated and deduplicated**, not replaced. Lower-priority scopes can add entries; higher-priority cannot remove.
- **Exceptions**:
  - `fallbackModel` — ordered chain; highest-precedence file supplies the entire chain.
  - `availableModels` — as of v2.1.175, managed/policy value replaces lower-precedence entries entirely.

### How scoping interacts with array settings

If managed sets `allowWrite: ["/opt/company-tools"]` and user adds `["~/.kube"]`, both paths are in final config. Same for `permissions.allow`: managed deny rules cannot be overridden, but user/project can add additional allows on top.

### Embedding hosts (Agent SDK)

Embedding hosts can supply additional managed policy via SDK `managedSettings` option when `parentSettingsBehavior: "merge"`. Embedder values can **tighten policy but not loosen it**.

Default: `parentSettingsBehavior: "first-wins"` — parent-supplied settings are dropped and only admin tier applies.

---

## 6. Complete env var reference

### Disable / enable feature toggles

| Variable | Effect |
| --- | --- |
| `CLAUDE_CODE_DISABLE_CRON=1` | Disable scheduled tasks. `/loop` skill and cron tools become unavailable. Already-scheduled tasks stop firing, including mid-session ones. |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Disable all background task functionality: `run_in_background` parameter on Bash/subagent, auto-backgrounding, Ctrl+B shortcut. |
| `CLAUDE_CODE_DISABLE_WORKFLOWS=1` | Disable dynamic workflows and bundled workflow commands. Equivalent to `disableWorkflows` setting. |
| `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` | Disable built-in subagent types (Explore, Plan, etc.). Only applies in non-interactive mode (`-p` flag). Useful for SDK users wanting a blank slate. |
| `CLAUDE_CODE_FORK_SUBAGENT=1` (or `0`) | Let Claude spawn forked subagents (subagent that inherits full conversation context). The explicit `/fork` command works without this variable. Works interactive and via SDK/`claude -p`. |
| `CLAUDE_CODE_SUBAGENT_MODEL` | See Model configuration docs. Sets model used for subagents. |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | Enable agent teams. Experimental and disabled by default. |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=<1-100>` | Set percentage of auto-compaction window at which compaction triggers. Lower values (e.g., `50`) compact earlier. Override can only lower the threshold, not raise it. |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Set context capacity for auto-compaction calculations. Default: 200K (standard) or 1M (extended context). |
| `CLAUDE_AUTO_BACKGROUND_TASKS=1` | Force-enable auto-backgrounding of long-running agent tasks after ~2 minutes. |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` | Disable skills and workflows that ship with Claude Code. |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Equivalent to `DISABLE_AUTOUPDATER`, `DISABLE_FEEDBACK_COMMAND`, `DISABLE_ERROR_REPORTING`, `DISABLE_TELEMETRY`. |
| `CLAUDE_CODE_SAFE_MODE=1` | Start in safe mode (equivalent to `--safe-mode`). Skip customizations. |
| `CLAUDE_CODE_SIMPLE=1` | Bare mode (equivalent to `--bare`). |
| `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` | Skip writing prompt history and session transcripts. |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` | Strip Anthropic and cloud provider credentials from subprocess environments. Defense-in-depth against prompt injection. |

### Settings equivalents (managed-only)

| Variable | Managed setting |
| --- | --- |
| `CLAUDE_CODE_DISABLE_AGENT_VIEW=1` | `disableAgentView: true` |
| `CLAUDE_CODE_DISABLE_ARTIFACT=1` | `disableArtifact: true` |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | (no setting equivalent) |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1` | `fileCheckpointingEnabled: false` |
| `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1` | `includeGitInstructions: false` |
| `CLAUDE_CODE_DISABLE_TELEMETRY` (or `DISABLE_TELEMETRY`) | (no setting equivalent) |

### Managed-only settings (these cannot be set in user/project/local)

| Setting | Effect |
| --- | --- |
| `allowManagedHooksOnly: true` | Only managed hooks, SDK hooks, and hooks from plugins force-enabled in managed `enabledPlugins` are loaded. User/project/all-other-plugin hooks blocked. |
| `allowManagedPermissionRulesOnly: true` | User and project settings cannot define `allow`/`ask`/`deny` rules. Only managed rules apply. |
| `allowManagedMcpServersOnly: true` | Only `allowedMcpServers` from managed settings are respected. |
| `allowAllClaudeAiMcps: true` | claude.ai connectors load alongside deployed `managed-mcp.json`. |
| `allowedChannelPlugins` | Allowlist of channel plugins. Replaces default Anthropic allowlist. Requires `channelsEnabled: true`. |
| `blockedMarketplaces` | Blocklist of marketplace sources. Checked before downloading. |
| `channelsEnabled: true` | Allow channels organization-wide. |
| `forceRemoteSettingsRefresh: true` | Block CLI startup until remote managed settings freshly fetched. Exits if fetch fails. |
| `pluginTrustMessage` | Custom message appended to plugin trust warning. |
| `sandbox.filesystem.allowManagedReadPathsOnly: true` | Only `filesystem.allowRead` paths from managed settings respected. |
| `sandbox.network.allowManagedDomainsOnly: true` | Only `allowedDomains` and `WebFetch(domain:...)` allow rules from managed settings respected. |
| `strictKnownMarketplaces` | Allowlist of plugin marketplace sources. |
| `strictPluginOnlyCustomization` | Block skills/agents/hooks/MCP from user/project sources. `true` locks all four; array locks named ones. |
| `wslInheritsWindowsSettings: true` | WSL reads managed settings from Windows policy chain. |
| `disableBypassPermissionsMode: "disable"` | Prevent `bypassPermissions` mode activation. |
| `disableAutoMode: "disable"` | Prevent `auto` mode activation. |
| `disableAllHooks: true` | Disable all hooks and custom status line. |
| `disableDeepLinkRegistration: "disable"` | Prevent registering `claude-cli://` protocol handler. |
| `disableRemoteControl: true` | Disable Remote Control. |
| `disableSkillShellExecution: true` | Disable inline shell execution in `!...` blocks in skills/commands. |
| `requiredMinimumVersion` | Minimum Claude Code version required to start. |
| `requiredMaximumVersion` | Maximum Claude Code version allowed to start. |

### `disableAllHooks` setting

```json
{ "disableAllHooks": true }
```

Disables all hooks AND any custom status line. Globally enforced.

### `allowManagedHooksOnly` setting

```json
{ "allowManagedHooksOnly": true }
```

Managed-only. When true:

- Managed hooks and SDK hooks are loaded
- Hooks from plugins force-enabled in managed `enabledPlugins` are loaded
- User hooks, project hooks, all other plugin hooks are blocked

Useful for distributing vetted hooks via an internal marketplace while blocking everything else. Trust is by full `plugin@marketplace` ID.

---

## 7. Other CLI flags

| Flag | Effect |
| --- | --- |
| `--strict-mcp-config` | Only use MCP servers from `--mcp-config`, ignore all other MCP configurations. |
| `--bare` | Minimal mode: skip auto-discovery of hooks, skills, plugins, MCP servers, auto memory, CLAUDE.md. Claude has access to Bash, file read, file edit tools. Sets `CLAUDE_CODE_SIMPLE`. |
| `--add-dir <path>` | Add additional working directories. Grants file access; most `.claude/` configuration is NOT discovered from these. Validates each path exists as a directory. To persist, use `permissions.additionalDirectories`. |
| `--model <name>` | Sets model for current session. Aliases: `sonnet`, `opus`, `haiku`, `fable`. Overrides `model` setting and `ANTHROPIC_MODEL`. |
| `--agent <name>` | Specify agent for current session. Overrides `agent` setting. |
| `--agents <json>` | Define custom subagents dynamically. Same field names as subagent frontmatter + `prompt` field for instructions. |
| `--permission-mode <mode>` | Begin in specified mode: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`. |
| `--settings <path-or-JSON>` | Path to settings JSON or inline JSON. Merges with file-based settings. |
| `--setting-sources <list>` | Comma-separated list of sources to load: `user`, `project`, `local`. |
| `--tools <list>` | Restrict which built-in tools Claude can use. `""` disables all, `"default"` for all, `"Bash,Edit,Read"` for specific. MCP tools not affected; use `--disallowedTools "mcp__*"`. |
| `--allowedTools` / `--allowed-tools` | Tools that execute without prompting. Note: managed settings cannot be overridden by this. |
| `--disallowedTools` / `--disallowed-tools` | Deny rules. Bare name removes tools from model context. |
| `--worktree`, `-w` | Start in isolated git worktree at `/.claude/worktrees/`. Pass `#` or PR URL to fetch that PR. |
| `--resume`, `-r` | Resume specific session by ID or name. |
| `--continue`, `-c` | Load most recent conversation in current directory. |
| `--print`, `-p` | Print response without interactive mode (for SDK use). |
| `--mcp-config <files>` | Load MCP servers from JSON files or strings (space-separated). |
| `--plugin-dir <path>` | Load plugin from directory or `.zip` for this session only. |
| `--safe-mode` | Disable all customizations. Managed policy still applies. Sets `CLAUDE_CODE_SAFE_MODE`. |
| `--permission-prompt-tool <mcp-tool>` | Specify MCP tool to handle permission prompts in non-interactive mode. |
| `--max-budget-usd <n>` | Maximum spend before stopping. Print mode only. |
| `--max-turns <n>` | Limit agentic turns. Print mode only. |
| `--fallback-model <list>` | Comma-separated fallback chain. To persist, use `fallbackModel` setting. |
| `--effort <level>` | `low`, `medium`, `high`, `xhigh`, `max`. Overrides `effortLevel` setting. |
| `--system-prompt` / `--system-prompt-file` | Replace system prompt entirely. Mutually exclusive with each other. |
| `--append-system-prompt` / `--append-system-prompt-file` | Append to default prompt. Can combine with either replacement flag. |

---

## 8. Interaction with subagents

### Parent mode precedence

Subagents **inherit the parent's permission mode** but their tool access can be independently restricted via:

- `tools:` allowlist in subagent frontmatter
- `disallowedTools` in subagent frontmatter
- The `Agent(...)` rule pattern in parent settings

### What subagents can override

Subagents cannot override parent's permission mode (they inherit it). They can:

- Restrict their own tools further via frontmatter
- Be denied by parent's `Agent(name)` deny rule (parent blocks dispatch)

### `--bare` and subagents

`--bare` disables auto-discovery of subagents from `.claude/agents/`. Pass `--agents <json>` to define subagents inline when using `--bare`.

### Hooks

Hooks configured for the parent apply to subagents by default. Per-subagent hook configuration is via the `hooks` frontmatter field.

### Managed-only subagent policy

`strictPluginOnlyCustomization: ["agents"]` blocks `.claude/agents/` and `~/.claude/agents/` from loading. Only plugin agents, built-in agents, and managed-policy agents load.

---

## 9. Security model — what bypassPermissions actually allows

### Writes auto-approved under `bypassPermissions`

Even in `bypassPermissions` mode, the following paths are auto-approved without prompt (these are *trusted* by the harness):

- `.git`
- `.config/git`
- `.claude`
- `.vscode`
- `.idea`
- `.husky`
- `.cargo`
- `.devcontainer`
- `.yarn`
- `.mvn`

This is because Claude Code legitimately needs to write to these (git internals, config directories, hook directories, build tool config) and a prompt would be useless friction.

### Explicit ask rules still force prompts

Even in `bypassPermissions`, an explicit `ask` rule (e.g., `Bash(git push *)`) forces a prompt. The **deny-first precedence** applies: deny rules from any scope are evaluated before allow rules.

### Circuit breakers

`rm -rf /`, `rm -rf ~`, and removals targeting filesystem root or home directory still prompt under `bypassPermissions` as a circuit breaker against model error. These are not configurable.

### OS-level enforcement via sandboxing

Sandboxing provides defense-in-depth: permission rules control which tools Claude can use; sandboxing provides OS-level filesystem and network isolation for Bash and subprocesses. Combine both:

- Permission deny rules block Claude from even attempting restricted resources.
- Sandbox restrictions prevent Bash commands from reaching resources outside defined boundaries even if a prompt injection bypasses Claude's decision-making.
- `sandbox.filesystem.allowWrite` is merged with `Edit(...)` allow rules.
- `sandbox.filesystem.denyRead` is merged with `Read(...)` deny rules.
- `sandbox.network.allowedDomains` is merged with `WebFetch(domain:...)` allow rules.

When sandboxing is enabled with `autoAllowBashIfSandboxed: true` (default), sandboxed Bash runs without prompting even if your permissions include a bare `Bash` ask rule. Content-scoped ask rules like `Bash(git push *)` still force a prompt.

### What WebFetch alone doesn't prevent

If Bash is allowed, Claude can still use `curl`, `wget`, or other tools to reach any URL. WebFetch rules only control the WebFetch tool, not Bash's network access. For reliable URL filtering:

- Deny `Bash(curl *)` and `Bash(wget *)` and similar
- Allow `WebFetch(domain:github.com)` for allowed domains
- Use a PreToolUse hook to validate URLs in Bash commands

---

## 10. Common patterns

### Least-privilege for CI

```json
{
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test *)",
      "Bash(npm run build)",
      "Bash(git diff *)",
      "Bash(git status *)",
      "Read",
      "Glob",
      "Grep"
    ],
    "deny": [
      "WebFetch",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(rm *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Edit(/etc/**)",
      "Edit(/usr/**)"
    ]
  }
}
```

Plus: `disableBypassPermissionsMode: "disable"` in managed settings to prevent bypass.

### Locked-down production agents (managed settings)

```json
{
  "permissions": {
    "defaultMode": "default",
    "disableBypassPermissionsMode": "disable",
    "disableAutoMode": "disable",
    "allowManagedPermissionRulesOnly": true,
    "allow": [
      "Read(/app/**)",
      "Bash(node server.js)"
    ],
    "deny": [
      "WebFetch",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(rm *)",
      "Bash(sudo *)",
      "Edit(/etc/**)",
      "Edit(/usr/**)",
      "Edit(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.gnupg/**)"
    ]
  },
  "allowManagedHooksOnly": true,
  "allowManagedMcpServersOnly": true,
  "strictPluginOnlyCustomization": ["skills", "agents", "hooks", "mcp"],
  "disableAllHooks": false,
  "requiredMinimumVersion": "2.1.150",
  "requiredMaximumVersion": "2.1.180"
}
```

### Local dev defaults

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(npm run *)",
      "Bash(pnpm *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git commit *)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git reset --hard *)",
      "Bash(rm *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
```

### Disabling a specific subagent

```json
{ "permissions": { "deny": ["Agent(Explore)"] } }
```

Or via CLI flag:

```bash
claude --disallowedTools "Agent(Explore)"
```

### Deny all MCP

```json
{ "permissions": { "deny": ["mcp__*"] } }
```

### Restrict to specific MCP servers only

```json
{ "permissions": { "allow": ["mcp__github__get_*", "mcp__github__list_*"] } }
```

Plus `--strict-mcp-config --mcp-config ./mcp.json` to ensure no other MCP configs load.

### Lock down `/cd`

```json
{
  "permissions": {
    "allow": ["Cd(~/code/**)"],
    "deny": ["Cd(~/.ssh)", "Cd(~/.aws)", "Cd(//etc)"]
  }
}
```

With any `Cd` allow rule, `/cd` switches to allowlist mode — the resolved target must match an allow rule, or `/cd` refuses.

### Settings precedence troubleshooting

If a setting isn't taking effect:

1. Run `/status` to see "Setting sources" line — lists each loaded layer.
2. Check `claude doctor` for validation errors.
3. Verify managed tier isn't overriding — it always wins.
4. Check if it's an array setting — array values merge, scalars override.

### Managed settings deploy validation

Before fleet-wide rollout:

1. Run `claude doctor` on test machine to see validation errors.
2. Check `/status` Setting sources line shows delivery channel (`(remote)`, `(plist)`, `(HKLM)`, `(HKCU)`, `(file)`).
3. Validation errors appear: interactive dialog at startup, headless `-p` stderr summary, `claude doctor` listing.
4. Managed settings parse tolerantly — invalid entries are stripped, valid ones enforced. A typo cannot disable the rest of the policy.

### Strict mode for untrusted repo

```json
{
  "permissions": {
    "defaultMode": "default",
    "deny": [
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(chmod *)",
      "Bash(chown *)",
      "Edit(/etc/**)",
      "Edit(~/.ssh/**)",
      "Edit(~/.aws/**)",
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.gnupg/**)",
      "Read(~/.npmrc)",
      "Read(~/.pypirc)"
    ]
  }
}
```

### CI script with `setup-token`

```bash
export CLAUDE_CODE_OAUTH_TOKEN=$(claude setup-token)
claude -p "fix the failing test" \
  --permission-mode dontAsk \
  --allowedTools "Bash(npm test *)" "Bash(npm run lint)" "Read" "Edit" \
  --max-budget-usd 5.00
```

---

## Key gotchas summary

1. **Managed always wins.** Cannot be overridden, including by CLI flags.
2. **Deny-first precedence.** A broad deny blocks specific allows.
3. **Bare tool deny removes from context**, scoped deny keeps available.
4. **Specificity doesn't change evaluation order.**
5. **`auto` mode is ignored in project/local settings** (only honored in user settings or above).
6. **`skipDangerousModePermissionPrompt` is ignored in project settings.**
7. **Array settings merge across scopes**; scalars override.
8. **Compound bash commands require per-subcommand rules.**
9. **Dev runners (`npx`, `docker exec`, `devbox run`) are NOT stripped** — write specific inner commands.
10. **WebFetch rules don't restrict Bash network access** — combine with `Bash(curl *)` deny.
11. **`/c/` prefix on Windows for absolute paths** — paths normalize to POSIX.
12. **`mcp__*` works in deny rules; unanchored globs like `*` don't work in allow rules** except with literal `mcp____` prefix.
13. **Bash bare-tool deny removes tool from context.**
14. **`bypassPermissions` still prompts for `rm -rf /`** as circuit breaker.
15. **Edit (`Read`) deny rules apply to `cat`, `head`, `tail`, `sed`** (file commands Claude Code recognizes) but NOT to arbitrary subprocesses (Python/Node scripts that open files themselves).

---

## See also

- [subagents](../subagents.md) — agent frontmatter, `tools:` field, isolated execution
- [mcp](../mcp.md) — MCP server configuration and allowedMcpServers / deniedMcpServers
- [hooks](../hooks.md) — PreToolUse hook patterns for custom permission evaluation
- [agent-sdk](../agent-sdk.md) — programmatic invocation with permission modes
- [workflows](../workflows.md) — `CLAUDE_CODE_DISABLE_WORKFLOWS` integration
- [skills-overview](../skills-overview.md) — bundled skills disable, skill shell execution

## Sources

- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/iam
