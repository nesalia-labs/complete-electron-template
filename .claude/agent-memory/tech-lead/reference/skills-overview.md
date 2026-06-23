---
name: skills-overview
description: What Claude Code "skills" are — SKILL.md files that package reusable procedures, loaded lazily to avoid bloating context. Part of the open Agent Skills standard.
metadata:
  type: reference
---

# Claude Code Skills — Overview

A **skill** is a directory containing a `SKILL.md` file (YAML frontmatter + Markdown body) that packages a reusable procedure, checklist, or multi-step recipe. The body loads only when the skill is activated — so long reference material costs almost nothing until needed. This is the key DX win over `CLAUDE.md`, which always loads.

## When to create a skill vs add to CLAUDE.md

- **Skill** — a *procedure* the user invokes repeatedly, or guidance that only matters in specific contexts (deploy, DB migration, lint-fix, review).
- **CLAUDE.md** — a *fact* or standing rule that applies to every session (network rules, tech stack, branching strategy).

Create a skill when you keep pasting the same instructions, or when a section of `CLAUDE.md` has grown into a procedure.

## Directory structure

```
.claude/skills/<skill-name>/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: executable code
├── references/           # Optional: extra docs (REFERENCE.md, FORMS.md, ...)
├── assets/               # Optional: templates, images, data files
└── ...                   # Any other files
```

## Discovery locations

Skills are loaded from the filesystem based on `settingSources` (CLI/SDK):

| Location | Scope | Git-shared |
|---|---|---|
| `.claude/skills/<name>/SKILL.md` | Project | Yes |
| `~/.claude/skills/<name>/SKILL.md` | User (all projects) | No |
| Plugin-bundled | Per plugin install | Per plugin |

The SDK loads `.claude/skills/` from `cwd` and every parent directory up to the repo root.

## Progressive disclosure (token economics)

Three-tier loading — this is what makes skills cheap:

1. **Metadata** (~100 tokens): `name` + `description` loaded at startup for all skills
2. **Instructions** (<5000 tokens recommended): full SKILL.md body loaded when activated
3. **Resources**: `scripts/`, `references/`, `assets/` loaded only when actually needed

**Rule of thumb:** keep SKILL.md under 500 lines; split detail into `references/*.md`.

## Open standard

Claude Code skills follow the **Agent Skills** open standard (https://agentskills.io/specification), which works across multiple AI tools. Claude Code extends the standard with additional fields (see [[skills-frontmatter]]) and features (invocation control, subagent execution, dynamic context injection).

## vs related concepts

| Concept | Purpose | Persistence |
|---|---|---|
| **Skill** | Procedural recipe, lazy-loaded | Per-invocation |
| **Agent** (`.claude/agents/<name>/`) | Persistent persona with system prompt + tools | Per-session |
| **Subagent** | Spawned agent for a subtask | Per-task |
| **Slash command** (`.claude/commands/`) | User-invoked prompt template | Per-invocation |
| **Hook** | Shell command that runs on lifecycle events | Always-on |
| **CLAUDE.md** | Standing facts, always loaded | Per-session |
| **MCP server** | External tool/data integration | Per-session |

**Key relationship:** custom commands were merged into skills. `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way. Skills add a directory for supporting files and invocation-control frontmatter.

## Validation

```bash
skills-ref validate ./my-skill
```

Checks frontmatter validity and naming conventions. A YAML parse failure (tab instead of spaces, missing colon, unquoted special char) makes Claude treat the entire file as body text with no metadata — silent and dangerous.

## Sources

- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/agent-sdk/skills
- https://agentskills.io/specification

Related: [[skills-frontmatter]], [[skills-invocation]]
