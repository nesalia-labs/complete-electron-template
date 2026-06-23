---
name: mcp
description: Model Context Protocol (MCP) integration in Claude Code — .mcp.json schema, transports (stdio/http/sse/ws), scopes (user/local/project), subagent mcpServers frontmatter, OAuth, allow/deny policies, security model.
metadata:
  type: reference
---

# MCP (Model Context Protocol) in Claude Code

## Overview

**MCP** (Model Context Protocol) is an open-source standard that connects AI
applications (Claude Code, ChatGPT, Cursor, VS Code, etc.) to external tools,
data sources, and workflows. It is often described as a "USB-C port for AI
applications": a single protocol that lets any client talk to any server that
exposes tools, resources, or prompts.

**Why it exists.** Without MCP, every integration (GitHub, Sentry, Slack,
Postgres, filesystem, ...) needs its own bespoke code in the client. MCP
defines a JSON-RPC-based contract so a server written once works in every
compliant client.

**How Claude Code uses it.** Claude Code is an MCP **client**. It can
connect to hundreds of remote or local MCP **servers** at runtime and surface
their `tools`, `resources`, and `prompts` to the model. Servers are matched
by name; tools become `mcp__<server>__<tool>` callable names. Servers can
also push unsolicited messages ("channels") or request structured input
("elicitation"). Resource discovery happens via `@server:protocol://...`
mentions.

MCP is governed by an open spec at [modelcontextprotocol.io](https://modelcontextprotocol.io/).
Claude Code's reference page is at [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp).

---

## `.mcp.json` config format

Top-level object: `{ "mcpServers": { <name>: <ServerConfig>, ... } }`.
Shorthand forms (`{ "mcpServers": [...] }`) are not accepted — always use a
map keyed by server name.

### Common schema (per server)

| Field         | Applies to          | Purpose                                                              |
| ------------- | ------------------- | -------------------------------------------------------------------- |
| `type`        | all                 | `"stdio"` \| `"http"` \| `"sse"` \| `"ws"`. `streamable-http` is accepted as alias for `http` in JSON. |
| `command`     | stdio               | Executable to spawn (no shell).                                      |
| `args`        | stdio               | Argument list, passed verbatim.                                      |
| `env`         | stdio               | Object of env vars injected into the child process.                 |
| `url`         | http / sse / ws     | Endpoint URL (`https://...`, `https://.../sse`, `wss://...`).       |
| `headers`     | http / sse / ws     | Static request headers (e.g. `Authorization: Bearer ...`).           |
| `headersHelper` | http / sse / ws   | Path or shell command that prints a JSON object of headers to stdout (10 s timeout, runs per connection). |
| `oauth`       | http / sse          | `{ clientId?, clientSecret?, callbackPort?, scopes?, authServerMetadataUrl? }`. |
| `timeout`     | all                 | Per-tool-call wall-clock limit in ms; `1000`+ overrides `MCP_TOOL_TIMEOUT`. Hard 60 s minimum for HTTP/SSE first-byte. |
| `alwaysLoad`  | all                 | If `true`, tools from this server load into context at session start (no tool-search deferral). Also blocks startup until connected. |
| `disabled`    | all                 | Skip the server without removing the config.                         |

### Environment variable expansion

Supported in `command`, `args`, `env`, `url`, `headers`:

- `${VAR}` — expand `$VAR`; fails if unset.
- `${VAR:-default}` — fall back to `default` when unset.

Plugin-provided configs substitute `${CLAUDE_PLUGIN_ROOT}` /
`${CLAUDE_PLUGIN_DATA}` directly. For project or user scopes, project-relative
expansion must default explicitly: `${CLAUDE_PROJECT_DIR:-.}`.

### Full example — stdio + http + ws mix

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${HOME}/projects"],
      "env": {
        "LOG_LEVEL": "info"
      },
      "timeout": 600000
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      }
    },
    "events-push": {
      "type": "ws",
      "url": "wss://mcp.example.com/socket",
      "headers": {
        "Authorization": "Bearer ${EVENTS_TOKEN}"
      }
    },
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    },
    "core-tools": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "alwaysLoad": true
    }
  }
}
```

### Full example — team-shared `.mcp.json` with OAuth + headersHelper

```json
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {
        "scopes": "org:read event:read"
      }
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--dsn", "${DATABASE_URL}"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "company-internal": {
      "type": "stdio",
      "command": "/usr/local/bin/company-mcp-server",
      "args": ["--config", "/etc/company/mcp-config.json"],
      "env": {
        "COMPANY_API_URL": "https://internal.example.com"
      }
    }
  }
}
```

---

## Scopes (precedence & storage)

| Scope   | Loads in               | Shared with team | Stored in                                                       |
| ------- | ---------------------- | ---------------- | --------------------------------------------------------------- |
| local   | current project only   | no               | `~/.claude.json` under `projects["<cwd>"].mcpServers`           |
| project | current project only   | yes (git)        | `.mcp.json` at project root                                     |
| user    | all your projects      | no               | `~/.claude.json` (top-level `mcpServers`)                       |
| managed | all machines fleet-wide | yes (admin)     | `/Library/Application Support/ClaudeCode/managed-mcp.json` (macOS), `/etc/claude-code/managed-mcp.json` (Linux/WSL), `C:\Program Files\ClaudeCode\managed-mcp.json` (Windows) |

The three local-scope rules in detail:

- **Local** is the default for `claude mcp add`. It writes to
  `~/.claude.json` *inside the project's entry* (not the project file), so it
  stays private to you on this machine.
- **Project** writes to `.mcp.json` (intended to be committed). For safety
  reasons Claude Code prompts for approval before using project-scoped
  servers; reset choices with `claude mcp reset-project-choices`.
- **User** writes to `~/.claude.json` at the top level, so the server is
  available across every project on the machine but stays private to your
  account.

The reserved server name is `workspace` — Claude Code skips a server named
`workspace` and asks you to rename it.

### Precedence

When the same server is defined in multiple places, the highest-precedence
source wins *whole* (fields are not merged across scopes):

1. local
2. project
3. user
4. plugin-provided
5. claude.ai connectors

Local + project + user match by **name**. Plugin + claude.ai match by
**endpoint** (URL or command), so two entries pointing at the same endpoint
are treated as duplicates.

---

## Adding MCP servers (`claude mcp add`)

```bash
# HTTP (recommended for remote)
claude mcp add --transport http notion https://mcp.notion.com/mcp
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"

