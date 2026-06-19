---
name: skills-frontmatter
description: Complete SKILL.md frontmatter field reference — Agent Skills spec fields plus Claude Code extensions for invocation control, permissions, and routing.
metadata:
  type: reference
---

# SKILL.md Frontmatter Reference

Standard YAML frontmatter between `---` delimiters. YAML uses **spaces, not tabs** — a tab causes silent parse failure.

## Agent Skills spec fields (open standard)

| Field | Required | Constraints |
|---|---|---|
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens. Must not start/end with `-`. No `--`. Must match parent directory name. |
| `description` | Yes | Max 1024 chars (1536 with `when_to_use`). Describes WHAT and WHEN. Include trigger keywords. |
| `license` | No | License name or reference to bundled LICENSE file |
| `compatibility` | No | Max 500 chars. Environment requirements (intended product, packages, network) |
| `metadata` | No | Arbitrary string→string map. Use unique keys to avoid conflicts. |
| `allowed-tools` | No | Space-separated string. Experimental. |

### Minimal valid skill

```markdown
---
name: lint-fix
description: Fix TypeScript lint errors. Use when the user says "fix lint errors" or asks to "clean up warnings".
---

Run `pnpm lint:fix` and summarize the changes file-by-file.
```

## Claude Code extensions (not in open spec)

These add fine-grained control over **when**, **how**, and **with what permissions** a skill runs.

| Field | Purpose |
|---|---|
| `when_to_use` | Additional trigger context appended to `description`. Shares 1536-char cap. |
| `argument-hint` | Autocomplete hint, e.g. `[file-or-directory]`. Cosmetic — does not validate. |
| `disable-model-invocation` | `true` = manual only (`/name`). Description removed from Claude's context. Use for side-effect skills (deploy, commit, migrate). |
| `user-invocable` | `false` = hidden from `/` menu, loaded automatically only. Description stays in context. |
| `allowed-tools` | Pre-approved tools for this skill's execution. Accepts string or YAML list. Glob syntax: `Bash(git:*)`. **Grants, doesn't restrict** — deny rules in settings override. |
| `model` | Override model for this skill's execution |
| `effort` | Override session effort: `low`, `medium`, `high`, `xhigh`, `max`. Skill-level `max` overrides session `low`. |
| `context` | `fork` = run in isolated subagent. Skill body becomes the subagent prompt. Needs explicit task, not guidelines. |
| `agent` | Which subagent type with `context: fork`: `Explore`, `Plan`, `general-purpose`, or custom name from `.claude/agents/`. |
| `paths` | Glob limiting auto-activation, e.g. `"**/*.ts"`. Manual `/name` ignores this. Combine with `disable-model-invocation: true` = skill effectively can't auto-activate (waste). |
| `shell` | Shell for `` !`...` `` blocks: `bash` (default) or `powershell` |
| `hooks` | Lifecycle hooks scoped to this skill, e.g. `post-invoke: "echo done"` |

## Description best practices

**Good** (specific, keyword-rich, triggers front-loaded):
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

**Poor** (fires on almost anything):
```yaml
description: Helps with PDFs.
```

The combined `description` + `when_to_use` caps at **1,536 characters**. The total budget across all skill descriptions scales at **1% of context window** with an 8,000-char fallback. Raise via `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var.

## Full production example

```markdown
---
name: deploy-staging
description: >
  Deploy to staging environment with safety checks.
  Use when user says "deploy", "ship to staging", or "push to preprod".
when_to_use: Also trigger when pre-commit hook references staging URL.
argument-hint: "[service-name]"
disable-model-invocation: true
allowed-tools: Bash(deploy-cli *) Bash(docker *) Read Grep
model: claude-opus-4-6
effort: high
paths: "**/deploy.{ts,yml,yaml}"
---

1. Verify on `main` branch and clean working tree.
2. Run `deploy-cli check <service>` and surface any blockers.
3. Confirm with user before running `deploy-cli apply <service>`.
4. Tail logs for 60s post-deploy and report errors.
```

## Gotchas

- **`allowed-tools` grants, doesn't restrict.** If a deny rule exists in `settings.json`, it wins.
- **`context: fork` with no task returns empty.** The skill body is the prompt — guidelines alone won't drive a subagent.
- **`effort: max` in skill overrides session `low`.** Significant token/time cost; use deliberately.
- **"ultrathink" anywhere** in skill content enables extended thinking, independent of `effort`.
- **YAML parse failure is silent.** Validate with `python3 -c "import yaml; yaml.safe_load(open('SKILL.md').read().strip('---'))"`.

Related: [[skills-overview]], [[skills-invocation]]
