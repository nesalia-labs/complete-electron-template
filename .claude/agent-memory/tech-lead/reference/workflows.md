---
name: workflows
description: How Claude Code dynamic workflows work — JavaScript orchestration scripts, agent/parallel/pipeline APIs, ultracode opt-in, patterns (adversarial verify, fan-out, tournament, loop-until-dry), cost control, and when to use vs subagents/skills/agent teams.
metadata:
  type: reference
---

# Workflows

A **dynamic workflow** is a JavaScript script that orchestrates subagents at scale. **Claude writes the script for your task, and a runtime executes it in the background** while your session stays responsive. The plan lives in the script, not in Claude's context.

- Requires **CC v2.1.154+**
- Available on paid plans (Pro/Max/Team/Enterprise)
- Pro must enable via `/config` → Dynamic workflows
- Available on Anthropic API, Bedrock, Vertex AI, Microsoft Foundry

## When to reach for workflows

| | Subagents | Skills | Agent teams | Workflows |
|---|---|---|---|---|
| What it is | Worker Claude spawns | Instructions Claude follows | Lead agent supervising peers | Script runtime executes |
| **Who decides next** | Claude, turn by turn | Claude, following prompt | Lead agent, turn by turn | **The script** |
| Where intermediate results live | Claude's context | Claude's context | Shared task list | **Script variables** |
| Repeatable | Worker definition | Instructions | Team definition | **Orchestration itself** |
| Scale | Few delegated/turn | Same as subagents | Few long peers | **Dozens to hundreds/run** |
| Interruption | Restarts turn | Restarts turn | Teammates keep running | **Resumable in same session** |

**Reach for a workflow when:**
- The task needs more agents than one conversation can coordinate
- You want the orchestration codified as a script you can read and rerun
- The task has any of these failure modes that compound over context length

### Failure modes workflows solve

Single-context-window long tasks break down in specific ways:

- **Agentic laziness** — Claude stops after partial progress (35 of 50 items, declares "done")
- **Self-preferential bias** — Claude prefers its own results when asked to verify
- **Goal drift** — lossy summarization loses edge-case requirements across compactions

Workflows combat all three by giving each agent its **own context window and focused, isolated goal**.

## How to invoke a workflow

| Method | Syntax | When |
|---|---|---|
| Bundled | `/deep-research <question>` | Built-in cross-source research |
| `ultracode` keyword | "ultracode: audit every API endpoint..." | Single task, no session change |
| Natural language | "use a workflow", "run a workflow" | Same opt-in as `ultracode` |
| `/effort ultracode` | Session-wide setting | Claude plans workflow for every substantive task |

**Trigger word history:** Before v2.1.160 the literal trigger was `workflow`; natural-language requests work in both versions. Press **Option+W** (Mac) / **Alt+W** (Win/Linux) to dismiss the highlight for one prompt. Toggle off entirely via `/config` → Ultracode keyword trigger.

Ultracode = `xhigh` reasoning effort + automatic workflow orchestration. Resets when session ends — drop back with `/effort high` when done.

## Approval flow

| Permission mode | When prompted |
|---|---|
| `default`, `acceptEdits` | Every run (unless "Yes, and don't ask again") |
| `auto` | First launch only. Later launches use cached consent. Skipped when ultracode on |
| `bypassPermissions`, `claude -p`, Agent SDK | Never. Run starts immediately |

In CLI, options shown: **Yes, run** / **Yes, don't ask again** / **View raw script** (`Ctrl+G` opens in editor) / **No**. `Tab` adjusts the prompt before launch.

**Permission mode only controls the launch prompt.** Subagents inside a workflow always run `acceptEdits` and inherit your tool allowlist — file edits auto-approved. Shell commands, web fetches, MCP tools not in allowlist can still prompt mid-run. **Add commands to allowlist before starting a long run** to avoid interruptions.

In `claude -p` and Agent SDK there's no one to prompt, so tool calls follow configured permission rules without interactive confirmation.

## Watch progress

`/workflows` opens progress view. Task panel below input box shows one-line summary while running.

