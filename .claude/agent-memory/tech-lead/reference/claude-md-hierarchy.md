---
name: claude-md-hierarchy
description: Complete reference for Claude Code's CLAUDE.md and memory load system — every location, precedence rules, @import syntax, what reaches subagents, .claude/rules/ path-scoped rules, auto memory (MEMORY.md), session behavior (--continue/--resume), what does NOT load, recommended structure, token budget, and common pitfalls.
metadata:
  type: reference
---

# CLAUDE.md and Memory Hierarchy

CLAUDE.md files are **context**, not enforced configuration. Claude reads them at session start and tries to follow them, but there's no guarantee of strict compliance. For hard enforcement, use a `PreToolUse` hook or a `permissions.deny` rule in `settings.json`.

Two complementary memory systems both load at session start:

| | CLAUDE.md | Auto memory |
|---|---|---|
| Who writes | You | Claude |
| Content | Instructions and rules | Learnings and patterns |
| Scope | Project / user / org | Per repo, shared across worktrees |
| Loaded | Every session, **in full** | Every session, **first 200 lines or 25KB of MEMORY.md** |
| Use for | Standards, workflows, architecture | Build commands, debugging insights, discovered prefs |

CLAUDE.md content is delivered as a user message **after the system prompt** — Claude can see it, may not obey it. Specific > concise > vague.

## 1. All load locations

Locations are listed in load order, broadest scope to most specific. A project instruction appears in context **after** a user instruction.

| Scope | Location (typical OS) | Purpose | Shared with |
|---|---|---|---|
| **Managed policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md` <br> Linux/WSL: `/etc/claude-code/CLAUDE.md` <br> Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | Org-wide IT/DevOps policies | All users in org |
| **Managed inline** | `claudeMd` key in `managed-settings.json` | Inline managed policy content (same precedence as managed file) | All users in org |
| **User instructions** | `~/.claude/CLAUDE.md` | Personal preferences for all projects | Just you (all projects) |
| **User rules** | `~/.claude/rules/*.md` (recursive) | Modular personal rules | Just you (all projects) |
| **Project instructions** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared project rules | Team via source control |
| **Project rules** | `./.claude/rules/*.md` (recursive) | Modular project rules | Team via source control |
| **Local instructions** | `./CLAUDE.local.md` (gitignored) | Personal project-only preferences | Just you (this project) |
| **Ancestor CLAUDE.md** | Any `CLAUDE.md` or `CLAUDE.local.md` in directories **above** the CWD | Loads in full at launch | Per project |
| **Subdirectory CLAUDE.md** | `*/CLAUDE.md` in directories **below** the CWD | Loads **on demand** when Claude reads files in that subdir | Per project |

**Additional directories:** files from `--add-dir` are NOT loaded by default. Set `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` to also load `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, and `CLAUDE.local.md` from added directories (skip `local` if you exclude it from `--setting-sources`).

## 2. Precedence rules

Claude Code **concatenates** all discovered files into context rather than overriding them. Within that concatenation:

1. **Order is filesystem-root-down to CWD** — instructions **closer to where you launched Claude are read last** and therefore weight more.
2. **Within each directory, `CLAUDE.local.md` is appended after `CLAUDE.md`** — your personal notes are the last thing Claude reads at that level.
3. **User rules load before project rules** — giving project rules higher effective priority.
4. **Path-scoped rules** in `.claude/rules/*.md` with `paths:` frontmatter only load when Claude works with matching files (lazy load), and stack on top of whatever base files loaded.
5. **On conflict, Claude may pick arbitrarily** — review files for contradictions periodically. Remove or merge conflicting rules.
6. **Managed policy files cannot be excluded** by user/project/local `claudeMdExcludes` — they always apply.
7. **Auto memory `MEMORY.md` (200 lines / 25KB) is independent** of CLAUDE.md and loads alongside it.

### Precedence table with concrete examples

