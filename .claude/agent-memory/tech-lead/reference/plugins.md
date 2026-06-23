---
name: plugins
description: Claude Code plugin system — bundled distributions of skills, agents, hooks, MCP servers, and LSP servers via marketplaces, with full manifest schema, namespacing, scopes, subagent restrictions, and security model.
metadata:
  type: reference
---

# Claude Code Plugins

A complete reference to the Claude Code plugin system: what plugins are, how they are
authored, packaged, distributed, namespaced, scoped, secured, and consumed. This is the
"shippable, versioned, redistributable" counterpart to the in-repo `.claude/`
configuration described in [[skills-overview]].

Plugins let you extend Claude Code with custom functionality that can be shared across
projects and teams. A plugin is a self-contained directory of components — skills,
agents, hooks, MCP servers, LSP servers, and monitors — that gets installed once and
loaded into every relevant session.

## What a Plugin Is

A plugin is **not** a single file. It is a directory tree that bundles one or more
extension points behind a manifest and ships through a marketplace. Compared to
dropping a `SKILL.md` or `agents/*.md` into `.claude/`, a plugin:

- Is **versioned** (semver in `plugin.json`, or git commit SHA as fallback).
- Is **namespaced** — its skills, commands, and agents are prefixed with the plugin
  name to avoid collisions across plugins.
- Is **scoped** to a user, project, local checkout, or managed settings.
- Is **distributed** through a marketplace catalog (`marketplace.json`) which
  references each plugin's source.
- Is **cached** on the user's machine in `~/.claude/plugins/cache/<name>/<version>/`
  after install, with the previous version kept for ~7 days for graceful rollover.
- May bundle its own **MCP servers** and **LSP servers** that activate when the
  plugin is enabled.

## When to Use a Plugin vs `.claude/`

| Approach | Invocation | Best for |
| --- | --- | --- |
| Standalone `.claude/` | `/hello` | Personal workflows, project-specific tweaks, quick experiments, short names |
| Plugin | `/plugin-name:hello` | Sharing with teammates, community distribution, versioned releases, multi-project reuse |

Start standalone in `.claude/` for fast iteration, then convert to a plugin when you
need to share, version, or distribute. See [[skills-overview]] for the standalone path.

## Plugin Directory Structure

Only `plugin.json` lives inside `.claude-plugin/`. Every other component directory
(`commands/`, `agents/`, `skills/`, `hooks/`, `output-styles/`, `themes/`,
`monitors/`) must be at the **plugin root**, not nested under `.claude-plugin/`.

A `CLAUDE.md` at the plugin root is **not** loaded as project context. Plugins
contribute context through skills, agents, and hooks only.

```text
enterprise-plugin/
├── .claude-plugin/
│   └── plugin.json            # manifest (the only file in .claude-plugin/)
├── skills/                    # skills/ folders with SKILL.md
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
├── commands/                  # flat .md skills (legacy; prefer skills/)
│   ├── status.md
│   └── logs.md
├── agents/                    # subagent .md definitions
│   ├── security-reviewer.md
│   ├── performance-tester.md
│   └── compliance-checker.md
├── output-styles/             # output style .md files
│   └── terse.md
├── themes/                    # color theme .json files
│   └── dracula.json
├── monitors/                  # background monitors
│   └── monitors.json
├── hooks/
│   ├── hooks.json             # primary hook config
│   └── security-hooks.json    # additional hooks
├── .mcp.json                  # MCP server definitions
├── .lsp.json                  # LSP server configurations
├── bin/                       # executables added to Bash tool PATH
│   └── my-tool
├── settings.json              # default settings when plugin is enabled
├── scripts/                   # scripts referenced by hooks/MCP/LSP
│   ├── security-scan.sh
│   ├── format-code.py
│   └── deploy.js
├── README.md                  # user-facing docs (recommended)
├── LICENSE                    # SPDX license file
└── CHANGELOG.md               # version history
```

A single-skill plugin can place `SKILL.md` directly at the plugin root (no
`skills/` subdir). The skill's invocation name comes from frontmatter `name`, or
falls back to the directory basename — important for marketplace installs, where
the install directory name is a version string that changes on every update.

## `.claude-plugin/plugin.json` Manifest Schema

The manifest is **optional**. If omitted, Claude Code auto-discovers components in
their default locations and derives the plugin name from the directory name. Include
a manifest when you need to provide metadata, pin a version, declare dependencies,
or override default paths.

### Complete Schema

```json
{
  "name": "plugin-name",
  "displayName": "Plugin Display Name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "skills": "./custom/skills/",
  "commands": ["./custom/commands/special.md"],
  "agents": ["./custom/agents/reviewer.md"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json",
  "experimental": {
    "themes": "./themes/",
    "monitors": "./monitors.json"
  },
  "userConfig": { },
  "channels": [ ],
  "dependencies": [
    "helper-lib",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ],
  "defaultEnabled": true,
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json"
}
```

