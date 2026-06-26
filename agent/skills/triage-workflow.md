---
description: The decision flow for classifying a new or re-triaged issue — read, check info, classify, dedupe, decide proposed status, apply autonomous labels, post or edit the pinned triage comment, evaluate content quality. Load this first on every turn.
---

# Triage Workflow

A linear procedure. Do not skip steps. There is **one** triage comment
per issue, lifetime — created on the first turn, edited in place on
every subsequent turn. The comment is the entire deliverable of a
turn; autonomous labels are a side effect, never the headline.

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

Two paths, in order. The template-validation path is preferred when
the repo declares issue forms; the heuristic path is the v1
fallback and is preserved unchanged.

### 2a — Template validation (preferred when templates exist)

1. Call `list_issue_templates({ owner, repo })` to load
   `.github/ISSUE_TEMPLATE/`. The tool returns `{ templates: [] }` if
   the directory is absent — that is not an error, proceed to **2b**.
2. Load the `issue-templates` skill for the matching heuristic and
   field-validation rules.
3. Match the issue title to a template (title prefix → labels → body
   section headers; see the skill). If no template matches, proceed
   to **2b**.
4. For each `required: true` field on the matched template, check
   whether the issue body covers it. If **any** required field is
   missing, that's an `Info request` — list each missing field by
   `id` in the comment. Apply only the `type:*` you can justify from
   the title alone; do not apply `priority:*` or `effort:*` until the
   scope is pinned down. Continue to **Step 3** once you have a
   template-validated body.

### 2b — Heuristic fallback (v1 behavior, preserved)

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

## Step 7 — Post or edit the pinned triage comment

There is exactly **one** triage comment per issue, lifetime. On the
first turn you POST it; on every subsequent turn you PATCH (edit) it
in place. The `post_triage_comment` tool handles both — pass
`commentId` to edit, omit it to create.

### 7a — Locate any existing triage comment

**Before posting or editing**, call
`find_existing_triage_comment({ owner, repo, issueNumber })`. The
tool searches the issue's comments for the `<!-- bot:marty-action
triage:v2 -->` marker and returns either the existing `commentId`
or `null`.

- **`commentId` returned** → this is a re-triage. Call
  `post_triage_comment` with that `commentId` to PATCH. Build the
  body fresh from the current turn's analysis, including a `## History`
  section (see 7c) that covers this turn.
- **`null` returned** → this is the first triage. Call
  `post_triage_comment` **without** `commentId` to POST. No
  `## History` section on the first turn.

The `post_triage_comment` tool stamps the marker into the body
itself, so you do not need to (and must not) include it manually.
Do not post a fresh comment when an existing one was found — that
re-creates the v1 double-comment bug.

### 7b — Compose the body

Body shape, in order. Optional sections are omitted (not rendered
empty) when not applicable.

```markdown
## Summary

<one or two sentences of what the issue is asking>

## Classification

- **type:** `<label>` — <one-line reason>
- **priority:** `<label>` — <one-line reason>
- **effort:** `<label>` — <one-line reason>
- **proposed status:** `<status: ready | status: needs-info | status: blocked | out of scope>` — <one-line reason>

<if any label was skipped by `apply_proposed_labels` (unknown in repo), list it here>

## Quality notes

<bulleted quality assessment from Step 8; ✅/⚠️/📋 markers; omit the section entirely if there is nothing to flag>

## Template compliance

<only when `list_issue_templates` returned templates; which template matched and which `required: true` fields are satisfied vs missing; omit entirely if no templates were found>

## Code context (files referenced)

<only if the model actually read files via `request_repo_info` or any sandbox tool during this turn; bulleted list of `path:line — note`; omit the section entirely if nothing was read>

## Dedupe

- <relative link 1> — <one-line note on relevance>
- <relative link 2> — <one-line note on relevance>
- <relative link 3> — <one-line note on relevance>

<if none, write "No strong matches in open or recently-closed issues.">

## Info request

<only if status is `needs-info`; concrete asks, one per line>

## History

<only on turns after the first; see 7c for table format and footer>
```

The `## Proposed status` line lives inside Classification in v2 (it
was a top-level section in v1). The order above is the order it
must appear in.

### 7c — History table (turn 2 and later)

