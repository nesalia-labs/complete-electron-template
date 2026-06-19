---
name: loops-and-scheduling
description: How Claude Code's /loop command and scheduled tasks work — interval-based polling, cron expressions, jitter rules, 7-day auto-expiry, session scoping, and how /loop differs from /goal.
metadata:
  type: reference
---

# Loops & Scheduled Tasks

`/loop` is a **bundled skill** (Claude Code v2.1.72+) that re-runs a prompt on a schedule within the current session. It's one of three scheduling surfaces; pick by persistence and machine dependency.

## Three scheduling surfaces

| | Cloud (Routines) | Desktop | `/loop` |
|---|---|---|---|
| Runs on | Anthropic cloud | Your machine | Your machine |
| Needs machine on | No | Yes | Yes |
| Needs open session | No | No | **Yes** |
| Persistent across restarts | Yes | Yes | Only if `--resume`d and unexpired |
| Local file access | No (fresh clone) | Yes | Yes |
| Min interval | 1 hour | 1 minute | 1 minute |

**Rule of thumb:** cloud for "must run reliably without me", desktop for "needs my files and tools", `/loop` for "quick polling during this session".

## /loop invocation shapes

| Form | Example | Behavior |
|---|---|---|
| Interval + prompt | `/loop 5m check the deploy` | Fixed cron schedule |
| Prompt only | `/loop check the deploy` | Claude picks interval (1–60 min) each iteration based on observation |
| Interval only or nothing | `/loop` / `/loop 15m` | Built-in maintenance prompt, or your `loop.md` |

Interval syntax: bare token (`30m`, `2h`, `45s`) or clause (`every 2 hours`, `daily`). Units: `s`, `m`, `h`, `d`. Seconds round up to nearest minute (cron granularity). Awkward intervals (`7m`, `90m`) round to nearest cron-mappable step; Claude tells you what it picked.

**Chaining:** `/loop` can re-run other skills/commands each iteration:
```text
/loop 20m /review-pr 1234
/loop 1h  /lint-fix src/api
```

## Dynamic-interval mode

When you omit the interval, Claude picks a delay between 1 min and 1 hour after each iteration based on observed activity — short waits while a build/PR is active, longer when nothing's pending. The chosen delay and reason are printed at the end of each turn.

May use the **Monitor tool** under the hood (background script streaming output), which is more token-efficient than re-prompting on a cron.

Dynamically scheduled loops still appear in the task list, can be cancelled, and obey the 7-day expiry. They don't apply jitter rules. On Bedrock/Vertex/Foundry, prompt-only `/loop` uses a fixed 10-minute schedule instead.

## Built-in maintenance prompt

Bare `/loop` (no prompt, no interval) runs a default sequence each iteration:

1. Continue any unfinished work from the conversation
2. Tend to current branch's PR: review comments, failed CI, merge conflicts
3. Run cleanup passes (bug hunts, simplification) when nothing else is pending

Claude will NOT start new initiatives outside that scope. Irreversible actions (push, delete) only proceed when the transcript already authorized them. On Bedrock/Vertex/Foundry, bare `/loop` prints the usage message instead of running.

## Customizing the default prompt — `loop.md`

A `loop.md` file replaces the built-in maintenance prompt. Plain Markdown, no required structure — write it as if typing the `/loop` prompt.

| Path | Scope |
|---|---|
| `.claude/loop.md` | Project (takes precedence) |
| `~/.claude/loop.md` | User (any project without its own) |

Ignored when you supply a prompt on the command line. Edits take effect on the next iteration — refine while a loop is running. 25,000-byte truncation cap. Not read on Bedrock/Vertex/Foundry.

```markdown
Check the `release/next` PR. If CI is red, pull the failing job log,
diagnose, and push a minimal fix. If new review comments arrived,
address each one and resolve the thread. If everything is green and
quiet, say so in one line.
```

## Stopping

- **Esc** while a `/loop` is waiting for next iteration → clears the pending wakeup, loop won't fire again. Doesn't affect tasks scheduled by asking Claude directly.
- **Self-paced mode** — Claude can choose not to schedule the next wakeup once the task is provably complete. Fixed-interval loops keep running until you stop or 7 days elapse.

## Session scope and resume

Tasks are **session-scoped**: they die when the session ends. `--resume` / `--continue` restores tasks that haven't expired:

- Recurring tasks within **7 days** of creation
- One-shot tasks whose scheduled time hasn't passed yet
- Background Bash and Monitor tasks are **never** restored

A fresh conversation clears everything.

## Underlying tools

| Tool | Purpose |
|---|---|
| `CronCreate` | Schedule a task. 5-field cron + prompt + recurring flag |
| `CronList` | List scheduled tasks with 8-char IDs |
| `CronDelete` | Cancel by ID |

Max 50 scheduled tasks per session. Disable entirely with `CLAUDE_CODE_DISABLE_CRON=1`.

## Cron expression reference

Standard 5-field: `minute hour day-of-month month day-of-week`. Wildcards `*`, steps `*/15`, ranges `1-5`, lists `1,15,30`. Day-of-week: `0`/`7` = Sunday through `6` = Saturday. **No extended syntax** (no `L`, `W`, `?`, no `MON`/`JAN` aliases).

When both day-of-month and day-of-week are constrained, a date matches if **either** matches (vixie-cron semantics).

```text
*/5 * * * *    # every 5 min
7  * * * *    # every hour at :07 (avoid :00 — see jitter)
0  9 * * *    # daily 9am local
0  9 * * 1-5  # weekdays 9am
30 14 15 3 *  # March 15 at 2:30pm
```

## Jitter and timing

The scheduler adds a deterministic offset per task ID to avoid synchronized API hits:

- **Recurring tasks** — fire up to 30 min after scheduled time (or half the interval, whichever is smaller, for sub-hourly tasks)
- **One-shot tasks at :00 or :30** — fire up to 90 seconds early
- All times in **local timezone**
- **Pick non-zero/non-thirty minutes for exact timing** — e.g. `3 9 * * *` not `0 9 * * *`

The offset is derived from task ID, so the same task always gets the same offset (predictable, not random).

## 7-day expiry

Recurring tasks auto-expire 7 days after creation: fire one final time, then delete. Bounds how long a forgotten loop can run. Need longer? Cancel and recreate before expiry, or use Routines / Desktop scheduled tasks for durable scheduling.

## Limitations

- **No catch-up for missed fires.** If a task's scheduled time passes while Claude is busy, it fires once when idle, not once per missed interval.
- **No off-the-clock execution.** Tasks only fire while Claude Code is running and idle.
- **Starting fresh clears all session-scoped tasks** (except via `--resume`).

## /loop vs /goal

| | `/loop` | `/goal` |
|---|---|---|
| Trigger | Time interval elapses | Previous turn finishes |
| Stop condition | You stop it, or Claude decides done | Model confirms condition met |
| Best for | Polling, babysitting, reminders | Substantial work with verifiable end state |
| Evaluator | None (just runs) | Small fast model (default Haiku) |

Use `/loop` for *"check the CI every 5 min"*. Use `/goal` for *"finish migrating this module until tests pass"*. See [[goals]].

## Sources

- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/commands

Related: [[goals]], [[skills-overview]]