### Field Reference

**Core / metadata fields**

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `name` | yes (if manifest present) | string (kebab-case) | Unique ID. Regex `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. Used for namespacing: `/<name>:<skill>`. |
| `displayName` | no | string | Human-readable label in `/plugin` picker. May contain spaces. v2.1.143+. |
| `version` | no | string (semver) | MAJOR.MINOR.PATCH. If set, users only get updates when bumped. |
| `description` | no | string | 50-200 chars recommended; shown in plugin manager. |
| `author` | no | object | `{name, email?, url?}`. `name` required. |
| `homepage` | no | string (URL) | Plugin docs / landing page. |
| `repository` | no | string or object | Source repo. Object form: `{type, url, directory}`. |
| `license` | no | string (SPDX) | e.g. `MIT`, `Apache-2.0`, `GPL-3.0`. |
| `keywords` | no | string[] | 5-10 discovery tags. |
| `defaultEnabled` | no | boolean | Default `true`. Set `false` for opt-in plugins (e.g. ones connecting to paid external services). v2.1.154+. |
| `$schema` | no | string (URL) | JSON Schema URL for editor autocomplete. Ignored at load. |

**Component path fields** — all relative to plugin root, must start with `./`:

| Field | Type | Default | Replaces or extends? |
| --- | --- | --- | --- |
| `skills` | string \| string[] | `./skills/` | **Extends** the default scan; list explicit subdirs to avoid double-loading |
| `commands` | string \| string[] | `./commands/` | **Replaces** default |
| `agents` | string \| string[] | `./agents/` | **Replaces** default |
| `outputStyles` | string \| string[] | `./output-styles/` | **Replaces** default |
| `lspServers` | string \| string[] \| object | `./.lsp.json` | **Merges** with default |
| `hooks` | string \| string[] \| object | `./hooks/hooks.json` | **Merges** with default |
| `mcpServers` | string \| string[] \| object | `./.mcp.json` | **Merges** with default |
| `experimental.themes` | string \| string[] | `./themes/` | **Replaces** default |
| `experimental.monitors` | string \| string[] | `./monitors/monitors.json` | **Replaces** default |

**Unrecognized fields are silently ignored** (with a `claude plugin validate`
warning), so you can keep fields that other ecosystems (VS Code, npm, MCPB/DXT)
use. Wrong-type values still error. Use `claude plugin validate --strict` in CI to
treat warnings as errors.

### `userConfig` — Prompted-at-Enable Values

Declare values Claude Code asks the user for when enabling the plugin, instead of
hand-editing settings:

```json
{
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    },
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

Available types: `string`, `number`, `boolean`, `directory`, `file`. Optional fields:
`sensitive` (masked input, stored in OS keychain or `~/.claude/.credentials.json`),
`required`, `default`, `multiple` (string arrays), `min`/`max` (numbers).

Values are substituted inline as `${user_config.KEY}` in MCP/LSP configs, hook
commands, and monitor commands. Non-sensitive values can also be substituted in
skill/agent content. All values are exported to subprocesses as
`CLAUDE_PLUGIN_OPTION_*` env vars. The keychain has a ~2 KB total cap shared with
OAuth tokens — keep sensitive values small.

### `dependencies`

```json
{
  "dependencies": [
    "helper-lib",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ]
}
```

Other plugins this one requires, with optional semver constraints. Cross-marketplace
dependencies must be allowlisted via the marketplace's
`allowCrossMarketplaceDependenciesOn` field, otherwise the install is blocked.

## Plugin Components

### `commands/` — Slash Commands (legacy style)

Flat `.md` files where the file basename becomes the slash command name (prefixed
with the plugin name: `/<plugin>:<command>`). Prefer the `skills/` layout for new
plugins — it supports arguments, supporting files, and richer SKILL.md frontmatter
(see [[skills-frontmatter]]).

### `skills/` — Skills

Directory-of-SKILL.md layout. Each subdirectory is one skill; supporting files
(`reference.md`, `scripts/`, etc.) are loaded alongside. Skill names follow the
plugin's namespace (`/hello/` in plugin `my-first-plugin` → `/my-first-plugin:hello`).
See [[skills-overview]] and [[skills-invocation]].

The `name` field in `SKILL.md` frontmatter controls the invocation name and gives
it a stable identity independent of the install directory.

### `agents/` — Subagents

Markdown files describing specialized subagents. Plugin agents are loaded alongside
built-in Claude agents and appear in the `/agents` interface; Claude can invoke them
automatically by context or the user can call them manually.