| Key | Action |
|---|---|
| ↑ / ↓ | Select phase or agent |
| Enter / → | Drill into phase, then into agent (prompt, recent tool calls, result) |
| Esc | Back out one level |
| j / k | Scroll within agent detail |
| p | Pause or resume run |
| x | Stop selected agent, or whole run when focus is on the run |
| r | Restart selected running agent |
| s | Save run's script as a command |

## Resume

Stopped runs are **resumable within the same session**: completed agents return cached results, rest run live. Resume via `p` in `/workflows` or ask Claude to relaunch the same script.

**New session starts fresh.** Exit CC while running → next session restarts from scratch.

## Script anatomy

Every script must begin with a pure-literal `meta` block (no variables, function calls, spreads, or template interpolation):

```js
export const meta = {
  name: 'find-flaky-tests',                                    // required
  description: 'Find flaky tests and propose fixes',           // required (one-line, shown in permission dialog)
  whenToUse: '...',                                            // optional (shown in workflow list)
  phases: [                                                    // optional — must match phase() titles exactly
    { title: 'Scan', detail: 'grep test logs for retries' },
    { title: 'Fix', detail: 'one agent per flaky test' },
  ],
}
// script body starts here
```

`meta.phases` lets you pre-declare phase groups for the progress display. A `phase()` call with no matching `meta` entry just gets its own group. Add `model` per phase when a stage uses a specific override.

## Core API

| Call | Purpose |
|---|---|
| `agent(prompt, opts?)` | Spawn subagent. Default returns text; with `schema` returns validated object. Returns `null` on user-skip or terminal error after retries. |
| `pipeline(items, stage1, stage2, ...)` | Each item flows through all stages independently. **DEFAULT** for multi-stage. Wall-clock = slowest single-item chain. |
| `parallel(thunks)` | **Barrier.** Awaits all thunks before returning. Throws resolve to `null`. Use only when stage N needs all of stage N-1. |
| `phase(title)` | Start a new progress group. |
| `log(message)` | Narrator line above the progress tree. |
| `args` | Global — the value passed as Workflow's `args` input, verbatim. **Pass arrays/objects as actual JSON values, not stringified** — `"[\"a.ts\"]"` reaches the script as one string and breaks `args.filter`. |
| `budget` | `{ total, spent(), remaining() }` from user's "+500k" directive. `total` is `null` if no target. Use for dynamic loops. |
| `workflow(nameOrRef, args?)` | Run another workflow inline. **One level of nesting only** — `workflow()` inside a child throws. |

### `agent()` opts

| Opt | Notes |
|---|---|
| `label` | Display label |
| `phase` | Explicit progress group (use inside `parallel`/`pipeline` to avoid races) |
| `schema` | JSON Schema — validation happens at tool-call layer, model retries on mismatch |
| `model` | Override; omit to inherit main-loop model |
| `isolation: 'worktree'` | Fresh git worktree per agent. **Expensive** (~200-500ms setup + disk); use only when agents mutate files in parallel. Auto-removed if unchanged. |
| `agentType` | Custom subagent type (e.g. `'Explore'`, `'code-reviewer'`, `'Plan'`); composes with `schema` |
| `run_in_background` | Async run |

`agent()` returns the subagent's **final text** as a string (default) or the **validated structured object** when `schema` is set. The subagent's text result is the return value — not a human-facing message — so it returns raw data.

### Built-in JS

Standard: `JSON`, `Math`, `Array`. **THROWS:** `Date.now()`, `Math.random()`, argless `new Date()` — would break resume. Pass timestamps via `args`, stamp results after the workflow returns. Vary randomness via index in prompts instead.

**No filesystem or Node.js API access from the script.** Agents read/write/run; the script coordinates.

## Constraints

| Constraint | Why |
|---|---|
| **No mid-run user input** | Only agent permission prompts can pause. For sign-off between stages, run each stage as its own workflow |
| **No direct FS or shell from script** | Agents do the work; script coordinates |
| **Up to 16 concurrent agents** | Fewer on low-CPU machines |
| **1,000 agents total per run** | Runaway-loop backstop |
| **4,096 max items per parallel/pipeline call** | Explicit error, no silent truncation |