# SSE (deprecated; prefer HTTP where possible)
claude mcp add --transport sse asana https://mcp.asana.com/sse

# stdio (local process)
claude mcp add --env AIRTABLE_API_KEY=YOUR_KEY --transport stdio airtable \
  -- npx -y airtable-mcp-server

# WebSocket — only via add-json, not --transport
claude mcp add-json events-server \
  '{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer TOKEN"}}'

# Inline JSON (full config in one go)
claude mcp add-json weather-api \
  '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'

# Pick the scope
claude mcp add --transport http stripe --scope project https://mcp.stripe.com
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic

# Manage existing servers
claude mcp list
claude mcp get github
claude mcp remove github

# Import from Claude Desktop (macOS / WSL only)
claude mcp add-from-claude-desktop

# Reuse Claude Code itself as an MCP server
claude mcp serve
```

Important syntax rules:

- `--` separates Claude's own flags from the stdio server's argv. Everything
  after `--` is passed verbatim. Without it, server flags like `--port` are
  parsed by Claude Code.
- `--env KEY=value` accepts multiple pairs, but the server name must NOT come
  immediately after `--env` (Claude Code would misread it as another pair).
  Place at least one other option between them.
- `--callback-port <PORT>` pins the OAuth redirect port to match a
  pre-registered redirect URI.
- `--client-id` / `--client-secret` register pre-existing OAuth credentials.
  `--client-secret` prompts with masked input; `MCP_CLIENT_SECRET=...` skips
  the prompt in CI.

---

## Subagent MCP scoping (`mcpServers` frontmatter)

Subagent YAML files accept an `mcpServers` list. Each entry is either:

1. **Inline definition** — full server config keyed by name. Claude Code
   connects when the subagent starts and disconnects when it finishes. The
   parent session never sees those tools.
2. **String reference** — just the server name, reusing an already-configured
   server from the parent session. The connection is shared.

```yaml
---
name: browser-tester
description: Tests features in a real browser using Playwright
mcpServers:
  # Inline — scoped to this subagent only
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  # Reference — shares the parent's connection
  - github
