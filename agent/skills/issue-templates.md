---
description: "Reference for GitHub YAML issue forms in `.github/ISSUE_TEMPLATE/` and the `list_issue_templates` tool — teaches the model how to validate an incoming issue body against a template's `required: true` fields. Load this in triage-workflow Step 2 before falling back to the v1 heuristic info-completeness check."
---

# Issue Templates

This repo declares its issue intake surface via GitHub issue forms in
`.github/ISSUE_TEMPLATE/`. A well-formed template tells the agent what
a *complete* issue looks like, so the model can ask for what is
missing instead of guessing. The skill is a reference for both the
YAML schema and the model-facing tool that exposes it.

---

## YAML issue form schema (quick reference)

A form file in `.github/ISSUE_TEMPLATE/` is a single YAML document
with this shape:

```yaml
name: "Bug Report"
description: "What the form is for"
title: "[BUG] "                        # prefix applied to new issues
labels: ["type: bug", "status: triage"] # auto-applied labels

body:
  - type: markdown                     # prose; user does not fill out
    attributes:
      value: |
        Prose the user reads.

  - id: bug_description                # unique machine id (required)
    type: textarea                     # input | textarea | dropdown | checkboxes
    attributes:
      label: "Bug Description"
      description: "Helper text under the label"
      placeholder: "Freeform hint…"
      options:                         # dropdown / checkboxes only
        - label: "Option A"
    validations:
      required: true                   # load-bearing flag for this skill
```

Field types and validation:

| Type | Renders | `required: true` blocks submit? |
|---|---|---|
| `markdown` | prose block | no (user doesn't fill out) |
| `input` | single-line text | yes |
| `textarea` | multi-line text | yes |
| `dropdown` | single- or multi-select | yes |
| `checkboxes` | multi-select boxes | yes |

`config.yml` (the issue chooser config) is **not** a template —
`list_issue_templates` filters it out by name.

Upstream reference: <https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms>.

---

## How to use `list_issue_templates`

Call signature:

```ts
list_issue_templates({ owner: string, repo: string })
```

Autonomous (`needsApproval: never()`). Idempotent — safe to call once
per turn in Step 2.

### Return shape

```ts
{
  templates: Array<{
    name: string;              // e.g. "Bug Report"
    description: string;
    title?: string;            // e.g. "[BUG] " — applied to issue title
    labels?: string[];         // auto-applied on submit
    fields: Array<{
      id: string;
      type: 'markdown' | 'input' | 'textarea' | 'dropdown' | 'checkboxes';
      label: string;           // label the user sees
      required: boolean;       // mirrors validations.required
    }>;
  }>;
  skipped?: Array<{ name: string; error: string }>;
  error?: string;
}
```

If `.github/ISSUE_TEMPLATE/` does not exist (HTTP 404) the tool
returns `{ templates: [] }` — that is the **empty-array contract**,
not an error. Treat empty as "no template validation possible" and
fall back to the v1 heuristic info-completeness check from
`triage-workflow.md` Step 2.

### Matching the issue to a template

GitHub exposes no API for "which template was this issue filed
under" once the issue is open. Match heuristically, in order:

1. **Title prefix (preferred).** Compare the issue title to each
   template's `title` prefix, case-insensitive, after normalizing
   `[`, `]`, `:`, whitespace, underscores, hyphens. This repo's
   conventions:
   - `"[BUG] settings panel crashes"`     → `bug_report.yml`
   - `"[Feature]: dark mode"`             → `feature_request.yml`
   - `"[Docs]: clarify IPC contract"`     → `docs_request.yml`
   - `"[Refactor]: split app-settings.ts"`→ `refactor_request.yml`
   - `"Triage weekly cadence"`            → `task.yml` (no prefix)
2. **Label match.** If the issue already has a `type:*` label that
   lines up with a template's `labels[]`, use that template.
3. **Body section match.** Scan for distinctive section headers from
   a template's `markdown` blocks ("Bug Description", "Problem
   Statement", etc.).
4. **No match.** Fall back to the v1 heuristic check. Do not invent
   a template.

If the title prefix points to one template but the body matches
another, flag the mismatch in `Classification` but do not fail
triage. The model can flag; only humans act on it.

### Validating the body against a matched template

For each `required: true` field, check whether the issue body covers
it. Heuristics per type:

- `textarea` / `input` → section header that contains the field's
  `label` (case-insensitive substring), or the field's `id` as a
  header, or substantive prose under such a header.
- `dropdown` → one of the option `label`s, or the field's `label`
  followed by a value.
- `checkboxes` → a `[x]` near the field's `label`.
- `markdown` → skip; markdown blocks are prose, not validated.

If any required field appears missing, that is an `Info request`.
List each missing field by `id`. If every required field is covered,
the body is template-complete — do not invent missing fields the user
has not asked for.

### What to do with the result

The v1 comment shape (Summary / Classification / Dedupe / Info
request / Proposed status) absorbs template validation in two places:

- **`Info request`** *(only when at least one required field is
  missing)* becomes a per-field checklist:

  ```markdown
  ## Info request

  Template `bug_report.yml` is missing required fields:

  - `bug_description` — section not found in body
  - `repro_steps` — header present but content is empty
  - `expected_behavior` — section not found in body
  ```

- **`Summary`** *(optional)* may mention compliance in passing:
  "Filed under `bug_report.yml`; template-complete." Terse; not the
  headline.

If the title-prefix / body-section match disagrees, surface the
mismatch in `Classification` as a one-liner. Do not block.

---

## When NOT to validate templates

- **Repo has no `.github/ISSUE_TEMPLATE/`.** Tool returns
  `{ templates: [] }`. Fall back to the v1 heuristic. Do not
  fabricate missing fields.
- **Matched template has no `required: true` fields.** Treat as
  template-complete by construction.
- **Duplicate (Step 4 hit).** Skip — duplicates don't need polish.
- **Out of scope / spam (Step 5).** Skip.

---

## Anti-patterns

- **Inventing required fields.** If `list_issue_templates` returns
  no templates, do not pretend a standard set exists. The v1
  heuristic is the fallback; it has no authority to invent.
- **Demanding more than the template demands.** `required: false` is
  optional. Suggest filling it in; do not gate triage on it.
- **Treating the title prefix as ground truth.** A user can edit the
  title after submitting. If the body clearly matches a different
  template, follow the body — flag the mismatch, do not block.
- **Reciting the template in the comment.** Say "section X is
  missing", not paste the whole template back.