| Scenario | Winner | Why |
|---|---|---|
| `~/.claude/CLAUDE.md` says "use tabs" and `.claude/CLAUDE.md` says "use 2 spaces" | `.claude/CLAUDE.md` | Project loaded after user in the concatenation |
| `.claude/CLAUDE.md` says "always use 4 spaces" and `CLAUDE.local.md` says "use 2 spaces in my sandbox" | `CLAUDE.local.md` | Local is appended after project at the same level |
| `.claude/rules/api.md` (no `paths:`) vs `~/.claude/rules/style.md` (no `paths:`) | They both load, but `.claude/rules/api.md` is read later | Project rules load after user rules |
| `.claude/rules/db.md` has `paths: ["**/migrations/**"]` and you edit a migration | `.claude/rules/db.md` loads (and the rest already loaded) | Path-scoped rule matches the file you're touching |
| Managed policy says "never push to main" and user CLAUDE.md says "push freely" | Managed policy | Managed cannot be excluded by user settings |
| Project rule and a subdirectory `packages/api/CLAUDE.md` conflict on a file under `packages/api/` | Subdirectory CLAUDE.md | Subdir loads later (on-demand), so its instructions weigh more |
| `claudeMdExcludes` lists `**/other-team/CLAUDE.md` and you `cd` into that subtree | Excluded file skipped | Local exclusion honored; managed policy still loads |

## 3. @import / @ syntax

CLAUDE.md files can import other files using `@path/to/import`. Imports are **expanded and loaded into context at launch** — they do not lazy-load.

- **Relative paths resolve relative to the file containing the import**, not the working directory.
- **Absolute paths** are allowed.
- **Recursive imports** up to **4 hops deep**.
- **Code spans and fenced code blocks are skipped** — wrap a path in backticks (`` `@README` ``) to keep it literal; write `@README` (no backticks) to import.
- **First-time external imports show an approval dialog** listing the files. Decline and the dialog never reappears; imports stay disabled for that project.

### Common patterns

```markdown
# Pull in README, package.json, and a workflow doc
See @README for project overview and @package.json for npm commands.

# Import a per-project workflow doc
- git workflow @docs/git-instructions.md

# Share personal instructions across worktrees (worktree-immune)
- @~/.claude/my-project-instructions.md

# Bridge to AGENTS.md (if your repo uses AGENTS.md for other tools)
@AGENTS.md

## Claude Code
Use plan mode for changes under `src/billing/`.

# Or symlink (Linux/macOS; Windows needs Developer Mode or admin)
ln -s AGENTS.md CLAUDE.md
```

`@` imports help **organize** content but do not **reduce context** — every imported file's full content lands in the context window at launch. To reduce context, use path-scoped `.claude/rules/` instead.

## 4. .claude/rules/ directory pattern

For larger projects, split instructions into multiple files in `.claude/rules/`. Each file should cover one topic, with a descriptive filename like `testing.md` or `api-design.md`. Subdirectories like `frontend/` or `backend/` are allowed and scanned recursively.

```text
your-project/
├── .claude/
│   ├── CLAUDE.md           # Main project instructions
│   └── rules/
│       ├── code-style.md
│       ├── testing.md
│       └── security.md
```

### Rules without `paths:` frontmatter

- Load at launch with the same priority as `.claude/CLAUDE.md`.
- Apply to all files.

### Path-scoped rules (with `paths:` frontmatter)

- Lazy-load only when Claude reads a file matching the pattern.
- Reduce context noise and save tokens.

```markdown
---
paths:
  - "src/api/**/*.ts"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
---

# API Development Rules

- All API endpoints must include input validation
- Use the standard error response format
- Include OpenAPI documentation comments
```

### Glob patterns in `paths:`

| Pattern | Matches |
|---|---|
| `**/*.ts` | All TS files in any directory |
| `src/**/*` | All files under `src/` |
| `*.md` | Markdown files in project root |
| `src/components/*.tsx` | React components in `src/components/` |
| `src/**/*.{ts,tsx}` | Brace expansion: TS and TSX under `src/` |

Multiple patterns are allowed (list them in YAML).

### Share rules across projects

The `.claude/rules/` directory supports symlinks. Circular symlinks are detected and handled gracefully.

```bash
ln -s ~/shared-claude-rules .claude/rules/shared
ln -s ~/company-standards/security.md .claude/rules/security.md
```

### User-level rules

`~/.claude/rules/*.md` applies to every project on your machine. Loaded **before** project rules (lower effective priority).

## 5. What reaches subagents vs not

The headline rule: **Explore and Plan skip your CLAUDE.md files and the parent session's git status. Every other built-in and custom subagent loads both.**