---
Use the Playwright tools to navigate, screenshot, and interact with pages.
```

### Why inline here and not in `.mcp.json`?

Inline `mcpServers` keep tool **descriptions** out of the main conversation's
context. The subagent gets the tools; the parent stays lean. This is the
recommended pattern for "heavy" servers like Playwright or Puppeteer that
have many tools with long descriptions.

### Plugin subagents — what is NOT supported

For security reasons, plugin subagents do **not** support the `hooks`,
`mcpServers`, or `permissionMode` frontmatter fields. Those fields are
silently ignored when loading agents from a plugin. To use them, copy the
agent file into `.claude/agents/` (project) or `~/.claude/agents/` (user).

### v2.1.153+ restrictions applied to inline subagent servers

As of Claude Code v2.1.153, the same restrictions that apply to the main
session also filter servers declared in subagent frontmatter:

- `--strict-mcp-config` and `--bare` flags
- Enterprise `managed-mcp.json`
- `allowedMcpServers` / `deniedMcpServers` policies

A blocked server is **skipped with a warning naming it**. Managed-settings
restrictions apply to every subagent regardless of how it is defined. The
exception: `--strict-mcp-config` does **not** filter servers passed inline
via `--agents` or the SDK `agents` option — those are explicit caller input.

### Plugin MCP tool naming

For tools from a plugin-bundled MCP server, the callable name embeds the
plugin name too:

```
mcp__plugin_<plugin-name>_<server-name>__<tool>
```

Non-alphanumeric chars in any segment become `_`. Use this full name in
permission rules, `allowed-tools`, and a subagent's `tools` field.

### Tool-naming regex

MCP tool names match `^mcp__(?:plugin_[A-Za-z0-9_-]+_)?[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$`.

Examples:

- `mcp__github__list_issues` — manual `github` server, tool `list_issues`.
- `mcp__plugin_my-plugin_database-tools__query` — plugin `my-plugin`,
  server `database-tools`, tool `query`.
- `mcp__remote-api__*` — wildcard matches any tool from `remote-api`.

---

## Restriction mechanisms

### `managed-mcp.json` (exclusive control)

When present, **only** the servers listed in this file load. Users cannot
add, modify, or use any other MCP server — including plugin-provided ones
(unless `allowAllClaudeAiMcps: true` is also set in a managed settings
source). Delivered via MDM / GPO / fleet management.

```json
{ "mcpServers": {} }                // disable MCP entirely
{ "mcpServers": { "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" } } }
```

### `allowedMcpServers` / `deniedMcpServers` (policies)

Lists of `{ serverUrl | serverCommand | serverName }` entries that filter
which configured servers are allowed to load. Denylist always wins.
Allowlist matches are:

- Remote (HTTP / SSE): a `serverUrl` entry. `serverName` only matches if no
  `serverUrl` entries exist.
- Stdio: a `serverCommand` entry. `serverName` only matches if no
  `serverCommand` entries exist.

| Match key      | Scope          | Wildcard | Example                                                     |
| -------------- | -------------- | -------- | ----------------------------------------------------------- |
| `serverUrl`    | HTTP / SSE     | `*`      | `https://mcp.example.com/*`, `https://*.internal.example.com/*`, `*://mcp.example.com/*` |
| `serverCommand` | stdio         | none     | `["npx", "-y", "@modelcontextprotocol/server-filesystem", "."]` (exact match incl. args) |
| `serverName`   | either         | none     | `"github"` (label assigned by user — not a security control) |

