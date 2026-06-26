# Issue-Triage Agent — Eval Suite

P5 of the v2 design (`docs/internal/architecture/agents/reports/issue-triage-v2-design.md`).

This suite gives the v2 issue-triage agent a rule-based regression
gate. Every assertion is deterministic (tool-call shape, comment-section
presence, label-name matches). LLM-as-judge is intentionally deferred —
we want evals to be fast and runnable on every PR without burning
tokens. Add it later once we have enough production data to know what
"good" looks like.

## Layout

```
agent/evals/
├── README.md            # this file
├── evals.config.ts      # eval-run config (maxConcurrency, timeoutMs)
├── fixtures/            # synthetic GitHub issue payloads
│   ├── 001-clear-bug.json
│   ├── 002-bug-missing-repro.json
│   ├── ... (20 total)
└── cases/               # one *.eval.ts per fixture
    ├── _helpers.ts      # shared matchers (skipped by discovery — note the underscore)
    ├── 001-clear-bug.eval.ts
    ├── ...
```

## Running the suite

From the `agent/` directory:

```bash
pnpm eval
```

The runner (`eve eval`) starts a local dev server, loads each
`cases/*.eval.ts`, drives the agent via `t.send(...)`, and asserts
against the captured stream events. Output is human-readable on the
console; pass `--json` for machine-readable results or `--junit path`
for a JUnit XML report.

### Listing evals without running them

```bash
pnpm eval --list
```

### Filtering by tag

```bash
pnpm eval --tag dispatcher
```

The eval cases tag themselves (`triage`, `bug`, `feature`, `dispatcher`,
`out-of-scope`, etc.) so you can scope a run to a subset.

### Running a single eval

```bash
pnpm eval 001-clear-bug
```

The id is the path slug (`evals/cases/001-clear-bug.eval.ts` →
`001-clear-bug`).

## Adding a new fixture

1. Drop a JSON file under `evals/fixtures/` named `<NN>-<slug>.json`
   where `<NN>` is the next zero-padded number (e.g. `021-...json`).
2. The JSON shape is a stripped-down GitHub `issues` event payload
   (the same shape `agent/channels/github.ts` receives). At minimum:
   ```json
   {
     "event": "issues",
     "action": "opened",
     "issue": { "number": 121, "title": "...", "body": "...", "labels": [] },
     "repository": { "owner": { "login": "..." }, "name": "..." },
     "expected": {
       "labels_applied": ["type: bug", "p2: medium", "effort: s"],
       "proposed_status": "status: ready",
       "rationale": "..."
     }
   }
   ```
3. Add the import to `evals/cases/_helpers.ts` so `loadFixture()` can find it.
4. Author the matching `evals/cases/<NN>-<slug>.eval.ts` using the
   shared helpers (`loadFixture`, `formatIssueAsUserMessage`,
   `expectLabelsApplied`).

## Adding a new eval case

Each `cases/*.eval.ts` is exactly one case. Use `defineEval()` from
`eve/evals`. The eval identity is derived from the file path — do
NOT author an `id` or `name` field (eve's discovery layer throws).

Minimal shape:

```ts
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Short, human-readable description of what this eval tests",
  tags: ["triage", "bug"],
  test: async (t) => {
    const fixture = loadFixture("001-clear-bug");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("## Latest classification"));

    t.completed();
    t.noFailedActions();
  },
});
```

## Interpreting failures

The console reporter prints, per eval:

```
[001-clear-bug] FAIL
  ✗ [GATE] apply_proposed_labels: input.labels must include "type: bug"
  ✗ [GATE] reply must include "## Latest classification"
```

The fix loop:

1. Read which assertion failed and on which fixture.
2. Reproduce locally by sending the fixture's `issue.body` to a
   `pnpm dev` session.
3. Fix the agent (likely a prompt tweak in
   `agent/skills/triage-workflow.md` or a tool call in
   `agent/tools/apply_proposed_labels.ts`).
4. Re-run `pnpm eval` to confirm the fix.

If the failure is a **false positive** (the agent did the right thing
but the assertion is too strict), update the assertion in the
matching `.eval.ts` — not the agent. The eval suite is a contract;
if the contract is wrong, fix the contract.

## Coverage matrix (as of 2026-06-25)

| Fixture | Type | Tests |
|---|---|---|
| 001 | bug | Trivial clear bug — default labels, comment shape |
| 002 | bug | Missing repro — needs-info path |
| 003 | feature | Concrete proposal — happy path |
| 004 | bug | Duplicate of #22 — blocked path |
| 005 | bug | File paths — code-digging via P4 tools |
| 006 | refactor | Multi-file refactor — effort:l, status:triage |
| 007 | docs | Two-line README fix — effort:xs |
| 008 | security | Security boundary bypass — p0:critical |
| 009 | (off-topic) | General question — no labels applied |
| 010 | bug | Release blocker — p0:critical |
| 011 | bug | Long body, multiple code blocks — formatting |
| 012 | feature | No template match — v1 heuristic fallback |
| 013 | bug (edited) | Whitespace-only edit — no-op turn |
| 014 | bug (edited) | Material change — re-triage, priority bump |
| 015 | bug (labeled) | status:* change — re-triage with empty diff |
| 016 | bug (labeled) | non-status change — dispatcher ignores |
| 017 | bug (closed) | Close event — purge state, no turn |
| 018 | bug (reopened) | Reopen event — fresh dispatch with history |
| 019 | bug | Full template match — compliance check passes |
| 020 | feature | Multi-week feature — effort:l, status:triage |

## When to update the suite

- **New label added to `CLAUDE.md`'s "Issue Labels" section** — add a
  fixture that exercises the new label so the agent's coverage grows
  with the taxonomy.
- **New tool added under `agent/tools/`** — add a fixture that calls
  the tool so the eval suite asserts the tool's contract.
- **New skill added under `agent/skills/`** — add a fixture that
  triggers the skill so the eval suite asserts it's loaded.
- **Real production issue worth remembering** — port the issue (with
  PII redacted) into a fixture and add the case. Synthetic fixtures
  are the v1 baseline; real ones are the v2 quality bar.

## Out of scope for v1 of the eval suite

- LLM-as-judge scoring (`t.judge.*`) — deferred per non-goals;
  rule-based only.
- Eval-set curation from real production issues — deferred until we
  have a few weeks of v2 deployment data.
- Timing / latency assertions — the agent's latency varies by turn
  volume; defer until we have a baseline.
- Multi-language test cases (the agent operates in English).

## References

- v2 design doc: `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`
- eve eval API: `eve/dist/src/evals/types.d.ts` (in `node_modules/`)
- Label taxonomy: `CLAUDE.md` § "Issue Labels"
- Triage workflow: `agent/skills/triage-workflow.md`