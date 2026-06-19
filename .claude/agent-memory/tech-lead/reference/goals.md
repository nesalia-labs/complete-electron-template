---
name: goals
description: How Claude Code's /goal command works — condition-driven autonomous mode, evaluator model, writing effective conditions, lifecycle and resume behavior. Companion to /loop.
metadata:
  type: reference
---

# Goals — `/goal`

`/goal` is a **bundled skill** (Claude Code v2.1.139+) that sets a completion condition and keeps Claude working turn after turn until the condition holds. After each turn, a small fast model evaluates the conversation against the condition. If not met, Claude starts another turn instead of returning control to you.

## When to use `/goal`

Substantial work with a verifiable end state:

- Migrating a module to a new API until every call site compiles and tests pass
- Implementing a design doc until all acceptance criteria hold
- Splitting a large file into focused modules until each is under a size budget
- Working through a labeled issue backlog until the queue is empty

Don't use for: open-ended exploration, work with no testable finish line, or anything requiring frequent user judgment.

## /goal vs /loop vs Stop hook vs Auto mode

| Approach | Next turn starts when | Stops when |
|---|---|---|
| `/goal` | Previous turn finishes | Model confirms condition met |
| `/loop` | Time interval elapses | You stop it, or Claude decides done |
| Stop hook | Previous turn finishes | Your script or prompt decides |
| Auto mode (alone) | (per turn) | Claude judges work done; no per-tool prompts |

`/goal` and Stop hook both fire after every turn. **`/goal` is a session-scoped shortcut** — type a condition, active for current session. A **Stop hook** lives in settings, applies to every session in its scope, and can run a script for deterministic checks or a prompt for model-evaluated ones.

Auto mode handles per-tool approvals; `/goal` handles per-turn approvals. **Complementary**, not redundant: auto mode + `/goal` = fully unattended runs.

## Usage

### Set a goal

```text
/goal all tests in test/auth pass and the lint step is clean
```

Setting the goal starts a turn immediately — the condition itself is the directive, no separate prompt needed. A `◎ /goal active` indicator shows how long it's been running. After each turn, the evaluator returns a short reason (yes/no + why); the most recent reason appears in the status view and transcript.

One goal per session. New `/goal` replaces existing. Condition max **4,000 characters**.

### Check status

```text
/goal
```

Shows: condition, duration, turns evaluated, token spend, latest evaluator reason. Also shows a previously achieved goal's stats if no goal is currently active.

### Clear early

```text
/goal clear
```

Aliases: `stop`, `off`, `reset`, `none`, `cancel`. `/clear` (new conversation) also removes any active goal.

### Non-interactive

```bash
claude -p "/goal CHANGELOG.md has an entry for every PR merged this week"
```

Runs the loop to completion in a single invocation. Ctrl+C stops before completion.

## Writing effective conditions

The evaluator **judges your condition against what Claude has surfaced in the conversation**. It does NOT run commands or read files independently. Write the condition as something Claude's own output can demonstrate.

**Good conditions have three parts:**

1. **One measurable end state** — test result, build exit code, file count, empty queue
2. **A stated check** — how Claude proves it: "`npm test` exits 0", "`git status` is clean"
3. **Constraints that matter** — what must NOT change: "no other test file is modified"

**Bounded runs** — include a turn or time clause:
```text
/goal all test/auth tests pass, or stop after 20 turns
```

Claude reports progress against the clause each turn; the evaluator judges it from the conversation.

## How evaluation works

`/goal` is a **wrapper around a session-scoped prompt-based Stop hook**. Each turn end:

1. Condition + conversation so far sent to the configured small fast model (default **Haiku**)
2. Model returns yes/no + short reason
3. "No" → Claude keeps working, reason included as guidance for next turn
4. "Yes" → goal cleared, achieved entry recorded in transcript

**Evaluator constraints:**
- Runs on the small model configured for your provider
- **Does NOT call tools** — can only judge what Claude has already surfaced
- Tokens billed on the small model, typically negligible vs main-turn spend
- Decision made by a **fresh model**, not the one doing the work (less self-bias)

## Resume behavior

A goal still active when the session ended is **restored** with `--resume` or `--continue`:

- **Condition carries over**
- Turn count, timer, and token-spend baseline **all reset** on resume
- Already-achieved or cleared goals are NOT restored

## Requirements

`/goal` only runs in workspaces where you've **accepted the trust dialog**, because the evaluator is part of the hooks system. It's unavailable when:

- `disableAllHooks` is set at any settings level
- `allowManagedHooksOnly` is set in managed settings

In each case the command tells you why instead of silently doing nothing.

## When to reach for /goal vs /loop

- **Use `/goal`** when the work has a clear done-state you can phrase: "tests pass", "all issues closed", "file under 200 lines"
- **Use `/loop`** when you're polling or babysitting something external: "check the deploy", "ping me when CI goes green"
- **Use both** when you have a session running a long goal and want to also poll external status in parallel (different scheduled tasks)

Related: [[loops-and-scheduling]], [[skills-overview]]