Setting `allowManagedMcpServersOnly: true` locks the allowlist to managed
sources only (so user/project allowlists cannot broaden it). Denylists
still merge from every source.

### CLI flags

| Flag                  | Effect                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `--strict-mcp-config` | Only honor the explicitly-provided `--mcp-config` file; ignore user/project/managed configs.       |
| `--bare`              | Like `--strict-mcp-config` but for all config (skills, subagents, hooks, etc.).                     |
| `--mcp-config <path>` | Path to a JSON file with an `mcpServers` map to load exclusively (used with `--strict-mcp-config`). |

### Server name vs. endpoint restriction

Allowlisting by `serverName` is **not a security control** — the name is the
label the user picks when running `claude mcp add`, so a user can call any
server `github`. Use `serverCommand` or `serverUrl` to actually pin which
server runs.

---

## OAuth flows

Claude Code supports OAuth 2.0 / 2.1 for HTTP / SSE MCP servers.

1. **Auto-detection.** A server responding `401 Unauthorized` or `403 Forbidden`
   is flagged in `/mcp`. A `WWW-Authenticate` header pointing at an
   authorization server gets the same auto-discovery.
2. **Browser flow.** Run `/mcp`, pick the server, complete the OAuth dance in
   the browser. Tokens are stored in the OS keychain (macOS) or a credentials
   file, and refreshed automatically. Use "Clear authentication" in `/mcp` to
   revoke.
3. **Fixed callback port.** `--callback-port 8080` matches a pre-registered
   redirect URI of the form `http://localhost:8080/callback`.
4. **Pre-configured credentials.** `--client-id` + `--client-secret` for
   servers that don't support Dynamic Client Registration. Some hosts also
   expose a Client ID Metadata Document (CIMD) that Claude Code discovers
   automatically.
5. **Static header override.** If you set `headers.Authorization` and the
   server rejects it, Claude Code reports the connection as failed — there is
   no silent OAuth fallback. Remove the header to enable the OAuth flow.
6. **Scope pinning.** `oauth.scopes` in `.mcp.json` pins the scopes Claude
   Code requests (single space-separated string, per RFC 6749 §3.3). If the
   auth server advertises `offline_access` Claude Code appends it so the
   token can be refreshed.
7. **Metadata override.** `oauth.authServerMetadataUrl` (v2.1.64+) points at
   a specific OAuth metadata URL, bypassing the RFC 9728 → RFC 8414
   well-known chain.
8. **Anthropic-hosted OAuth restrictions.** Connectors like Microsoft 365,
   Gmail, and Google Calendar don't support local OAuth from Claude Code —
   the upstream IdP only accepts claude.ai's redirect URL. Authenticate via
   claude.ai Settings → Connectors; the connector shows up in Claude Code
   automatically.

### `headersHelper` (non-OAuth auth)

For Kerberos, short-lived tokens, internal SSO, etc., point at a script that
emits a JSON object of headers to stdout. Claude Code runs it with a 10 s
timeout at each new connection (no caching) and merges the output into
request headers, overriding any matching static header. The helper receives:

- `CLAUDE_CODE_MCP_SERVER_NAME` — the configured server name.
- `CLAUDE_CODE_MCP_SERVER_URL` — the configured server URL.

```json
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    }
  }
}
```

`headersHelper` executes arbitrary shell commands. When defined at project
or local scope it only runs **after** you accept the workspace trust dialog.

---

## Tool naming & permission rules

MCP tools use the convention:

```
mcp__<server-name>__<tool-name>
```

Characters outside `[A-Za-z0-9_-]` become `_`. Plugin MCP tools add the
plugin prefix (see above).

### Allowlist / denylist patterns

In `settings.json` `permissions.allow` / `permissions.deny`, in a skill's
`allowed-tools`, or in a subagent's `tools` field, these patterns work:

| Pattern                              | Matches                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `mcp__github__list_issues`           | One specific tool                                    |
| `mcp__github__*`                     | All tools from `github`                              |
| `mcp__plugin_my-plugin_db-tools__*`  | All tools from that plugin-scoped server             |
| `mcp__github`                        | **Removes all tools from `github`** (server-level)   |
| `mcp__*`                             | Removes all MCP tools                                |
| `mcp__plugin_my-plugin_db-tools`     | Removes that plugin server's tools                   |