Supported frontmatter: `name`, `description`, `model`, `effort`, `maxTurns`,
`tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation` (only
`"worktree"` is valid). See [[subagents]] for the full subagent spec.

### `hooks/` — Event Handlers

`hooks/hooks.json` (or inline in `plugin.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh" }
        ]
      }
    ]
  }
}
```

Hook types: `command` (shell), `http` (POST JSON), `mcp_tool` (call MCP tool),
`prompt` (LLM eval with `$ARGUMENTS`), `agent` (agentic verifier). Plugin hooks
respond to the full Claude Code lifecycle, including `SessionStart`, `UserPromptSubmit`,
`PreToolUse`/`PostToolUse`/`PostToolUseFailure`, `SubagentStart`/`SubagentStop`,
`Stop`/`StopFailure`, `PreCompact`/`PostCompact`, `PermissionRequest`/`PermissionDenied`,
`WorktreeCreate`/`WorktreeRemove`, `FileChanged`, `CwdChanged`, `ConfigChange`,
`InstructionsLoaded`, `Elicitation`/`ElicitationResult`, `SessionEnd`, etc.

The hook command receives JSON on stdin. Use `jq` to extract fields; use
`${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths and quote the variable
(`"${CLAUDE_PLUGIN_ROOT}"`) in shell-form hooks.

### `.mcp.json` — MCP Servers

```json
{
  "mcpServers": {
    "plugin-database": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_PATH": "${CLAUDE_PLUGIN_ROOT}/data" }
    }
  }
}
```

Plugin MCP servers start automatically when the plugin is enabled and appear as
standard MCP tools in Claude's toolkit. Variable substitution: `${CLAUDE_PLUGIN_ROOT}`,
`${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}`, `${user_config.*}`, any
`${ENV_VAR}`. See the MCP reference memory for the broader protocol.

### `.lsp.json` — LSP Servers

Language Server Protocol configs that give Claude real-time code intelligence
(go to definition, find references, hover info, diagnostics after edits). Requires
the language server binary to be installed on the host — the plugin only wires up
the connection.

Official LSP plugins ship in `claude-plugins-official` for common languages
(`typescript-lsp`, `pyright-lsp`, `rust-analyzer-lsp`, `gopls-lsp`, `clangd-lsp`,
etc.). Build a custom LSP plugin only for languages not already covered.

### `settings.json` — Default Settings

At the plugin root, applied when the plugin is enabled. Currently only the
`agent` and `subagentStatusLine` keys are supported. The `agent` key activates one
of the plugin's custom agents as the main thread, applying its system prompt, tool
restrictions, and model.

Settings from `settings.json` take priority over `settings` declared in
`plugin.json`. Unknown keys are silently ignored.

### `monitors/monitors.json` — Background Monitors (experimental)

```json
[
  {
    "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log"
  },
  {
    "name": "deploy-status",
    "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/poll-deploy.sh ${user_config.api_endpoint}",
    "description": "Deployment status changes",
    "when": "on-skill-invoke:debug"
  }
]
```

Background processes started automatically when the plugin is active. Each stdout
line is delivered to Claude as a notification. `when` is either `"always"` (default,
starts at session start) or `"on-skill-invoke:<skill-name>"`. Plugin monitors run
unsandboxed at the same trust level as hooks, only in interactive CLI sessions, and
require Claude Code v2.1.105+.

Disabling a plugin mid-session does **not** stop already-running monitors; they
stop only when the session ends.

### `bin/` — PATH Injected Executables

Files in `bin/` are added to the Bash tool's `PATH` while the plugin is enabled,
invokable as bare commands without a full path.

### `themes/` — Color Themes (experimental)

JSON files with a `base` preset (`"dark"` or `"light"`) and a sparse `overrides` map
of color tokens. Plugin themes are read-only in `/theme`; pressing `Ctrl+E` on one
copies it into `~/.claude/themes/` for editing.

### `README.md`

User-facing documentation. The plugin manager surfaces this. Strongly recommended
for marketplace distribution.

## Plugin Subagent Restrictions

Plugin-shipped subagents are **inherently less powerful** than agents defined in
`.claude/agents/` of the user's repo. For security reasons, the following
frontmatter fields are **not supported** on plugin agents and are silently ignored:

- `hooks` — plugin agents cannot declare their own lifecycle hooks
- `mcpServers` — plugin agents cannot bring their own MCP servers
- `permissionMode` — plugin agents inherit the calling session's permission mode

**Workarounds**

- **Hooks**: Define the hook at the **plugin level** in `hooks/hooks.json` (or
  inline in `plugin.json`) instead of on the agent. Use `SubagentStart` /
  `SubagentStop` to match the right agent.
- **MCP servers**: Declare the MCP server at the **plugin level** in `.mcp.json`
  (or inline `mcpServers` in `plugin.json`). The plugin's MCP servers are
  available to all of its subagents, plus the main thread, when the plugin is
  enabled.
- **permissionMode**: There is no workaround. Plugin agents run with the same
  permission scope as the parent session. For an agent that needs a restricted
  permission mode, ship it as a project-level agent in `.claude/agents/` rather
  than a plugin.

Open issues track this constraint:
[claude-code#54921](https://github.com/anthropics/claude-code/issues/54921) (docs
clarification) and [claude-code#21560](https://github.com/anthropics/claude-code/issues/21560)
(plugin agents can't see MCP tools — fixed in recent versions but historically
broken).

## Plugin Commands and Agents Namespace

Every component surfaced by a plugin is **always namespaced** with the plugin name.
This is the rule that prevents collisions across plugins.

- A plugin named `my-plugin` exposes:
  - `my-plugin:hello` (skill from `skills/hello/SKILL.md`)
  - `my-plugin:status` (command from `commands/status.md`)
  - `my-plugin:security-reviewer` (agent from `agents/security-reviewer.md`)

The same rule applies to marketplace names:

- `/plugin install formatter@my-marketplace`
- `/plugin install github@claude-plugins-official`
- `/plugin install my-tool@claude-community`

**Subdirectory commands.** A command path can include subdirectories, and they
show up as colon-separated namespaces:

```text
my-plugin/
├── commands/
│   ├── review/
│   │   ├── security.md        # /my-plugin:review:security
│   │   └── performance.md     # /my-plugin:review:performance
│   └── deploy.md              # /my-plugin:deploy
```

**Single-skill plugin shortcut.** A plugin with exactly one skill can place
`SKILL.md` at the plugin root (no `skills/` subdir). With no manifest, the skill
name falls back to the directory basename — which is fragile because marketplace
installs land in `cache/<name>/<version>/` (the version segment changes on every
update). Always set the frontmatter `name` to stabilize it.

To change the namespace prefix, change `name` in `plugin.json`.

## Plugin Installation and Scopes

Plugins are installed in one of four scopes, each writing to a different settings
file:

| Scope | Settings file | Use case |
| --- | --- | --- |
| `user` | `~/.claude/settings.json` | Personal, available across all projects (default) |
| `project` | `.claude/settings.json` | Team-shared, checked into the repo |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | Managed settings (read-only) | Admin-deployed, update-only |

Project-scope plugins go through the workspace-trust gate and have additional
restrictions:

- MCP servers need the same per-server approval as a project `.mcp.json`
- LSP servers only start after workspace trust is granted
- Background monitors do not load

Personal-scope plugins have none of these restrictions.

### Skills-Directory Plugins (`@skills-dir`)

Any folder under a skills directory that contains a `.claude-plugin/plugin.json` is
loaded as a plugin named `<name>@skills-dir` on the next session, with no
marketplace and no install step. Scaffold with `claude plugin init my-tool` →
creates `~/.claude/skills/my-tool/`.

Project-scope `@skills-dir` plugins load only from the `.claude/skills/` of the
directory where you started Claude Code; they don't walk up to the repo root the
way plain skills do. Launch from the repo root, or run `/reload-plugins` after
`cd`-ing around.

A skills directory tree supports three distinct things:

| Path | What it is |
| --- | --- |
| `~/.claude/skills/foo/SKILL.md` (no manifest) | Plain skill named `foo` |
| `~/.claude/skills/foo/.claude-plugin/plugin.json` | Plugin `foo@skills-dir` |
| `~/.claude/skills/foo/skills/bar/SKILL.md` | Skill `bar` packaged inside the plugin |

### Dev / Test Install

Test a plugin in development without publishing:

```bash
claude --plugin-dir ./my-plugin                 # local directory
claude --plugin-dir ./my-plugin.zip             # local zip (v2.1.128+)
claude --plugin-url https://example.com/my-plugin.zip   # remote zip, session-only
```

If a `--plugin-dir` plugin has the same name as an installed marketplace plugin,
the local copy wins for that session (lets you iterate on an already-installed
plugin without uninstalling). Exception: managed settings can force-enable or
force-disable, and `--plugin-dir` cannot override that.

### Reload

Run `/reload-plugins` to pick up changes without restarting. This reloads plugins,
skills, agents, hooks, plugin MCP servers, and plugin LSP servers. Note: changes to
`SKILL.md` take effect immediately; changes to other components need `/reload-plugins`.

`/reload-plugins` invalidates the prompt cache. If a plugin adds MCP tools and
those tools aren't deferred by tool search, you'll see a warning and the reload is
skipped — pass `--force` to override (v2.1.163+).

## Plugin Marketplaces

A marketplace is a catalog (a `marketplace.json` file) that lists plugins and
where to fetch them. It is the unit of distribution. Adding a marketplace is like
adding an app store: nothing installs until you pick a plugin.

### Anthropic Maintained Marketplaces

- `claude-plugins-official` — curated by Anthropic, registered automatically on
  first interactive launch. Install with
  `/plugin install <name>@claude-plugins-official`. Categories: code intelligence
  (LSP plugins), external integrations (GitHub, GitLab, Jira, Linear, Notion,
  Figma, Sentry, etc.), the `security-guidance` automatic review plugin,
  development workflow plugins (`commit-commands`, `pr-review-toolkit`,
  `agent-sdk-dev`, `plugin-dev`), and output-style plugins.
- `claude-plugins-community` — third-party submissions pass automated validation +
  safety screening, then are pinned to a specific commit SHA. Add with
  `/plugin marketplace add anthropics/claude-plugins-community` and install with
  `<name>@claude-community`.
- `claude-code-plugins` — Anthropic's demo marketplace with example plugins.

Several marketplace names are **reserved** and cannot be used by third-party
marketplaces: `claude-code-marketplace`, `claude-code-plugins`,
`claude-plugins-official`, `claude-plugins-community`, `claude-community`,
`anthropic-marketplace`, `anthropic-plugins`, `agent-skills`,
`anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`,
`claude-for-legal`, `claude-for-financial-services`, `financial-services-plugins`,
plus any name that impersonates an official marketplace.

### Adding a Marketplace

```shell
# GitHub shorthand
/plugin marketplace add anthropics/claude-code

