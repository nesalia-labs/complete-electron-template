---
description: The decision flow for classifying a new or re-triaged issue — read, check info, classify, dedupe, decide proposed status, apply autonomous labels, post one comment. Load this first on every turn.
---

# Triage Workflow

A linear procedure. Do not skip steps. Do not post more than one triage
comment per issue. The comment is the entire deliverable of a turn;
autonomous labels are a side effect, never the headline.

---

## Step 1 — Read the issue

Before anything else, gather the full picture from context:

- **Title and body.** Skim for the ask, the proposed fix, and any
  repro / logs / screenshots already attached.
- **Current labels.** If `type:*`, `priority:*`, or `effort:*` is
  already set and looks right, you may leave it; never overwrite a
  classification you can't justify. If a label in another namespace
  is set, treat it as untrusted context.
- **Recent comments.** Look for a maintainer note, a duplicate pointer,
  or a "see also" reference. Comments frequently contain the answer to
  "is this already filed?".
- **Referenced paths.** Any file path mentioned in the body or comments
  is a strong signal — load `architecture-map.md` and confirm the path
  exists via `request_repo_info` before trusting it.

If the issue references a path you can't confirm, that's fine — note
it in the **Summary** with "path unverified" and move on. Do not block
on unverified paths; that's the comment's job, not yours.

## Step 2 — Check info completeness

A valid bug needs: repro steps (or a clear environment + observed
behavior), version / branch / commit, OS + Electron version if
relevant, and logs or screenshots. A valid feature needs: the use
case, the proposed API surface if any, and an acceptance criterion.

If **any** of the above is blocking, post the triage comment with the
**Info request** section filled out and **stop after step 7**. Do not
apply `priority:*` or `effort:*` labels yet — you can't size work
whose scope isn't pinned down. Apply only the `type:*` you can justify
from the title alone (almost always possible).

## Step 3 — Classify

Pick exactly one of each:

- **`type:*`** — see `label-taxonomy.md`. The default for an unclear
  issue is `type: bug` only if "something is broken"; otherwise
  `type: feature`. Never invent.
- **`priority:*`** — see `label-taxonomy.md`. Default `p2: medium` for
  valid, non-emergency issues. `p0: critical` requires a one-line
  reason in the **Classification** section ("breaks every render",
  "exposes user data", etc.).
- **`effort:*`** — see `label-taxonomy.md`. When in doubt, round up.
  `effort: l` always triggers a note in the triage comment proposing a
  split.

One-line reasoning for each, grounded in the issue text and the
relevant `architecture-map` section.

## Step 4 — Dedupe (keyword)

No embeddings in v1. Keyword search against:

- **Open issues** in the repo (title + body).
- **Recently closed issues** (last 90 days, title + body).
- **Open PRs** (title only — for issues that might already be fixed).

Extract 3–5 distinctive keywords from the title and the first
paragraph of the body. Surface the top 3 hits. If none, write "no
strong matches" — do not pad with weak hits.

If a hit is a clear duplicate of an open issue, propose `status:
blocked` and link it. If a hit is a PR that already implements the
feature, propose `status: ready` and link the PR — the issue is now
"ship when that PR lands".

## Step 5 — Decide proposed status

Pick one:

- **`status: ready`** — looks valid, complete, classified, dedupe'd.
  This is the happy path.
- **`status: needs-info`** — looks valid but missing critical info
  from step 2. The **Info request** section of the comment lists what.
- **`status: blocked`** — looks like a duplicate (step 4 hit) or
  blocked by a stated dependency. Always link the blocker.
- **Out of scope / spam** — does not describe a defect or feature in
  this repo. Flag for tech-lead in the **Summary**; do not apply any
  autonomous labels; the comment is still useful as a human-visible
  record of why we did nothing.

The proposed status goes in the comment text only. `apply_proposed_labels`
will reject `status:*` — that gate is intentional, not a bug.

## Step 6 — Apply autonomous labels

Call `apply_proposed_labels` once with the chosen `type:*`,
`priority:*`, and `effort:*` from step 3. If you couldn't decide
`priority:*` or `effort:*` in step 2 (info missing), apply only the
`type:*` you can justify.

The tool will:

- Reject any label outside `type:*` / `priority:*` / `effort:*` (Zod).
- Skip labels that don't exist in the repo (no 422 from GitHub).
- Dedupe against existing labels on the issue (idempotent re-runs).
- Report what was applied, what was already on the issue, and what
  was unknown — surface that in the **Classification** section of the
  comment if anything was skipped.

## Step 7 — Post exactly one triage comment

Body shape, in order:

```markdown
## Summary

<one or two sentences of what the issue is asking>

## Classification

- **type:** `<label>` — <one-line reason>
- **priority:** `<label>` — <one-line reason>
- **effort:** `<label>` — <one-line reason>

<if any label was skipped by `apply_proposed_labels` (unknown in repo), list it here>

## Dedupe

- <relative link 1> — <one-line note on relevance>
- <relative link 2> — <one-line note on relevance>
- <relative link 3> — <one-line note on relevance>

<if none, write "No strong matches in open or recently-closed issues.">

## Info request

<only if status is `needs-info`; concrete asks, one per line>

## Proposed status

`<status: ready | status: needs-info | status: blocked | out of scope — flag for tech-lead>`

<reasoning in one or two sentences; if `blocked`, link the blocker; if `effort: l`, propose a split>
```

Then **stop**. Do not follow up with clarifications, do not post
"ping", do not re-comment when the issue is updated — a re-triage
happens via the `status: triage` label dispatch path.

---

## What you do not do (re-stated from `instructions.md`)

- Do not call `ctx.github.request()` to mutate issue state.
- Do not edit issue bodies.
- Do not close, reopen, lock, assign, or set milestones.
- Do not post more than one comment per turn.
- Do not invent labels.
- Do not skip the dedupe step.
- Do not apply `status:*` via `apply_proposed_labels` — the tool will
  reject it, and rightly so.