The bare-server-name and bare-`mcp__*` patterns are useful for **denylists**
to scope down an over-broad allowlist. They cannot grant tools (use the
`__*` wildcard form instead).

---

## Lifecycle: connect / disconnect / reconnect

- **Session startup.** Claude Code connects to all enabled servers. With tool
  search enabled (the default), missing-in-progress servers are waited for
  inside `ToolSearch`; without tool search, `WaitForMcpServers` handles it.
  Servers with `alwaysLoad: true` block startup until connected (5 s
  connect-timeout).
- **Subagent start.** Inline `mcpServers` connect when the subagent starts.
- **Subagent finish.** Inline servers disconnect. The parent's shared
  servers remain.
- **Plugin enable / disable.** Run `/reload-plugins` to connect / disconnect
  plugin MCP servers mid-session.
- **Dynamic updates.** Servers can emit MCP `list_changed` notifications to
  refresh tools/prompts/resources without reconnect.
- **Mid-session failure.** HTTP / SSE servers auto-reconnect with exponential
  backoff: up to 5 attempts, starting at 1 s and doubling. After 5 failures
  the server is marked failed; `/mcp` lets you retry manually. As of v2.1.121,
  initial HTTP/SSE startup also retries up to 3 times on transient errors
  (5xx, refused, timeout). Auth and not-found errors are not retried.
- **stdio servers** are local processes — no auto-reconnect. Restart
  manually.

### Connection states in `claude mcp list` and `/mcp`

- `connected` — live.
- `⏸ Pending approval` — project-scoped, awaiting approval (run Claude
  interactively to approve).
- `✗ Rejected` — approval denied.
- `failed` — 5+ failed reconnect attempts.

### Approval reset

To re-prompt for project-scope approval after a config change:
`claude mcp reset-project-choices`.

### Output limits

- Default `MAX_MCP_OUTPUT_TOKENS` = 25 000. Above 10 000 a warning shows.
- Override: `export MAX_MCP_OUTPUT_TOKENS=50000` before `claude`.
- Server authors can opt a tool out of the persist-to-disk threshold with
  `_meta["anthropic/maxResultSizeChars"]` (hard ceiling 500 000 chars). This
  does not affect image content — for those, raise `MAX_MCP_OUTPUT_TOKENS`.
- Truncate tool descriptions and server instructions at 2 KB each; put the
  most important info first.

### Resources, prompts, elicitation, channels

- **Resources.** Reference with `@server:protocol://path` (e.g.
  `@github:issue://123`). Multiple resources can be attached in one prompt.
- **Prompts.** Surface as `/mcp__<server>__<prompt>` slash commands (and
  inline `/mcp__github__pr_review 456` for argumented prompts).
- **Elicitation.** Server requests structured input mid-task. Two modes —
  form fields and URL auth — appear automatically. Auto-respond with the
  `Elicitation` hook.
- **Channels.** Server declares the `claude/channel` capability and you opt
  in with `--channels` at startup; events push into your session
  (Telegram/Discord/CI webhooks).

---

## Common MCP servers

| Server / namespace     | Transport | Use case                                                   |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `github`               | http      | Issues, PRs, reviews, repo search                          |
| `slack`                | http      | Channels, DMs, search, message send                        |
| `filesystem`           | stdio     | `@modelcontextprotocol/server-filesystem` — sandboxed fs   |
| `postgres`             | stdio     | `@modelcontextprotocol/server-postgres` — SQL via DB       |
| `dbhub` (bytebase)     | stdio     | Multi-driver SQL (`@bytebase/dbhub`)                       |
| `sentry`               | http      | Error monitoring, stack traces, release health            |
| `notion`               | http      | Notion pages / databases                                   |
| `asana`                | sse       | Tasks / projects (SSE; prefer HTTP where available)        |
| `airtable`             | stdio     | Bases / records                                            |
| `paypal`               | http      | Payments                                                   |
| `stripe`               | http      | Payments                                                   |
| `hubspot`              | http      | CRM                                                        |
| `figma`                | http      | Design files (Figma plugin)                                |
| `playwright` / `puppeteer` | stdio | Browser automation, screenshots, scraping                  |
| `claude-code-docs`     | http      | `https://code.claude.com/docs/mcp` — bundled docs search   |
| `mcp-server-dev` plugin | stdio/http | Scaffold a new MCP server (`/mcp-server-dev:build-mcp-server`) |