# Any git URL (GitLab, Bitbucket, self-hosted) — must end in .git
/plugin marketplace add https://gitlab.com/company/plugins.git
/plugin marketplace add https://gitlab.com/company/plugins.git#v1.0.0   # tag/branch

# Local directory
/plugin marketplace add ./my-marketplace

# Direct path to marketplace.json
/plugin marketplace add ./path/to/marketplace.json

# Remote URL
/plugin marketplace add https://example.com/marketplace.json
```

URL-based marketplaces have limitations with relative plugin paths — prefer git
sources for distribution.

### Marketplace File Schema

`my-marketplace/.claude-plugin/marketplace.json`:

```json
{
  "name": "company-tools",
  "owner": { "name": "DevTools Team", "email": "devtools@example.com" },
  "description": "Internal DevTools plugins",
  "version": "1.0.0",
  "metadata": { "pluginRoot": "./plugins" },
  "allowCrossMarketplaceDependenciesOn": ["claude-plugins-official"],
  "plugins": [
    {
      "name": "code-formatter",
      "source": "./plugins/formatter",
      "description": "Format on save",
      "version": "2.1.0",
      "author": { "name": "DevTools Team" },
      "homepage": "https://docs.example.com/formatter",
      "repository": "https://github.com/company/formatter",
      "license": "MIT",
      "keywords": ["formatting", "ci-cd"],
      "strict": true
    },
    {
      "name": "deployment-tools",
      "source": { "source": "github", "repo": "company/deploy-plugin" }
    }
  ]
}
```

Required: `name` (kebab-case, unique per user), `owner.name`, `plugins[]`.
Optional: `description`, `version`, `metadata.pluginRoot` (base path prepended to
relative `source` paths so you can write `"source": "formatter"` instead of
`"./plugins/formatter"`), `allowCrossMarketplaceDependenciesOn` (whitelist of
marketplaces whose plugins this one may depend on).

### Plugin Entry Sources

The `source` field of each plugin entry can be:

| Form | Example | Notes |
| --- | --- | --- |
| Relative path string | `"./plugins/foo"` | Resolves from marketplace root, not from `.claude-plugin/`. No `../`. Only works for git-added marketplaces. |
| `github` | `{"source": "github", "repo": "owner/repo", "ref": "v2", "sha": "abc..."}` | `ref` = branch/tag (optional), `sha` = exact commit (optional). When both set, `sha` wins. |
| `url` | `{"source": "url", "url": "https://gitlab.com/team/plugin.git"}` | Any git host; `.git` suffix optional. |
| `git-subdir` | `{"source": "git-subdir", "url": "...", "path": "tools/plugin"}` | Sparse clone for monorepos. |
| `npm` | `{"source": "npm", "package": "@acme/claude-plugin", "version": "^2.0.0", "registry": "https://npm.example.com"}` | Installed via `npm install`. |

A marketplace entry can include any field from the plugin manifest schema
(`description`, `version`, `author`, `commands`, `agents`, `hooks`, etc.) plus
marketplace-only fields (`source`, `category`, `tags`, `strict`, `defaultEnabled`).
`strict: true` (default) means `plugin.json` is the authority for components —
marketplace values are ignored if they conflict. `strict: false` lets the
marketplace entry be authoritative, which lets you ship a plugin with no
`plugin.json` at all.

### Auto-Updates

Official Anthropic marketplaces have auto-update on by default; third-party and
local dev marketplaces have it off. Toggle per marketplace in `/plugin` →
Marketplaces, or globally with `DISABLE_AUTOUPDATER=1` /
`FORCE_AUTOUPDATE_PLUGINS=1` env vars. Admins can set `autoUpdate: true` per
marketplace in `extraKnownMarketplaces` to force it on for an org marketplace.

### Team / Project Marketplaces

Add `extraKnownMarketplaces` to `.claude/settings.json` to auto-prompt team
members to add the marketplace when they trust the workspace:

```json
{
  "extraKnownMarketplaces": {
    "my-team-tools": {
      "source": { "source": "github", "repo": "your-org/claude-plugins" }
    }
  }
}
```

Combined with `enabledPlugins` in the same settings file, you can also auto-install
specific plugins for every collaborator.

## Versioning and Distribution

### Version Resolution

The plugin's effective version is resolved from the first of these that is set:

1. `version` in `plugin.json`
2. `version` in the marketplace entry
3. Git commit SHA of the plugin source (for git-based sources)
4. `unknown` (for npm sources or local dirs not in git)

If `plugin.json` is set, **you must bump it** for users to get updates. Pushing
new commits without bumping leaves users on the old version. If iterating quickly,
omit `version` and let the commit SHA carry it.

Use semver (`MAJOR.MINOR.PATCH`): MAJOR for breaking changes, MINOR for new
features, PATCH for bug fixes. Document in `CHANGELOG.md`.

### Distribution Channels

| Channel | Mechanism | Best for |
| --- | --- | --- |
| Git repo via marketplace | `marketplace.json` lists a `github` / `url` / `git-subdir` source | Most published plugins |
| Local path | `marketplace.json` lists a relative path | Monorepos, internal dev |
| Direct URL | `claude --plugin-url` to a `.zip` | CI artifacts, session-only loads |
| npm | `marketplace.json` lists an `npm` source | Plugin as a published npm package |
| Skills-directory | `~/.claude/skills/<name>/.claude-plugin/plugin.json` | Personal, no marketplace needed |

### Caching and File Resolution

Marketplace plugins are copied into `~/.claude/plugins/cache/<name>/<version>/`.
The previous version stays on disk for ~7 days after an update so concurrent
sessions on the old version don't break. Glob/Grep skip orphaned version dirs.

**Installed plugins cannot reference files outside their directory.** Paths like
`../shared-utils` will not work after install because external files aren't
copied. Workarounds:

- Bundle shared files inside the plugin.
- Use symlinks. Within the plugin's own dir: preserved. Elsewhere in the same
  marketplace: dereferenced (target copied in place). Outside the marketplace:
  skipped for security.
- For `--plugin-dir` and local path installs, only intra-plugin symlinks survive.

## Authoring Walkthrough

A complete worked example: a "quality-review" plugin shipped through a local
marketplace.

### 1. Create the directory structure

```bash
mkdir -p my-marketplace/.claude-plugin
mkdir -p my-marketplace/plugins/quality-review-plugin/.claude-plugin
mkdir -p my-marketplace/plugins/quality-review-plugin/skills/quality-review
mkdir -p my-marketplace/plugins/quality-review-plugin/agents
```

### 2. Write the skill

`my-marketplace/plugins/quality-review-plugin/skills/quality-review/SKILL.md`:

```markdown
---
description: Review code for bugs, security, and performance
disable-model-invocation: true
---