When you PATCH an existing comment, include a `## History` section
listing every turn that has touched this issue, oldest first. The
table replaces whatever `## History` block was on the previous
comment — do not append to it; do not preserve stale rows. The
columns are:

```
| # | When | Change |
|---|------|--------|
| 1 | <ISO 8601 timestamp> | Initial triage (opened) — <one-line summary of what was decided> |
| 2 | <ISO 8601 timestamp> | Re-triage (<event action>, e.g. `labeled` / `edited`) — <one-line summary of what changed> |
…
```

- The `#` column is the turn index, starting at 1.
- `When` is an ISO 8601 timestamp (UTC) — use the `updated_at` of
  the most recent state-bearing event, or `now` if you do not have
  one. `Z` suffix is fine; timezone offset is fine.
- `Change` is one line, terse, specific. Cite the trigger event
  (`opened` / `labeled: status:*` / `edited` etc.) and the
  outcome (no change / labels updated / re-classified / etc.).

After the table, on its own line, add the footer (same text on
every turn — it identifies the bot):

```
_Generated by marty-action · [feedback](https://github.com/nesalia-labs/complete-electron-template/issues/new)_
```

The first turn does **not** include a `## History` section; the
history begins on the second turn. From the second turn onward,
the section is always present, even if the change for that turn
is "no change" — silence in the timeline is worse than an explicit
"no change" row.

### 7d — Stop

Then **stop**. Do not follow up with clarifications, do not post
"ping". Subsequent reviews arrive through the channel's dispatch
path; each one re-enters this workflow at Step 1 and the
`find_existing_triage_comment` + PATCH flow above keeps the comment
single and up to date. If the model violates this rule, the
dispatcher's `turn.completed` hook (see `channels/github.ts`)
auto-deletes the offending comment(s). The hook is a safety net; the
primary defense is the HARD RULE in `instructions.md`.

---

## Step 8 — Evaluate content quality

After classifying, before composing the body, evaluate the issue
itself for content quality. This is a v2 addition (v1 was
classification-only). The findings land in the `## Quality notes`
section of the pinned comment (see Step 7b).

Evaluate on the criteria below. Use the ✅/⚠️/📋 markers, with
a short specific note after each:

- **Repro / environment.** For bugs: are repro steps present? OS
  + Electron version, branch / commit, logs, screenshots? Mark
  ✅ if all the relevant ones are there; ⚠️ for each missing
  one (with the specific field name); 📋 for a suggested
  improvement when something is there but unclear.
- **Expected vs actual.** For bugs: does the issue distinguish
  "what you expected" from "what happened"? ⚠️ if only one side
  is present.
- **Acceptance criterion.** For features: is the desired
  outcome described concretely, or is it "would be nice if…"
  prose? 📋 for vague ones with a concrete restatement.
- **Scope clarity.** For refactors: is the proposed scope
  bounded (files / modules / interfaces) or is it open-ended?
  ⚠️ for open-ended scope.
- **Issue body quality generally.** Typos, missing
  punctuation, walls of text, no code blocks where code would
  help — flag one or two with 📋 if egregious, ignore
  otherwise. Do not nitpick prose.

Tone: **terse, specific, actionable.** No preamble. No "great
issue, thanks for reporting!" filler. One bullet per finding.

Do not fabricate issues. If the issue is well-written, the
section is empty (or omitted entirely). A good triage comment
with no quality notes is fine.

On a re-triage turn, only flag **new** quality findings — the
`## History` row from the previous turn already records the
prior state. If everything is still as it was, the section can
be omitted.

---

## What you do not do (re-stated from `instructions.md`)

- Do not call `ctx.github.request()` to mutate issue state.
- Do not edit issue bodies.
- Do not close, reopen, lock, assign, or set milestones.
- Do not post more than one triage comment per issue — use
  edit-in-place on subsequent turns. The
  `find_existing_triage_comment` + `post_triage_comment` (with
  `commentId`) flow handles subsequent turns; do not post a
  fresh comment when a previous one exists.
- Do not invent labels.
- Do not skip the dedupe step.
- Do not apply `status:*` via `apply_proposed_labels` — the tool will
  reject it, and rightly so.
- Do not include the `<!-- bot:marty-action triage:v2 -->` marker
  in the body you compose. `post_triage_comment` injects it
  automatically; including it twice makes the comment render a
  visible duplicate.