For a vetted catalog, see the Anthropic Directory; entries there are the same
MCP infrastructure you can `claude mcp add` directly.

---

## Security considerations

1. **Servers fetch external content.** Any untrusted content (web pages,
   issue bodies, Slack messages) becomes prompt-injection surface. Verify
   you trust each server before connecting. Anthropic reviews Directory
   listings but does not security-audit servers.
2. **Never put secrets in `managed-mcp.json`.** It is readable by every user
   on the machine. Use `${VAR}`, OAuth, per-user headers, or `headersHelper`
   to inject per-user credentials.
3. **Project-scoped servers need approval.** `.mcp.json` is shared via git;
   Claude Code prompts before using it. Don't smuggle credentials through
   `env` blocks intended to be committed.
4. **`headersHelper` runs shell.** Treat it like any untrusted-input source
   and require workspace trust before project/local-scoped helpers run.
5. **`serverName` is not a security boundary.** Restrict by `serverUrl` or
   `serverCommand`; a user can rename a server to anything they want.
6. **Tool descriptions cost context.** Every MCP tool description and every
   server instructions block is loaded into the model's context window
   (truncated at 2 KB). Bundle related servers into one server, use
   `alwaysLoad: true` only when truly needed, and put critical info first.
   For tools a subagent needs but the parent doesn't, define them inline
   in the subagent's `mcpServers` to keep them out of the parent context.
7. **OAuth tokens are sensitive.** They are stored in the OS keychain on
   macOS or a credentials file elsewhere; treat the file with the same
   caution as an `.env`. Use "Clear authentication" in `/mcp` to revoke.
8. **OAuth-scope pinning.** Pin `oauth.scopes` to the minimum the upstream
   server needs. A `403 insufficient_scope` for a tool call re-auths with
   the same pinned scopes, so widen only when a tool genuinely needs more.
9. **Auto-reconnect hides transient errors.** Failed HTTP/SSE startup
   retries up to 3 times; after 5 mid-session drops the server is marked
   failed. Auth and not-found errors don't retry — they indicate a config
   problem.
10. **Disabling MCP.** `managed-mcp.json` with `{ "mcpServers": {} }` blocks
    every server silently (no warning to the user). Tell users what changed
    before deploying.

### Tool description context cost — sizing rules of thumb

- Each tool description: ~1–2 KB of typical content.
- Truncation cap: 2 KB per tool description, 2 KB per server instructions.
- With ~50 servers × ~20 tools each = 1 000 tool descriptions, naive
  loading would consume ~1–2 MB of context. Tool search defers all of this
  to a single search step that returns only what Claude uses per turn.

---

## Troubleshooting