Review the code I've selected or the recent changes for:
- Potential bugs or edge cases
- Security concerns
- Performance issues
- Readability improvements

Be concise and actionable.
```

### 3. Add an agent (optional)

`my-marketplace/plugins/quality-review-plugin/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Senior reviewer for code quality. Use for thorough multi-file reviews.
model: sonnet
effort: high
maxTurns: 20
disallowedTools: Write, Edit
---

You are a senior code reviewer. Read the code in question, identify issues across
correctness, security, performance, and maintainability, and return a prioritized
list of findings. Do not modify files; only report.
```

(Note: no `hooks`, `mcpServers`, or `permissionMode` here — see "Plugin
Subagent Restrictions" above.)

### 4. Add a hook (optional)

`my-marketplace/plugins/quality-review-plugin/hooks/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.sh" }
        ]
      }
    ]
  }
}
```

### 5. Write the plugin manifest

`my-marketplace/plugins/quality-review-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "quality-review-plugin",
  "displayName": "Quality Review",
  "version": "1.0.0",
  "description": "Adds a quality-review skill and reviewer agent",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "homepage": "https://docs.example.com/quality-review",
  "repository": "https://github.com/your-org/quality-review-plugin",
  "license": "MIT",
  "keywords": ["code-review", "quality", "security"],
  "defaultEnabled": true
}
```

### 6. Write the marketplace catalog

`my-marketplace/.claude-plugin/marketplace.json`:

```json
{
  "name": "my-plugins",
  "owner": { "name": "Your Name", "email": "you@example.com" },
  "description": "Internal plugin catalog",
  "plugins": [
    {
      "name": "quality-review-plugin",
      "source": "./plugins/quality-review-plugin",
      "description": "Adds a quality-review skill for quick code reviews"
    }
  ]
}
```

### 7. Validate

```bash
claude plugin validate ./my-marketplace/plugins/quality-review-plugin
claude plugin validate ./my-marketplace --strict
```

### 8. Test locally

```bash
claude --plugin-dir ./my-marketplace/plugins/quality-review-plugin
```

Try the skill (`/quality-review-plugin:quality-review`) and the agent
(`/quality-review-plugin:reviewer`) in the session.

### 9. Iterate with /reload-plugins

Edit `SKILL.md` → takes effect immediately. Edit other components → run
`/reload-plugins` to pick up.

### 10. Add the marketplace and install

```bash
/plugin marketplace add ./my-marketplace
/plugin install quality-review-plugin@my-plugins
```

### 11. Submit to community marketplace (optional)

```bash
claude plugin validate ./my-marketplace  # required by review pipeline
```

Submit via the in-app form
(`claude.ai/admin-settings/directory/submissions/plugins/new` for Teams/Enterprise,
`platform.claude.com/plugins/submit` for individuals). Approved plugins are
pinned to a specific commit SHA in `anthropics/claude-plugins-community` and CI
bumps the pin automatically as you push new commits. The catalog syncs nightly.

## CLI Reference

```bash
# Scaffold a skills-dir plugin (no marketplace needed)
claude plugin init <name> [--description ...] [--author ...] [--with skills,agents,hooks,mcp,lsp,output-style,channel] [-f]

