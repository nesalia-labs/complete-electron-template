---
description: The full type:/status:/priority:/effort: label catalog for this repo, with when-to-apply examples grounded in complete-electron-template. The single source of label truth — the agent must mirror `CLAUDE.md` § "Issue Labels" verbatim and never invent labels.
---

# Label Taxonomy

This skill is a mirror of the canonical taxonomy in `CLAUDE.md` §
"Issue Labels". **The agent applies only labels defined here.** Labels
not in this file no-op silently when fed to `apply_proposed_labels` (the
tool skips names that don't exist in the repo), and a label invented out
of thin air misroutes work. If you need a new label, propose it in the
triage comment as a separate item and let a maintainer create it.

The three namespaces marked **Autonomous** below are the only ones
`apply_proposed_labels` will accept. Everything else — most importantly
all of `status:*` — is propose-only via `post_triage_comment`.

---

## `type:*` — what kind of work is this? (Autonomous)

| Label | Apply when |
| --- | --- |
| `type: bug` | Reproducible defect — a runtime crash, wrong output, broken build, regression. Examples: Electron main process throws on second-instance launch; oRPC procedure returns stale data after a Drizzle migration; TanStack Router hydration mismatch on a deep link. |
| `type: feature` | New user-facing capability or behavior that didn't exist before. Examples: a settings panel section, a new IPC channel, a new oRPC procedure, support for a new file type in the file viewer. |
| `type: refactor` | Restructure code without changing observable behavior. Examples: extract a shared Zod schema, move a piece of logic out of `apps/desktop/src/main/index.ts`, rename a Drizzle column with a back-compat alias. |
| `type: docs` | Documentation only — README, ADRs in `docs/internal/`, inline JSDoc, i18n locale files. Examples: clarify the IPC contract, fix a broken link in `README.md`, translate a missing string. |
| `type: security` | Anything touching the security boundary — CSP, IPC allowlist, Electron `webPreferences`, context isolation, secret storage, supply chain (dependency CVEs). Always paired with `priority: p0` or `p1`. |

## `status:*` — where is this in the workflow? (Propose-only)

You **never** apply these directly. Propose one in the triage comment;
a human flips the label on the issue.

| Label | Apply when |
| --- | --- |
| `status: triage` | Not yet reviewed by tech-lead. This is the entry state for re-triage too — a human or another tool adds this label to summon the agent. |
| `status: needs-info` | Ticket is incomplete — repro steps, logs, version, screenshots, or scope are missing. The triage comment asks for what. |
| `status: ready` | Validated by tech-lead, ready to pick up. The agent proposes this when classification, dedupe, and info-completeness all check out. |
| `status: in-progress` | Currently being worked on. Apply before opening a branch; remove when the PR merges or the work is dropped. |
| `status: in-review` | A PR is open and in review. Move from `in-progress` when the first review is requested. |
| `status: blocked` | Blocked by a dependency, decision, or external event. Always include the reason in a comment. The agent also proposes this for duplicates, with a link to the original. |

## `priority:*` — how urgent? (Autonomous)

| Label | Apply when |
| --- | --- |
| `p0: critical` | Production down, data loss, security exposure, blocked release. Stop everything and fix now. Examples: Electron renderer can execute arbitrary code via an unguarded IPC channel; Drizzle migration corrupts `global.db`; an oRPC procedure throws on every call. |
| `p1: high` | Required for the next release. Examples: a broken build on `dev`, a documented feature not working on one of the three target platforms (macOS / Windows / Linux), a missing locale blocking a translation milestone. |
| `p2: medium` | Normal priority. The default for valid issues that are correctly scoped but not release-blocking. |
| `p3: low` | Nice to have. Polish, nice ergonomics, doc typos, refactors with no behavioral payoff. |

## `effort:*` — how big is the work? (Autonomous, optional)

| Label | Apply when |
| --- | --- |
| `effort: xs` | A few minutes. Typo fix, missing i18n string, one-line guard, label rename. |
| `effort: s` | Half a day. A single-file change, a new shadcn primitive, a new Zod field on an existing oRPC procedure. |
| `effort: m` | 1–2 days. A new IPC channel end-to-end (preload + main + oRPC + UI), a Drizzle migration + adapter, a new settings panel section. |
| `effort: l` | A week or more, needs breakdown. Examples: SSR migration, multi-target desktop packaging, adopting a new ORM. Always pair with a proposed split into sub-issues in the triage comment. |

---

## Combination rules

- `type: security` **always** pairs with `priority: p0` or `priority: p1`.
- `effort: l` should always be paired with a proposed split in the
  triage comment (the agent flags this even though it can't apply
  `status:*`).
- `status: blocked` (propose-only) is the agent's signal for a duplicate
  — always include a link to the original issue or PR.

## Anti-patterns

- Inventing a label. If it's not in the table above, don't propose it.
- Applying `status:*` via `apply_proposed_labels`. The tool will reject
  it — that's the hard gate, not a suggestion.
- Pairing `type: refactor` with `priority: p0`. Refactors are not
  emergencies; if a refactor is blocking, the underlying incident is
  the issue, not the cleanup.
- Skipping `type:*` and going straight to `priority:*`. Always classify
  the *kind* of work first.