| Symptom                                                | Likely cause / fix                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `spawn claude ENOENT` (Claude-as-server)               | `command` field has no PATH entry; specify full path with `which claude`.                                                     |
| `Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers` | `managed-mcp.json` is in effect. Use only the servers it lists.                                                  |
| `Cannot add MCP server "x": server is explicitly blocked by enterprise policy` | `deniedMcpServers` matched. Rename or use a different command/URL.                                                  |
| `Cannot add MCP server "x": not allowed by enterprise policy` | No `allowedMcpServers` match. Add a `serverUrl` / `serverCommand` entry.                                              |
| Server in `/mcp` shows `⏸ Pending approval`            | Project-scoped server awaiting approval. Run `claude` interactively or `claude mcp reset-project-choices`.                   |
| Server silently disappears after policy change         | Expected — no warning. Tell users which servers were blocked.                                                                 |
| 401 / 403 from remote server                           | Run `/mcp` to complete OAuth. If you set `headers.Authorization`, remove it to enable the OAuth flow.                         |
| OAuth browser doesn't open                              | Copy the URL printed in Claude Code and open it manually.                                                                    |
| `Incompatible auth server: does not support dynamic client registration` | Pre-configure OAuth: `--client-id` + `--client-secret`.                                                          |
| Initial HTTP/SSE connection fails                      | Transient → retried up to 3× since v2.1.121. Auth / not-found → not retried; fix config.                                     |
| Connection times out                                   | Default MCP startup is 5 s for `alwaysLoad`; use `MCP_TIMEOUT=10000 claude` to extend.                                        |
| Tool call times out                                    | `MCP_TOOL_TIMEOUT` default ~28 h; per-server `timeout` field overrides. Min 1000 ms; HTTP/SSE first-byte ≥ 60 s.              |
| Tools listed but not callable                          | Missing in `allowedTools` / `permissions.allow`. For subagents, check `tools` and `mcpServers`.                              |
| `mcp__<server>` pattern in tools field does nothing    | That syntax is for **denylists**. Use `mcp__<server>__*` to allow.                                                            |
| Plugin subagent ignores `mcpServers` frontmatter      | Intended. Copy agent to `.claude/agents/` or `~/.claude/agents/`.                                                             |
| `workspace` server skipped at load                     | Reserved name; rename it.                                                                                                     |
| Huge tool output truncated                             | Raise `MAX_MCP_OUTPUT_TOKENS` or ask server author to add `_meta["anthropic/maxResultSizeChars"]`.                            |
| Tools not loaded via ToolSearch                        | On Vertex AI or with non-first-party `ANTHROPIC_BASE_URL`, set `ENABLE_TOOL_SEARCH=true` explicitly (Haiku does not support tool_reference). |

### Connection lifecycle debugging commands

```bash
claude mcp list                 # overall status (incl. pending / failed / rejected)
claude mcp get <name>           # one server, full config + status
/mcp                            # interactive panel (auth, retry, alwaysLoad)
/status                        # which auth method is active (affects claude.ai connectors)
ENABLE_TOOL_SEARCH=false claude # disable deferral and load all tools upfront
```

---

## Cross-cutting config example

For this monorepo, `.mcp.json` at the project root is the recommended spot
for shared team servers. Common starting set:

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${CLAUDE_PROJECT_DIR:-.}"],
      "timeout": 600000
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      }
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

`filesystem` is shared by every team member, `github` uses a per-user PAT
from env, and `playwright` is intentionally **not** added to `.mcp.json`
because its tool descriptions are noisy in the parent conversation —
prefer scoping it inline to the subagent that needs it.

---

## Sources

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/managed-mcp
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-sdk/mcp
- https://code.claude.com/docs/en/mcp-quickstart
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/server-managed-settings
- https://modelcontextprotocol.io/
- https://github.com/anthropics/claude-code/releases/tag/v2.1.153

## Related

- [[subagents]] — `mcpServers` frontmatter, inline vs reference, plugin restrictions.
- [[workflows]] — `.claude/` directory layout where `.mcp.json` lives.
- [[skills-overview]] — `/mcp__<server>__<prompt>` slash commands vs skill commands.
- [[skills-frontmatter]] — `allowed-tools` patterns overlap with MCP tool names.
- [[skills-invocation]] — auto-approve vs prompt for MCP tool calls.
- [[goals]] — `MAX_MCP_OUTPUT_TOKENS` / `MCP_TIMEOUT` are session goals worth tracking.
- [[loops-and-scheduling]] — `--channels` flag piggybacks on the MCP plumbing for push events.
- [[orpc-bridge]] — oRPC server is an alternative to MCP for typed local RPC; useful contrast.
- [[monorepo-structure]] — `.mcp.json` placement at repo root for team sharing.
- [[ci-cd-patterns]] — CI workflow pattern of one-action-per-file applies to MCP management tasks too.