# Manage marketplaces
/plugin marketplace add <source>           # GitHub owner/repo, git URL, local path, or remote URL
/plugin marketplace list
/plugin marketplace update <name>
/plugin marketplace remove <name>

# Plugin lifecycle
claude plugin install <plugin>@<marketplace>    # [-s user|project|local]
claude plugin uninstall <plugin>@<marketplace>  # [--keep-data] [--prune] [-y]
claude plugin enable <plugin>@<marketplace>     # [-s scope]
claude plugin disable <plugin>@<marketplace>    # [-s scope]
claude plugin update <plugin>@<marketplace>     # [-s user|project|local|managed]
claude plugin list                              # [--json] [--available]
claude plugin details <plugin>                  # component inventory + token cost
claude plugin prune                             # remove auto-installed orphan deps
claude plugin validate <path> [--strict]        # manifest + components
claude plugin tag                               # [--push] [--dry-run] [-f]
```

## Security

> **Plugins and marketplaces are highly trusted components that can execute
> arbitrary code on your machine with your user privileges. Only install plugins
> and add marketplaces from sources you trust.** — Anthropic docs

There is **no sandboxing** for plugin components by default:

- Hooks and monitors run unsandboxed at the same trust level as the user's hooks.
- Plugin MCP servers run with the user's full environment.
- LSP servers are long-lived subprocesses with the user's permissions.
- Marketplace auto-update can silently introduce new plugin versions.

### Trust Model

- **Anthropic-curated** (`claude-plugins-official`): reviewed by Anthropic, but
  Anthropic explicitly disclaims verifying that every plugin "works as intended."
- **Community marketplace** (`claude-plugins-community`): passes automated
  validation + safety screening. Each plugin is pinned to a specific commit SHA.
  Issue #37340 tracks the concern that marketplace auto-sync can silently install
  new plugins without user consent.
- **Third-party / self-hosted**: trust is transitive. You trust the marketplace
  host, every plugin author in it, and the integrity of every commit in the
  pinned history.

### What to Inspect Before Installing

1. **Read the manifest** — `name`, `description`, `author`, `homepage`,
   `repository`, `license`. Skim for typos in any URL; a misspelled repo is a
   common phishing vector.
2. **Read the README** — what the plugin claims to do.
3. **Read `plugin.json` paths** — `hooks`, `mcpServers`, `lspServers`, and
   `commands` paths reveal what gets executed.
4. **Read `hooks/hooks.json`** — every `type: "command"` hook runs a shell command
   on every matched event. Audit each one.
5. **Read `.mcp.json` / `.lsp.json`** — these spawn long-running processes. Check
   the `command`, `args`, and `env` for exfiltration paths.
6. **Read `userConfig` requirements** — what the plugin asks you to enter. Be
   especially cautious of `sensitive: true` fields.
7. **Check the version** — pin to a known version, or audit the diff against the
   pinned commit SHA on every update.
8. **Use the `/plugin` Will install section** (v2.1.145+) — Claude Code lists
   the exact components a plugin will install before you confirm. Read it.
9. **Run `claude plugin details <name>`** — see the full component inventory and
   projected token cost (always-on vs on-invoke) before enabling.

### Mitigations

- For team deployments, set `strictKnownMarketplaces` in managed settings to
  block unapproved marketplaces. Add specific `blockedMarketplaces` to forbid
  individual ones.
- For project-scope plugins, MCP servers go through per-server approval (same as
  project `.mcp.json`).
- `DISABLE_AUTOUPDATER=1` disables all auto-updates (including plugin updates).
  Pair with `FORCE_AUTOUPDATE_PLUGINS=1` if you want to keep plugin updates on
  while pausing Claude Code updates.
- Pin via `sha` in marketplace entries to make supply-chain attacks harder.
- Prefer project-scope (`.claude/settings.json`) over user-scope for team plugins —
  it goes through workspace trust and shows up in code review.

## Plugin vs Other Distribution Methods

| Method | Where it lives | Installed how | Versioned | Shareable |
| --- | --- | --- | --- | --- |
| `.claude/` in repo | Per-project | Implicit at session start | Git | Yes, via repo |
| Plugin via marketplace | `~/.claude/plugins/cache/...` | `claude plugin install` | `plugin.json` + git SHA | Yes, the whole point |
| Plugin via `claude plugin init` | `~/.claude/skills/<name>/` | Implicit at next session | Git (no marketplace) | No — personal only |
| `claude --plugin-dir ./x` | Not installed | Per-session flag | n/a | Local testing only |
| `claude --plugin-url <zip>` | Not installed | Per-session flag | n/a | One-off |
| npm | npm registry | `npm install` per the plugin's own setup | npm semver | Public, requires a wrapper |

`.claude/` in the repo is the lightest path; a plugin adds namespacing, versioning,
and marketplace distribution on top. The two compose: a project can ship
`.claude/settings.json` with `extraKnownMarketplaces` and `enabledPlugins` to
auto-install a curated set of team plugins alongside the repo's own skills and
agents.

## Debugging

```bash
claude --debug                  # shows plugin loading, manifest errors, skill/agent/hook registration, MCP init
claude plugin validate <path>   # manifest + component validation; --strict for warnings-as-errors
claude plugin details <name>    # full component inventory + per-component token cost
```

### Common Failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| Plugin not loading | Invalid `plugin.json` | Run `claude plugin validate` |
| Skills not appearing | `skills/` is inside `.claude-plugin/` | Move it to the plugin root |
| Hook doesn't fire | Script not executable, or wrong event name | `chmod +x`, check event name (case-sensitive) |
| MCP server fails | Missing `${CLAUDE_PLUGIN_ROOT}` in path | Use the variable, quote it in shell form |
| Path errors | Absolute path used, or missing `./` | Relative paths only, start with `./` |
| `Executable not found in $PATH` (LSP) | Language server binary not installed | Install the binary separately |
| Plugin subagent has no MCP tools | Plugin subagent frontmatter doesn't support `mcpServers` | Declare MCP servers at the plugin level instead |
| "Already at the latest version" after pushing commits | `version` in `plugin.json` wasn't bumped | Bump semver, or omit `version` to use git SHA |
| File references break after install | Plugin references files outside its directory | Bundle inside plugin, or use symlinks |

## Sources

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/agent-sdk/plugins
- https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/plugin-structure/references/manifest-reference.md
- https://github.com/anthropics/claude-plugins-official
- https://github.com/anthropics/claude-code/issues/54921 (subagent frontmatter limitations)
- https://github.com/anthropics/claude-code/issues/21560 (plugin agents and MCP tools)
- https://github.com/anthropics/claude-code/issues/37340 (auto-sync supply-chain)
- https://github.com/anthropics/claude-code/issues/29729 (plugin signing)
- https://pluto.security/blog/claude-extension-ecosystem-security-practitioner-guide/
- https://github.com/STRML/cc-plugin-audit

Related: [[skills-overview]], [[skills-frontmatter]], [[skills-invocation]],
[[subagents]], [[workflows]], [[orpc-bridge]],
[[monorepo-structure]] (project), [[ci-cd-patterns]] (learnings)