| Subagent type | Loads CLAUDE.md / rules / `CLAUDE.local.md`? | Loads parent git status? | Loads preloaded skills? | Notes |
|---|---|---|---|---|
| **Explore** (built-in) | NO | NO | NO | Haiku, read-only. Optimized for fast, cheap searches. |
| **Plan** (built-in) | NO | NO | NO | Inherits model, read-only. Used in plan mode for research. |
| **general-purpose** | YES | YES | NO (unless listed in `skills:`) | Inherits model, all tools. |
| **Custom subagent** (user / project / plugin) | YES | YES | Only if listed in `skills:` frontmatter | `tools` / `permissionMode` / `model` from its frontmatter. |
| **Fork** (`/fork`, `CLAUDE_CODE_FORK_SUBAGENT=1`) | YES (parent's full state) | YES | N/A (inherits parent context entirely) | Shares prompt cache with main session. |
| **Nested subagent** | YES (resolves same scopes as top-level) | YES | Per its own `skills:` | Depth limit 5; cannot spawn further at depth 5. |

There is **no frontmatter field or per-agent setting** to change which agents skip CLAUDE.md and git status. If a rule must reach an Explore or Plan subagent (e.g., "ignore `vendor/`"), restate it in the prompt you give Claude when delegating — the main conversation reads Explore/Plan results with full CLAUDE.md context, so most rules don't need to.

### Initial context of a non-fork subagent

1. **System prompt** — the agent's own prompt + environment details Claude Code appends (NOT the full Claude Code system prompt).
2. **Task message** — the delegation prompt Claude writes.
3. **CLAUDE.md and memory** — every level of the main memory hierarchy, including `~/.claude/CLAUDE.md`, project rules, `CLAUDE.local.md`, and managed policy files.
4. **Git status** — snapshot taken at parent session start (absent when not a git repo or when `includeGitInstructions` is `false`).
5. **Preloaded skills** — full content of skills named in the agent's `skills:` field.

What subagents do **not** get from the parent: conversation history, already-invoked skills, files already read.

### Tool availability notes

- `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode` (unless `permissionMode: plan`), `ScheduleWakeup`, `WaitForMcpServers` are unavailable to subagents even if listed in `tools:`.
- `Agent` is renamed from `Task` in v2.1.63 (aliases still work).

## 6. Subagent memory hierarchy

Subagents can maintain their own auto memory via the `memory:` frontmatter field.

| Scope | Location | Use when |
|---|---|---|
| `user` | `~/.claude/agent-memory/<name>/` | Memory should follow the subagent across all projects |
| `project` | `.claude/agent-memory/<name>/` | Project-specific knowledge, shareable via git (recommended default) |
| `local` | `.claude/agent-memory-local/<name>/` | Project-specific but not version-controlled |

When `memory:` is set:

- Read/Write/Edit tools are auto-enabled.
- The subagent's system prompt includes instructions for reading/writing the memory directory.
- The first **200 lines or 25KB** of `MEMORY.md` is loaded into the subagent's system prompt at startup (whichever comes first), with instructions to curate `MEMORY.md` if it exceeds that limit.
- Topic files (`debugging.md`, `patterns.md`, etc.) are NOT auto-loaded — subagent reads them on demand.

### General auto memory (main conversation, not subagent-specific)

For the main session's auto memory:

- Stored at `~/.claude/projects/<project>/memory/` where `<project>` is derived from the git repo root (so all worktrees share one memory dir).
- Same **200 lines / 25KB** cap on `MEMORY.md` at session start.
- Machine-local; not synced across machines or cloud.
- Toggle via `/memory` UI or `autoMemoryEnabled` in settings; disable with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- Override location with `autoMemoryDirectory` in any settings scope (must be absolute or start with `~/`).
- The `InstructionsLoaded` hook can log exactly which instruction files load, when, and why — useful for debugging path-scoped rules and lazy-loaded subdirectory files.

## 7. Session memory — `--continue` and `--resume` behavior

Sessions are saved continuously as local JSONL transcripts. Resuming a session does **not** re-inject CLAUDE.md from scratch — it continues the existing transcript. But the rules about what survives still apply:

| Behavior | Detail |
|---|---|
| `claude --continue` | Resumes the most recent session in the current directory |
| `claude --resume` | Opens the session picker |
| `claude --resume <name>` | Resumes the named session |
| `claude --from-pr <n>` | Resumes the session linked to that PR |
| `/resume` | Switch from inside an active session |
| `/branch [name]` | Copy current conversation, switch to the copy, leave original intact. Permissions approved "for this session" do NOT carry to the branch. |
| `/clear` | Fresh context; previous session saved and resumable |
| `/compact [instructions]` | Replace history with a summary (CLAUDE.md re-injected) |
| `/export` | Copy conversation to clipboard or save as text |
| `claude --continue --fork-session` | Branch from CLI |

**What survives `/compact`:**
- Project-root CLAUDE.md — re-read from disk and re-injected.
- Nested/subdirectory CLAUDE.md — NOT re-injected automatically; reloads next time Claude reads a file in that subdir.
- If an instruction disappeared after compaction, it was either conversation-only or lives in a nested CLAUDE.md that hasn't reloaded.

**Transcripts storage:** `~/.claude/projects/<project>/<sessionId>.jsonl` (per project; default 30-day cleanup, change with `cleanupPeriodDays`). Set `CLAUDE_CONFIG_DIR` to relocate. Suppress with `CLAUDE_CODE_SKIP_PROMPT_HISTORY` or `--no-session-persistence` in non-interactive mode.

**Session ID lookup is scoped to the current project directory and its worktrees** — `claude --resume <id>` must be run from a directory the session was started in.

**Subagent transcripts** are independent files at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`. Main-conversation compaction does NOT affect subagent transcripts.

## 8. What does NOT load

- **`node_modules`, build artifacts, vendored content** — Claude Code does not automatically load these into context. Use `.gitignore` patterns and `claudeMdExcludes` to skip them.
- **Files in directories above CWD that are not in the chain of ancestor CLAUDE.md names** — only `CLAUDE.md` and `CLAUDE.local.md` filenames are looked for, and they must be in ancestor directories of the CWD.
- **Subdirectory CLAUDE.md in directories Claude hasn't read files from yet** — lazy-loaded on demand only.
- **Files from `--add-dir` directories** by default — opt in with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.
- **Topic files in auto memory** (`debugging.md`, `patterns.md`, etc.) — only the first 200 lines/25KB of `MEMORY.md` loads.
- **Imported files do not lazy-load** — `@path` imports expand fully at launch, even if those files would otherwise be lazy.
- **AGENTS.md** — Claude Code does not auto-read this. Bridge via `@AGENTS.md` import inside CLAUDE.md, or a symlink (Linux/macOS).
- **Managed policy CLAUDE.md** — cannot be excluded by `claudeMdExcludes`. Always loads.
- **The full Claude Code system prompt** — subagents get their own prompt + env details, not the full system prompt.

## 9. Recommended structure

Use a tiered approach. Start with one root `CLAUDE.md` and grow rules outward as topics warrant.

```text
project/
├── .claude/
│   ├── CLAUDE.md                 # ~200 lines max: project facts, build, conventions
│   ├── rules/
│   │   ├── code-style.md         # Always-on rules (no paths:)
│   │   ├── testing.md
│   │   ├── security.md
│   │   ├── api/
│   │   │   └── orpc.md           # paths: ["packages/api/**/*.ts"]
│   │   ├── db/
│   │   │   └── drizzle.md        # paths: ["packages/db/**/*.ts"]
│   │   └── desktop/
│   │       └── electron.md       # paths: ["apps/desktop/**/*.ts"]
│   ├── agents/                   # Custom subagents (project scope)
│   ├── settings.json             # Project-shared permissions, hooks
│   └── settings.local.json       # Personal overrides (gitignored)
├── CLAUDE.md                     # Same as .claude/CLAUDE.md — pick one
└── CLAUDE.local.md               # Personal project-only (gitignored)
```

### Decision rules

- **Root `CLAUDE.md`** holds facts Claude should hold every session: build commands, test commands, project layout, the top "always do X" rules. Target **under 200 lines**.
- **`.claude/rules/<topic>.md`** holds one topic per file. No `paths:` → always loads. With `paths:` → loads only when relevant.
- **`.claude/agent-memory/<subagent>/MEMORY.md`** is what subagents maintain for themselves (200 lines / 25KB cap on the index).
- **Skills** for multi-step procedures / on-demand workflows; **hooks** for hard enforcement; **subagents** for isolated execution.
- **`.gitignore` must include `CLAUDE.local.md` and `.claude/settings.local.json`.**

### Splitting strategy for this monorepo

This Electron template is a good candidate for path-scoped rules:

- `packages/api/**` → orpc-bridge rule (see `[[orpc-bridge]]`)
- `packages/db/**` → drizzle/schema/migration rules
- `apps/desktop/**` → electron main/preload conventions
- `apps/web/**` → tanstack / react / i18n rules (see `[[skills-overview]]`)
- `.github/workflows/**` → CI/CD rules (see `[[workflows]]`)

## 10. Token budget

CLAUDE.md files load into the context window at the start of **every** session. They consume tokens alongside the conversation. Cost of bloat:

- **Target under 200 lines per CLAUDE.md file.** Longer files consume more context and **reduce adherence** — Claude weighs vague or long instructions less reliably.
- **`@` imports do not reduce context** — every imported file's content is fully injected at launch. Use imports for organization, not for savings.
- **Path-scoped `.claude/rules/`** is the right tool for reducing context. Rules with `paths:` only load when Claude works with matching files.
- **Auto memory `MEMORY.md` cap is 200 lines OR 25KB, whichever first.** Topic files beyond that are not auto-loaded.
- **Block-level HTML comments** (``) in CLAUDE.md are stripped before injection — use them for human maintainer notes that shouldn't consume context. Code-block comments are preserved.
- **Subagent CLAUDE.md is duplicated into every subagent's context** — the same files load per subagent. Bloat multiplies.
- **The context window visualization** shows exactly where CLAUDE.md loads relative to other startup context.

## 11. Common pitfalls

- **Conflicting rules across scopes** — if `~/.claude/CLAUDE.md` and `.claude/CLAUDE.md` give different instructions, Claude may pick one arbitrarily. Audit periodically. (See `[[goals]]` for how to capture team agreements.)
- **Accidentally loading secrets** — never put API keys, tokens, or credentials in any file Claude reads (CLAUDE.md, `CLAUDE.local.md`, `.claude/rules/*`, or `@` imports). They're injected into every session, including subagent sessions and forked sessions. Use environment variables and a `permissions.deny` list instead.
- **Monorepos picking up other teams' CLAUDE.md** — add a `claudeMdExcludes` array to `.claude/settings.local.json`:
  ```json
  { "claudeMdExcludes": ["**/other-team/CLAUDE.md", "/abs/path/.claude/rules/**"] }
  ```
  Patterns match absolute paths via glob. Arrays merge across user/project/local/managed layers. Managed policy files cannot be excluded.
- **Instructions lost after `/compact`** — only project-root CLAUDE.md is re-injected. Subdirectory CLAUDE.md only reloads when Claude next reads a file in that subdir. Move critical rules to the project root, or to path-scoped rules, to make them survive.
- **CLAUDE.md too large** — past 200 lines, adherence drops. Split into `.claude/rules/` topic files (with `paths:` for true savings), or use `@` imports for organization only.
- **Vague instructions** — "format code nicely" loses to "use 2-space indentation". Concrete, verifiable, specific rules work best.
- **Forgetting to gitignore `CLAUDE.local.md`** — running `/init` and choosing the personal option does this for you. Otherwise add it manually.
- **Worktree-local `CLAUDE.local.md`** — gitignored, so it only exists in the worktree that created it. To share personal instructions across worktrees, `@import` a file from `~/.claude/` instead.
- **Expecting Explore/Plan to follow your CLAUDE.md** — they skip it. Restate the rule in the delegation prompt.
- **Trusting CLAUDE.md for hard enforcement** — it's context, not config. For "must never X", use a `PreToolUse` hook (return exit code 2) or `permissions.deny` in `settings.json`.
- **`autoMemoryEnabled` in project settings** — this is a project-level toggle for the main session's auto memory. If you want a subagent to skip memory, omit the `memory:` field on its frontmatter (don't set it to a fake value).
- **First-time `@` import dialog** — Claude Code prompts for approval the first time it sees external imports in a project. Decline once and the dialog never reappears — but imports also stay disabled.
- **Rules directory frontmatter gotchas** — `paths:` must be a YAML list (not a comma-separated string). `~/.claude/rules/` historically had bugs honoring `paths:` — verify on your version with `/memory` or the `InstructionsLoaded` hook.
- **`AGENTS.md` ignored** — Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repo has `AGENTS.md` for other tools, bridge with `@AGENTS.md` or a symlink (Windows: use `@` since symlinks need admin / Developer Mode).

## Related

- [[subagents]] — what subagents receive, scope, memory
- [[skills-overview]] / [[skills-frontmatter]] / [[skills-invocation]] — when to use skills vs CLAUDE.md vs rules
- [[orpc-bridge]] — example path-scoped rule for `packages/api/**`
- [[workflows]] — `.github/workflows/**` and CI patterns
- [[monorepo-structure]] — project layout context
- [[loops-and-scheduling]] — `claude --continue`/session mechanics
- [[goals]] — capture team-level CLAUDE.md agreements

## Sources

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/settings
- https://github.com/anthropics/claude-code/issues/62944 (project CLAUDE.md not inherited by subagents)
- https://github.com/anthropics/claude-code/issues/66443 (per-agent frontmatter to skip CLAUDE.md — engine handles Explore/Plan)
