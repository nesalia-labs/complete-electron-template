---
name: skills-invocation
description: How Claude Code decides when to invoke a skill — auto-invocation pipeline (semantic, not substring), manual override via /name, paths globs, and disable-model-invocation/user-invocable toggles.
metadata:
  type: reference
---

# Skill Invocation Model

## Two invocation modes

| Mode | Trigger | Who controls |
|---|---|---|
| **Manual** | User types `/skill-name` | User |
| **Auto** | Claude semantically matches user request to a skill's `description` | Claude |

Custom commands and skills share the same `/name` syntax. Auto-invocation is what differentiates a skill from a plain prompt template.

## Auto-invocation pipeline

Before Claude processes a message, an evaluation sequence runs:

1. **Input capture** — message text + conversation context
2. **Candidate selection** — skills whose `description` mentions trigger phrases
3. **Semantic scoring** — similarity between request and description (NOT substring matching)
4. **Threshold filtering** — drop scores below activation threshold
5. **Dispatch** — best-matching skill loads

**Implication:** a description with the keyword "test" doesn't require the user to type "test" — Claude understands "check if this code handles edge cases" can trigger a `/tdd` skill.

## Controlling invocation mode

Four orthogonal toggles via frontmatter:

| `disable-model-invocation` | `user-invocable` | Behavior |
|---|---|---|
| `false` (default) | `true` (default) | User can `/name`, Claude can auto-invoke, description in context |
| `true` | `true` | User can `/name`, Claude CANNOT auto-invoke, description removed from context |
| `false` | `false` | Hidden from `/` menu, Claude auto-loads, description always in context (background knowledge) |
| `true` | `false` | Effectively unusable — neither manual nor auto |

**Common patterns:**

- `disable-model-invocation: true` — side-effect skills (deploy, commit, DB migrate, destructive ops). User must explicitly opt in.
- `user-invocable: false` — background context skills (coding conventions, framework knowledge). Always available, never visible.
- `paths: "**/*.ts"` — auto-invoke only when working with matching files. Manual `/name` still works regardless.

## Trigger description quality

Trigger conditions belong in the **body** of SKILL.md (semantic anchors), not just the frontmatter `description`. Example:

```markdown
When the user asks to write tests for a function, or requests added test coverage, apply this skill.
```

vs the bad version that fires on almost any dev request:

```markdown
When the user asks for help with code.
```

## Multi-skill scenarios

When multiple skills compete or a request spans domains:

- **Ambiguous match** → explicitly name: *"Use the pdf skill to extract tables"*
- **Compound request** (analyze + present) → either break into sequential steps or invoke both explicitly
- **Wrong skill fires** → differentiate trigger blocks between competing skills; vague descriptions create overlap

## Explicit invocation beats auto when

- Working across multiple skill domains in one session
- Auto-detection misses your intent
- You want a specific toolset the system didn't pick

The system always allows `/name` manual override — even when `paths` filters would block auto-activation.

## SDK specifics

For programmatic control (Claude Agent SDK):

```typescript
options: {
  settingSources: ["user", "project"],   // Required for skill discovery
  skills: "all",                          // Or: ["pdf", "docx"] or [] to disable
  allowedTools: ["Read", "Skill", ...]    // Must include "Skill" if using tools list
}
```

`skills` is a **context filter**, not a sandbox. Unlisted skills are hidden from the model and rejected by the Skill tool, but files remain on disk and reachable via Read/Bash.

`settingSources: []` disables skill discovery entirely — common foot-gun when callers set it explicitly without re-adding `'user'`/`'project'`.

Related: [[skills-overview]], [[skills-frontmatter]]
