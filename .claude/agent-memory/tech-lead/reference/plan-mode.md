---
name: plan-mode
description: Claude Code Plan Mode — read-only main thread, Plan subagent research, EnterPlanMode/ExitPlanMode flow, allowed prompts, plan file persistence, composition with goals/subagents, when to use vs skip.
metadata:
  type: reference
---

# Plan Mode

Plan Mode is a Claude Code permission mode where the main thread voluntarily downgrades its own capabilities to **read-only + plan-file write only**, explores the codebase, drafts a plan, and calls `ExitPlanMode` to request user approval before any real edits run. It is the only mechanism in Claude Code where the model "voluntarily requests to lower its own permissions" to earn user trust.

## The EnterPlanMode / ExitPlanMode flow (sequence)

```
User: "Refactor the auth system"
  │
  ├─ Path A (user-initiated):  /plan slash command  OR  Shift+Tab x2  OR  --permission-mode plan
  └─ Path B (model-initiated): EnterPlanMode tool called by main thread
                                │
                                ▼
   handlePlanModeTransition(currentMode → 'plan')
   prepareContextForPlanMode()  ← strips write tools, sets prePlanMode
   mode = 'plan', prePlanMode = 'default' | 'auto' | 'bypassPermissions'
                                │
                                ▼
   System injects plan_mode attachment (5-phase workflow prompt)
                                │
                                ▼
   Phase 1 — Initial Understanding
     └─ Launch Explore subagents (read-only) to map the codebase
   Phase 2 — Design
     └─ Launch Plan subagents (read-only) for architectural approach
   Phase 3 — Review
     └─ Synthesize, ask the user clarifying questions via AskUserQuestion
   Phase 4 — Final Plan
     └─ Write plan to ~/.claude/plans/<word-slug>.md
                                │
                                ▼
   ExitPlanMode tool  ──►  Permission dialog: "Exit plan mode?"
                              ├─ Approve   → restore prePlanMode, inject plan into context, begin work
                              ├─ Edit      → user modifies plan file, re-presented
                              └─ Reject    → stay in plan mode, keep iterating
                                │
                                ▼
   hasExitedPlanMode = true; needsPlanModeExitAttachment = true (one-shot)
   System injects: "You've exited plan mode, proceed with implementation"
```

The transition is **symmetric and idempotent**: `prePlanMode` is saved on entry, restored on exit, then cleared. Plan Mode is a "pure function" — exit state equals entry state minus the plan file.

## How to enter / exit

| Entry method | Who triggers | Notes |
|---|---|---|
| `/plan` slash command | User | Optional trailing text submits the task as a user message in plan mode |
| `Shift+Tab` twice in REPL | User | Cycles Default → Auto-Accept → Plan → Default |
| `--permission-mode plan` at startup | User | Session starts in plan mode (works with `--print` for headless) |
| `EnterPlanMode` tool call | Main thread | Model self-elects when prompt triggers warrant it |

Exit is **only** via the `ExitPlanMode` tool, which always opens the approval dialog. There is no slash command to leave plan mode — the user must approve, edit-then-approve, or reject.

## Main thread restrictions in plan mode

- **Blocked**: `Write`, `Edit`, `NotebookEdit`, `Bash` (mutating), `git add/commit/push`, `npm install`, file creation/deletion/move, redirect operators, heredocs to files.
- **Allowed**: `Read`, `Glob`, `Grep`, `Bash` (read-only commands: `ls`, `git status/log/diff`, `find`, `cat`), `Agent` (subagents — read-only too), and `Edit`/`Write` **only on the plan file** at `~/.claude/plans/<slug>.md`.
- **Always available**: `EnterPlanMode` (no-op when already in plan mode) and `ExitPlanMode`.

This is enforced **primarily by prompt reinforcement** (the injected `plan_mode` attachment) plus tool-level gating. The model retains physical access to the tools but is told they will fail if misused.

## The Plan subagent

Defined at `src/tools/AgentTool/built-in/planAgent.ts`. Key properties:

- **Model**: `inherit` (same as parent — usually Sonnet/Opus).
- **Tools**: inherits the Explore agent's tool set (`Read`, `Glob`, `Grep`, `Bash` read-only).
- **Disallowed tools**: `Agent` (no nested sub-agents), `ExitPlanMode`, `FileEdit`, `FileWrite`, `NotebookEdit`.
- **`omitClaudeMd: true`** — skips loading CLAUDE.md to save tokens (parent's context carries the rules).
- **System prompt is read-only by hard rule**: "STRICTLY PROHIBITED from creating/modifying/deleting files; no redirect operators, no heredocs to files." Repeated three times in different phrasings.
- **Required output**: ends with `### Critical Files for Implementation` listing 3-5 paths.
- **When to use**: software architect agent for designing implementation plans; identifies critical files, considers trade-offs.
- **No nesting**: sub-agents cannot spawn further sub-agents — keeps the read-only graph acyclic.

The **Explore** subagent (Haiku, read-only) handles Phase 1 grunt work. The **Plan** subagent (inherits parent model) handles Phase 2 architecture. Max subscription tiers get up to **3 parallel Plan agents** (`getPlanModeV2AgentCount`); everyone else gets 1.

## Allowed prompts in ExitPlanMode

`ExitPlanModeInput` schema (from `claude_codes` Rust crate):

```rust
pub struct ExitPlanModeInput {
    pub allowed_prompts: Option<Vec<AllowedPrompt>>,   // prompt-based permissions for next phase
    pub push_to_remote: Option<bool>,                  // push plan to claude.ai session
    pub remote_session_id: Option<String>,
    pub remote_session_url: Option<String>,
    pub remote_session_title: Option<String>,
    pub plan: Option<String>,                          // plan content (injected from disk by normalizeToolInput)
}
```

`allowedPrompts` is the **declaration of bash categories** the next phase will need. These are surfaced to the user in the approval dialog so they can pre-approve categories rather than individual commands. Examples:

| allowedPrompts entry | Meaning |
|---|---|
| `{ tool: "Bash", prompt: "run tests" }` | Pre-approve test runner invocations |
| `{ tool: "Bash", prompt: "install dependencies" }` | Pre-approve `pnpm install` / `npm install` |
| `{ tool: "Bash", prompt: "git commit and push" }` | Pre-approve commit/push operations |
| `{ tool: "Bash", prompt: "run database migrations" }` | Pre-approve migration commands |
| `{ tool: "Bash", prompt: "build the project" }` | Pre-approve build commands |

Each entry covers a **category of action**, not individual commands. After approval, those categories skip the per-command permission prompt during implementation. This is the only ergonomic way to batch-approve recurring bash actions before implementation begins.

## Plan presentation format

The plan lives in `~/.claude/plans/<word-slug>.md` (e.g. `bold-eagle.md`). Slugs are two-word combinations (adjective-noun) cached per session. Sub-agent plans use `<slug>-agent-<agentId>.md` to avoid collisions.

Format variants (A/B experiment `tengu_pewter_ledger`, Phase 4):

| Variant | Format | Notes |
|---|---|---|
| control | Context paragraph + recommended approach + file paths + verification steps | Baseline (~6.2K chars avg) |
| trim | One-line Context + single verification command | Moderate compression |
| cut | No Context paragraph + one line per file + single verification command | Heavy compression |
| cap | No prose + one bullet per file + hard 40-line limit | Maximum compression |

Production data shows **rejection rate rises with plan length**: <2K chars → 20% rejection; >20K chars → 50% rejection. Compression variants aim to lower rejection rate, not just save tokens.

The user sees the plan in the approval dialog with the full content. They can edit the file directly before approving, or send feedback to the model to revise.

## How users approve / edit / reject

In the `ExitPlanMode` permission dialog:

1. **Approve as-is** → plan passes through unchanged; main thread restores `prePlanMode` and begins work.
2. **Edit then approve** → user modifies `~/.claude/plans/<slug>.md` directly; the dialog reflects the modified content; the response tag changes to `"Approved Plan (edited by user)"`.
3. **Reject** → stay in plan mode; main thread continues refining.
4. **Send feedback instead** → conversational iteration; main thread updates the plan file and re-calls `ExitPlanMode`.

After approval, the model receives the **full plan text echoed back** in the tool result so it can reference specific sections during implementation without re-reading the file.

## Plan persistence

Plans persist in `~/.claude/plans/`. Recovery on session resume uses 5 layers (in `copyPlanForResume`):

1. Direct file read (local sessions)
2. `file_snapshot` messages in transcript (remote/CCR sessions — pods may be reclaimed)
3. `ExitPlanMode` tool_use `plan` field
4. `planContent` field on user messages
5. `plan_file_reference` attachment created by auto-compact

Forks get a **new slug** (never reuse — would cause cross-session overwrites). Re-entering plan mode in an existing session injects a guide: "Read the existing plan file, decide if it's relevant, then overwrite or modify."

## Composition with `/goal`

Goals drive autonomous loops but **don't enter plan mode on their own**. To combine:

- A goal can be set to "plan and implement X" — when the goal evaluator first runs, it can decide to call `EnterPlanMode` before doing anything.
- Use `/goal` with a constraint like "always start by entering plan mode and getting approval" for risky recurring work.
- The plan file is the natural handoff: a goal can read `~/.claude/plans/<slug>.md` to check whether the user has approved the next step before acting.

**Pattern**: goal = "implement issue #N" → goal agent enters plan mode → writes plan → calls `ExitPlanMode` → user approves → goal loop continues to implementation.

## Composition with subagents

Plan Mode **requires main thread** — sub-agents cannot call `EnterPlanMode` (validated by `context.agentId` check that throws). The reasoning: Plan Mode needs user approval, sub-agents run in the background without that interaction.

But plan-mode main thread **can still spawn sub-agents** (Explore, Plan, general-purpose) for research. These sub-agents inherit the read-only restrictions. The Plan agent specifically is invoked from main thread during Phase 2; the Explore agent during Phase 1.

**Pattern for senior planning**: main thread enters plan mode → launches 2-3 Explore agents in parallel (different facets: "find all auth code paths", "find all test patterns", "find all config touchpoints") → launches 1-3 Plan agents in parallel with each Explore output → synthesizes → asks user clarifying questions → writes plan → exits.

## When to use / when not to use

| Use Plan Mode | Skip Plan Mode |
|---|---|
| Multi-file refactors (5+ files) | Single-line fixes, typo corrections |
| Database migrations / schema changes | Tight iteration loops (try → adjust → try) |
| Production code paths (ships to users) | Read-only investigation ("how does X work?") |
| Ambiguous instructions (multi-valid approaches) | Throwaway sandbox / scratch branch |
| New repository onboarding (unfamiliar code) | Single-file tweaks |
| Architectural decisions (choose pattern/tech) | Pure research / codebase Q&A |
| Long-running batch jobs (200 file edits) | Tasks already done many times |
| Cross-package changes in a monorepo | Adding a test to an existing well-understood function |
| Changes that touch durable / hard-to-undo state | Work where mistakes are cheap |
| Multi-file CI/CD pipeline changes | Cosmetic edits (rename a variable) |

**Decision rule**: use plan mode when the **cost of an unintended action** exceeds the **cost of approval**. For cheap iteration, the friction dominates.

## Plan mode vs plain planning in conversation

What plain "let's discuss this" gets you:
- Conversational back-and-forth
- A plan that exists only in chat scrollback
- No enforced read-only restriction
- No approval checkpoint before execution
- User has to remember to say "go" themselves

What plan mode adds:
- **Read-only enforcement** (model literally cannot mutate)
- **Structured 5-phase workflow** (Explore → Plan → Review → Final → Exit)
- **Plan file on disk** (`~/.claude/plans/<slug>.md`) — persistent, editable, scannable
- **Approval dialog** with edit-before-approve UI
- **Permission restoration on exit** to the precise `prePlanMode` (auto, default, bypass)
- **Session-level state tracking** (`hasExitedPlanMode`, `needsPlanModeExitAttachment`)
- **Sub-agent orchestration** (parallel Explore/Plan agents in Phase 1/2)
- **`allowedPrompts` declaration** so bash categories are pre-batched for the implementation phase

## Plan agent vs custom subagent

The built-in **Plan** subagent is the right choice when:
- The planning perspective is generic ("design the implementation")
- You want the read-only safety net automatically enforced
- Speed matters (built-in agents are pre-loaded)

Override with a custom subagent when:
- The planning task has a **specific perspective** the model should take ("design with a focus on testability" or "design for minimal API surface")
- You want **different tooling** (e.g., include MCP servers the built-in Plan agent doesn't have)
- The team's planning rubric differs from the default (e.g., always include a rollback plan, always cite SLOs)

The Plan subagent's prompt can be **shadowed** by placing a `plan-agent.md` (or equivalent) in your project's `.claude/agents/` directory — Claude Code loads project-defined agents with higher priority than built-ins.

## Triggers that auto-elect plan mode

The `EnterPlanMode` tool prompt lists 7 conditions that warrant entering plan mode (external users):

1. **New feature implementation** — adding meaningful new functionality
2. **Multiple valid approaches** — the task can be solved several different ways
3. **Code modifications** — changes that affect existing behavior or structure
4. **Architectural decisions** — choosing between patterns or technologies
5. **Multi-file changes** — likely to touch >2-3 files
6. **Unclear requirements** — need to explore before understanding full scope
7. **User preferences matter** — implementation could reasonably go multiple ways

For internal/Anthropic builds, the prompt is more conservative — only suggests plan mode when there's "genuine architectural ambiguity."

## Failure modes & edge cases

- **Model forgets it exited**: `ExitPlanMode` validation rejects calls when `mode !== 'plan'`. Caused by context compaction removing the exit signal, or attachment throttling suppressing the reminder.
- **Auto-mode circuit breaker**: if `prePlanMode === 'auto'` but the auto gate has been closed during plan mode, exit falls back to `default` rather than bypassing the circuit breaker.
- **Remote (CCR) sessions**: pods can be reclaimed; plans must be re-constructed from `file_snapshot` messages in the transcript.
- **Re-entry in same session**: injects a guide requiring the model to read the existing plan file before overwriting — prevents stale-plan continuation.
- **Sub-agent enters plan mode**: hard-thrown by `EnterPlanMode` tool (no user interaction channel).
- **Empty plan**: returns "User has approved exiting plan mode. You can now proceed." instead of the full plan echo.

## Quick reference for this project

For senior-level planning in `complete-electron-template`:

- Use `/plan` (or just let the model call `EnterPlanMode`) for any change touching multiple packages (`apps/desktop`, `apps/web`, `packages/api`, `packages/db`, `packages/sdk`).
- The plan file lives at `~/.claude/plans/<word-slug>.md` — open it in your editor to scrub before approving.
- For CI/CD workflow changes (`.github/workflows/`): always plan mode, never skip — these are hard to roll back and run on every push.
- For Electron main-process changes (`apps/desktop/src/main/`): always plan mode — wrong IPC wiring is expensive to debug.
- For Drizzle schema changes (`packages/db/src/`): always plan mode + declare migration commands in `allowedPrompts`.
- For documentation-only changes: skip plan mode — too much friction.

## Sources

- https://code.claude.com/docs/en/plan-mode (official docs — fetched returned empty, but URL is canonical)
- https://notes.tsukino.dev/99-%E5%B7%A5%E5%85%B7%E4%B8%8E%E5%8F%82%E8%80%83/repos/how-claude-code-works/en/docs/10-plan-mode (deep source-level breakdown of plan mode internals)
- https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/ (Armin Ronacher's reverse-engineering of the plan-mode prompt)
- https://tygartmedia.com/claude-code-plan-mode/ (practical when-to-use / when-not-to-use guide, 2026)
- https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-exitplanmode.md (verbatim `ExitPlanMode` tool description)
- https://github.com/SinghCoder/claude-code/blob/4b9d30f7/src/tools/AgentTool/built-in/planAgent.ts (Plan subagent source — model, tools, disallowed list, system prompt)
- https://docs.rs/claude-codes/latest/claude_codes/tool_inputs/struct.ExitPlanModeInput.html (`ExitPlanModeInput` schema showing `allowed_prompts` field)
- https://github.com/anthropics/claude-code/issues/49843 (ExitPlanMode tool missing after activation — known edge case)
- https://github.com/anthropics/claude-code/issues/26520 (defer/abandon option missing — known UX gap)
- https://code.claude.com/docs/en/permission-modes (related — plan mode is one of four permission modes)

Related: [[subagents]] [[workflows]] [[goals]] [[loops-and-scheduling]] [[skills-overview]] [[skills-frontmatter]] [[skills-invocation]] [[orpc-bridge]] [[monorepo-structure]] [[ci-cd-patterns]]