## pipeline vs parallel — the decision

**Default to `pipeline()`** (each item through stages, no barrier between stages). Item A can be in stage 3 while item B is still in stage 1. Wall-clock = slowest single-item chain, not sum-of-slowest-per-stage.

Each stage callback receives `(prevResult, originalItem, index)`. Use `originalItem`/`index` in later stages to label work without threading context through stage 1's return.

A stage that throws drops that item to `null` and skips its remaining stages.

**Use `parallel()` (barrier) ONLY when:**

- Stage N needs cross-item context from ALL of stage N-1 (dedup across full set, early-exit if count = 0, comparison needs all findings)
- **Not justified by:** "I need to flatten/map/filter first" (do it inside a pipeline stage), "stages are conceptually separate" (that's what pipeline models), "cleaner code" (barrier latency is real — 5 finders where slowest takes 3× fastest wastes 2/3 of fast finders' idle time)

**Smell test:** If you wrote `parallel()` then transform then `parallel()` again, that middle transform doesn't need the barrier. Rewrite as `pipeline` with the transform inside a stage.

## Common patterns

| Pattern | When | Shape |
|---|---|---|
| **Fan-out-and-synthesize** | Many small independent steps that benefit from clean contexts | `pipeline(items, findOne, transform, synth)` |
| **Adversarial verify** | Findings need independent refutation | `parallel(Array(N, () => refuterAgent()))`; kill if majority refutes |
| **Perspective-diverse verify** | Findings can fail in multiple ways | Multiple `agent()` calls with distinct lenses (correctness, security, perf, repro) |
| **Tournament** | Multiple independent approaches need judging | N attempts → pairwise judge agents → bracket |
| **Generate-and-filter** | Need best N of many candidates | Generate, dedupe, verify, return survivors |
| **Loop-until-dry** | Unknown-size discovery (bugs, issues) | While loop with `seen` Set; exit after K consecutive empty rounds |
| **Classify-and-act** | Task type determines routing | Classifier agent → switch on result |
| **Multi-modal sweep** | One search angle won't find everything | Parallel agents each searching differently; blind to others |
| **Completeness critic** | Final check for coverage gaps | "What's missing — modality not run, claim unverified?" |

**Always log() what was dropped.** Silent truncation reads as "covered everything" when it didn't.

## Canonical multi-stage shape

```js
const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  review => parallel(review.findings.map(f => () =>
    agent(`Adversarially verify: ${f.title}`, { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      .then(v => ({ ...f, verdict: v }))
  ))
)
const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
return { confirmed }
```

## Loop patterns

**Loop until count:**
```js
const bugs = []
while (bugs.length < 10) {
  const result = await agent("Find bugs in this codebase.", { schema: BUGS_SCHEMA })
  bugs.push(...result.bugs)
  log(`${bugs.length}/10 found`)
}
```

**Loop until budget:**
```js
while (budget.total && budget.remaining() > 50_000) {
  const result = await agent("...", { schema: BUGS_SCHEMA })
  bugs.push(...result.bugs)
  log(`${bugs.length} found, ${Math.round(budget.remaining()/1000)}k remaining`)
}
```

**Loop until dry with adversarial verify:**
```js
const seen = new Set(), confirmed = []
let dry = 0
while (dry < 2) {
  const found = (await parallel(FINDERS.map(f => () =>
    agent(f.prompt, { phase: 'Find', schema: BUGS })))).filter(Boolean).flatMap(r => r.bugs)
  const fresh = found.filter(b => !seen.has(key(b)))
  if (!fresh.length) { dry++; continue }
  dry = 0; fresh.forEach(b => seen.add(key(b)))
  const judged = await parallel(fresh.map(b => () =>
    parallel(['correctness','security','repro'].map(lens => () =>
      agent(`Judge "${b.desc}" via the ${lens} lens — real?`, { phase: 'Verify', schema: VERDICT })))
      .then(vs => ({ b, real: vs.filter(Boolean).filter(v => v.real).length >= 2 }))))
  confirmed.push(...judged.filter(v => v.real).map(v => v.b))
}
```

**Dedup against `seen`, not `confirmed`** — else rejected findings reappear every round and never converge.

## Scale to what the user asked for

- "find any bugs" → few finders, single-vote verify
- "thoroughly audit this" → larger finder pool, 3-5 vote adversarial pass, synthesis stage
- When unsure, lean toward thoroughness for research/review/audit requests; brevity for quick checks

## Use cases (from the launch blog)

- **Migrations & refactors** — Bun rewrite from Zig to Rust; spin fix agents per call-site in worktrees, adversarial review, merge
- **Deep research** — `/deep-research` (bundled); fan-out searches, fetch, adversarially verify, synthesize
- **Deep verification** — one agent identifies claims, subagent per claim verifies; verification-of-verifier for source quality
- **Sorting** — pairwise comparison agents (more reliable than absolute scoring); bucket-rank in parallel then merge
- **Memory & rule adherence** — verifier per rule; mine sessions for corrections, cluster, verify, distill to `CLAUDE.md`
- **Root-cause** — independent hypotheses from disjoint evidence (logs / files / data); panel of verifiers + refuters
- **Triaging at scale** — classify + dedupe + act; pair with `/loop` for continuous. **Quarantine pattern**: bar agents reading untrusted content from high-privilege actions; that's the acting agents' job
- **Exploration & taste** — brainstorm solutions + rubric-based review loop
- **Evals** — agents in worktrees produce outputs, comparison agents grade against rubric
- **Model routing** — classifier agent picks Sonnet/Opus/Haiku based on expected complexity

## Combine with `/loop` and `/goal`

- `/loop` schedules workflows at intervals — triage/research/verification on cron
- `/goal` sets hard completion requirement — workflow runs until condition holds
- Bundle multiple workflows in sequence: one to understand, one to change, one to verify

## Cost control

A workflow spawns many agents — single run uses meaningfully more tokens than in-conversation work.

- **Test on small slice first** (one directory, narrow question)
- `/model` to a smaller model for routine stages before starting
- Ask Claude to use smaller models for stages that don't need the strongest
- `/workflows` view shows per-agent token usage live; stop at any point without losing completed work
- Runtime caps bound runaway scripts (1,000 agents max)

## Saving workflows

Save via `/workflows` → select run → press `s`. Two locations:

| Path | Scope |
|---|---|
| `.claude/workflows/` | Project, git-shared |
| `~/.claude/workflows/` | User, all projects |

Project wins over user when names collide. v2.1.178+ in monorepos: write to closest existing `.claude/workflows/` between cwd and repo root (or repo root if none). Load from every `.claude/workflows/` along that path; closest to cwd wins on collision.

Saved workflow runs as `/<name>`. Accepts `args` (passed as global `args` in script).

**Share via skill:** put JS workflow files in the skill folder, reference from `SKILL.md`. Prompt Claude to treat workflow as a **template**, not verbatim — gives more flexibility.

## Disabling

| Surface | How |
|---|---|
| Self | `/config` → Dynamic workflows toggle (persists) |
| Self | `"disableWorkflows": true` in `~/.claude/settings.json` (persists) |
| Self | `CLAUDE_CODE_DISABLE_WORKFLOWS=1` env var (read at startup) |
| Org | Managed settings or admin page |

When off: bundled workflow commands unavailable, `ultracode` keyword doesn't trigger, `/effort` menu drops `ultracode`.

## Persisted run scripts

Every run writes its script to `~/.claude/projects/...` under your session directory. Claude receives the path when the run starts. **Can read it, diff against previous run, or edit and ask Claude to relaunch from the edited version.**

## Sources

- https://code.claude.com/docs/en/workflows
- https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code

Related: [[subagents]], [[skills-overview]], [[goals]], [[loops-and-scheduling]]