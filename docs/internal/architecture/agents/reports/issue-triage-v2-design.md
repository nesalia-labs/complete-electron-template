# Issue Triage Agent — v2 Design

**Date:** 2026-06-24
**Status:** Draft
**Owner:** Tech Lead
**Related code:** `agent/`, `apps/web/src/routes/`, `packages/db/`

---

## Context

The v1 issue-triage agent is live: deployed at `complete-electron-template-agent.vercel.app`, driven by the eve framework, powered by MiniMax M3 via BYOC, and receiving GitHub webhooks successfully (verified end-to-end with issue #22 on 2026-06-24).

v1 dispatches on `opened` only, posts a single triage comment, and applies `type:*` / `priority:*` / `effort:*` labels autonomously. It works, but it is **event-frozen**: any update to an existing issue is silently ignored. The agent also does not engage with the issue content beyond classification — there is no critique, no template-compliance check, and no proactive code investigation (the sandbox checkout is explicitly skipped in `agent/channels/github.ts`, so v1 has no full-repo access).

v2 builds on v1 to address these gaps.

## Goals

1. **Stateful re-triage.** When an issue is edited, the agent re-reviews it taking into account its previous triage history. Material changes (new repro info, code blocks, file paths) trigger re-evaluation; trivial edits (whitespace, typos) do not.
2. **Issue content critique.** Beyond classifying, the agent evaluates whether the issue is well-formed and suggests improvements. Goes into a "Quality notes" section of the comment.
3. **Template compliance.** The agent loads `.github/ISSUE_TEMPLATE/` and verifies the issue against its template's required fields, flagging missing fields.
4. **Proactive code digging.** When the issue mentions file paths, function names, or error messages, the agent fetches the relevant code before classifying. Requires the v2 sandbox checkout (Decision 4) so the model can `bash`/`grep`/`read_file` against the cloned repo, not just `request_repo_info` against single files.
5. **Single pinned comment per issue.** Lifetime one comment, edited in place, with an internal history table. Eliminates the v1 "double-comment" issue (v1.5 polish #1) by construction.

## Non-goals

- **PR triage.** Explicitly out of scope for v2. PR triage is a v2.5+ conversation.
- **Cross-repo support.** v2 assumes single-repo. Multi-repo is a deployment-config question, not an agent design question, and the GitHub App can already be installed on multiple repos.
- **Slack/Discord mirror.** Cross-platform notifications are an integration question, deferred to v3+.
- **Real-time collaboration** with the user (e.g., back-and-forth Q&A in the issue thread). v2 is one-shot per event.

## Requirements (user-stated, 2026-06-24)

> "Add labels, comment, and when an issue is updated, do a new review taking into account what was done before. I'd also like it to critique the content of the issue, so potentially dig into the code directly. Not PR triage yet. It must also respect `.github/ISSUE_TEMPLATE`."

The above maps to Goals 1–5.

## Architectural decisions

### Decision 1 — State backend: Turso (libSQL over HTTP)

**Recommendation:** Turso. Free tier is 5GB storage + 500M rows read/month + 10M rows written/month, 100 databases max. SQL is the right shape for our state. (Developer tier at $4.99/mo bumps storage to 9GB if needed.)

**Why not Vercel KV:** Vercel KV was deprecated in December 2024 and replaced by Upstash Redis via Marketplace. Don't build on what doesn't exist.

**Why not Upstash Redis:** Our state is naturally relational (`triage_history` rows keyed by issue). Free tier is 500K commands/month total (not per day) — tight at scale. Schema migrations are real (v2.5 will add columns). Redis key-value forces all query logic into the application layer.

**Why Turso:**
- SQL queries are trivial in Turso, painful in KV (`SELECT * FROM triage_history WHERE issue_number = ? AND turn_id = ?`)
- Schema migrations are first-class (real SQL)
- Generous free tier (more than enough for our write rate)
- Vercel integration is well-supported via `@tursodatabase/serverless` (uses `fetch` only, zero native deps)
- ORM-compatible (Drizzle, Prisma) — and we already use Drizzle in `packages/db/`, so the team has prior expertise

**Setup:**
- `npm i @tursodatabase/serverless @libsql/client` in `agent/`
- Two env vars on Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- **Schema migrations: use Drizzle ORM** (already in the monorepo via `packages/db/`). Migrations applied at agent startup via Drizzle Kit. This gives us parity with the Electron app's existing DB layer.

### Decision 2 — Re-triage trigger: `edited` + `labeled` (status:* only), with material-change heuristic

**Recommendation:** Subscribe to two events. `edited` triggers re-triage if a material change happened. `labeled` triggers re-triage only when the new label is `status:*` (a maintainer is signaling a state change).

**Event matrix:**

| GitHub event | Triggers re-triage? | Why |
|---|---|---|
| `opened` | ✅ | v1 behavior, this is the core path |
| `edited` (body or title) | ✅ if material change | User added info → re-evaluate quality + labels |
| `labeled` with `status:*` | ✅ | Maintainer flipped state → re-evaluate if labels still match |
| `labeled` with non-`status:*` | ❌ | Adding `type: bug` doesn't change content; nothing to triage |
| `reopened` | ✅ | Treated like a new issue with history |
| `closed` | ❌ (trigger state purge) | Issue is closed; nothing to triage — see retention policy |
| `transferred` | ❌ (trigger state purge) | Issue moved to another repo; delete state for old repo |
| `assigned` / `milestoned` | ❌ | Outside triage scope |
| Comment created | ❌ in v2 (✅ in v2.5 with `@triage-bot` mention) | v1.5 polish #3 |

**Material-change heuristic** for `edited` (ship defaults, tune in production):
- Body length delta > 20% **OR**
- New code blocks added (```...``` count increased) **OR**
- New file paths mentioned (heuristic on `*` paths in code-style spans) **OR**
- Existing labels on the issue changed (excluding `status:*`)

If none hold, the agent silently records the event in state and exits without turning the model. The 20% threshold is a **starting default** — maintainers can override via `material_threshold` in `.github/triage.yml`, and we'll tune based on production data after a few weeks.

**Configurability:** a `.github/triage.yml` config file in the target repo (per the probot pattern) lets maintainers opt out of any trigger, adjust the material-change threshold, or override labels. Read by the agent at startup and **reloaded every 5 minutes** (configurable via `TRIAGE_CONFIG_RELOAD_INTERVAL_MS` env var). Reload is debounced — if the file mtime changed, the agent picks up the new config on the next turn; otherwise it uses the cached copy.

**GitHub App setup note:** the existing GitHub App already has `Issues: Read & write` permission and subscribes to the `Issues` event — which GitHub docs confirm covers **all** issue actions (`opened`, `edited`, `closed`, `reopened`, `labeled`, `unlabeled`, `assigned`, `transferred`, etc.) under a single subscription. **No new GitHub App permissions or event subscriptions are needed for v2.** The webhook just needs to keep firing (which it already does).

**State retention:** the `issue_triage_state` table is purged under two conditions:
1. **On `closed` event:** immediately delete the issue's state rows. The issue is done; no future re-triage possible.
2. **On `transferred` event:** immediately delete the issue's state rows for the old repo (the issue moves to a new repo; its state there is meaningless for us).
3. **TTL:** rows older than 365 days are purged by a scheduled sweep (`eve/schedules`). Configurable via `TRIAGE_STATE_RETENTION_DAYS` env var.

The event-driven purges are the primary mechanism — TTL is a safety net for orphaned rows (e.g., issue transferred without the webhook reaching us).

### Decision 3 — Comment strategy: edit-in-place pinned comment

**Recommendation:** One comment per issue, lifetime. Edit via `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}` on subsequent reviews. Pattern matches Dependabot, Renovate, probot/stale — established long-lived bot convention.

**Comment shape:**

```markdown
<!-- bot:marty-action triage:v2 -->

## Triage

_Last updated: 2026-06-24T14:22Z · turn #3_

### Latest classification

- **type:** `bug`
- **priority:** `p1: high`
- **effort:** `s`
- **proposed status:** `ready`

### Quality notes

- ✅ Repro steps clear
- ⚠️ Missing: Electron version, OS version
- 📋 Suggested addition: expected vs actual behavior

### Template compliance

- ✅ `bug_report.md` template followed
- ⚠️ Section "Expected behavior" is empty

### Code context (files referenced)

- `apps/desktop/src/main/index.ts:42` — matches issue description

### History

| # | When | Change |
|---|------|--------|
| 1 | 2026-06-24T13:53Z | Initial triage (opened) |
| 2 | 2026-06-24T14:22Z | User added repro steps → re-evaluated, no label changes |

---

_Generated by [`marty-action`](https://github.com/nesalia-labs/complete-electron-template) · [feedback](https://github.com/nesalia-labs/complete-electron-template/issues/new)_
```

**Why this beats "post new comments":**
- Fixes the v1 "double-comment" issue by construction — there is only ever one comment per issue
- Issue timeline is not spammed with N triage updates
- History table makes "what changed" answerable without reading all comments
- Comment edit is cheap (single PATCH), no thread pollution

### Decision 4 — Sandbox checkout (re-enable the repo clone on every turn)

The eve framework has **built-in sandbox checkout**: at the start of every turn, the relevant git ref is cloned into the Vercel Sandbox microVM, exposing `bash`, `read_file`, `glob`, `grep`, and `write_file` tools to the model.

**v1 explicitly disables this.** `agent/channels/github.ts` has an `events: { "turn.started" }` override that skips the default sandbox checkout, with this comment:

> "This agent triages purely from the issue body in context plus targeted `request_repo_info` calls; we have no sandbox tools loaded, so the checkout is pure cost."

For v2 P4 (enhanced code digging), we need full repo access. `request_repo_info` alone (bounded to ~100 lines, 8 paths per call) cannot answer questions like "find all callers of this function" or "grep for pattern X across the repo".

**Action (lands in P4):**

1. Remove or modify the `turn.started` override so the default sandbox checkout runs. Our handler should still post the eyes reaction but not suppress the default flow — the framework runs the checkout after our handler completes.
2. Verify the agent's tool config doesn't explicitly exclude the standard sandbox tools (`bash`, `read_file`, `glob`, `grep`, `write_file`). They should be exposed automatically by `defaultBackend()` returning Vercel Sandbox.
3. Update `agent/instructions.md` — replace the "no sandbox configured" line with new guidance telling the model when to use sandbox tools vs `request_repo_info`.

**Cost:** the sandbox template is already prewarmed at every build (visible in build log: `eve: initializing 1 sandbox template...`). Re-enabling checkout adds **per-turn runtime cost** on Vercel Sandbox (microVM spin-up, ~2s cold, instant warm). Modest at low volume; scales linearly with turns. Free tier covers initial usage; pay-as-you-go at scale.

**When to use sandbox vs `request_repo_info`:**

| | `request_repo_info` | Sandbox tools (`bash`, `read_file`, `glob`, `grep`) |
|---|---|---|
| Backing API | GitHub Contents API | Vercel Sandbox microVM with cloned repo |
| Speed | Fast (HTTP) | Slower (cold ~2s) |
| Cost | Free (GitHub API quota) | Per-execution (sandbox runtime) |
| Scope | Single file, ≤100 lines, ≤8 paths/call | Whole repo, any depth, any tool |
| Best for | "What's in this one file?" | "Find all callers of this function" / "grep for pattern X" / "what changed in this PR" |

The model should reach for `request_repo_info` first (cheap, fast) and only escalate to sandbox tools when it needs to traverse the repo.

**Security note:** the sandbox runs with the GitHub App installation token but cannot exfiltrate via outbound network beyond the API calls the agent explicitly makes. The repo is checked out read-only by default; `write_file` would be a deliberate agent choice, not a default. We may want to disable `write_file` entirely for v2 and only enable it in v3+ if we add code-modification workflows.

## State shape

Turso schema (`agent/db/schema.sql`):

```sql
CREATE TABLE issue_triage_state (
  issue_number   INTEGER NOT NULL,
  repo           TEXT NOT NULL,
  turn_id        TEXT NOT NULL,
  created_at     INTEGER NOT NULL,         -- unix ms
  event_action   TEXT NOT NULL,            -- opened | edited | labeled | reopened
  body_hash      TEXT NOT NULL,            -- sha256 of issue body at this turn
  labels_applied TEXT NOT NULL,            -- JSON array of label names
  comment_id     INTEGER,                  -- GitHub comment id (null until first triage)
  comment_hash   TEXT,                     -- sha256 of comment body
  PRIMARY KEY (repo, issue_number, turn_id)
);

CREATE INDEX idx_state_issue ON issue_triage_state (repo, issue_number, created_at DESC);

CREATE TABLE triage_config (
  repo              TEXT PRIMARY KEY,
  config_yaml       TEXT NOT NULL,         -- raw `.github/triage.yml`
  triggers_enabled  TEXT NOT NULL,         -- JSON: { opened, edited, labeled }
  material_threshold REAL NOT NULL DEFAULT 0.2,
  loaded_at         INTEGER NOT NULL
);
```

The `issue_triage_state` table is the audit trail. The **latest row per (repo, issue_number)** is the current state; older rows are the history.

## Re-triage flow

```
GitHub webhook: issues.edited
       │
       ▼
POST /eve/v1/github
       │
       ▼
githubChannel().onIssue(ctx, issue) {
  if (issue.action === "opened") return dispatch(initialTriage);
  if (issue.action === "edited") {
    const last = await state.getLastTurn(repo, issue.number);
    const change = isMaterialChange(last.bodyHash, issue.body);
    if (!change) {
      await state.recordNoOpTurn(repo, issue.number, "edited");
      return null;  // silent
    }
    return dispatch(reTriage, { previousTurn: last });
  }
  if (issue.action === "labeled" && issue.label.name.startsWith("status:")) {
    return dispatch(reTriage, { previousTurn: await state.getLastTurn(...) });
  }
  // ...
}
       │
       ▼
eve framework: turn.started
  ├─ 1. channel.thread.react("eyes")       ← our existing override
  └─ 2. Sandbox checkout: clone repo ref  ← re-enabled in v2 (Decision 4)
       │
       ▼
Model turn: load previous triage, re-evaluate, decide on label diffs
       │
       ▼
Tools:
  - apply_proposed_labels (only the diff vs current labels)
  - edit_pinned_comment (update body, bump history row)
  - request_repo_info (cheap targeted reads via GitHub Contents API)
  - sandbox: bash, read_file, glob, grep (full repo traversal)
  - list_issue_templates + parse_template (for compliance check)
```

## Phasing

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| **P1 — Template loader** | New skill `agent/skills/issue-templates.md` + tool `list_issue_templates`. Extend `triage-workflow.md` step 2 to validate against loaded template. | 2-3 days | None |
| **P2 — Content critique + edit-in-place** | Extend `triage-workflow.md` with quality feedback step. Switch from `comments.create` to `comments.update` (edit pinned comment). History table inside the comment. | 2-3 days | Comment ID storage (state) — but we can start with in-memory ephemeral state for P2 and move to Turso in P3 |
| **P3 — Stateful re-triage** | Turso integration. Subscribe to `edited` + `labeled`. Material-change heuristic. Schema migrations applied at startup. `.github/triage.yml` config loader. | 4-5 days | P2 (we need edit-in-place before we can re-triage) |
| **P4 — Enhanced code digging (incl. sandbox re-enable)** | (a) Remove or modify the `turn.started` override in `agent/channels/github.ts` so the default sandbox checkout runs on every turn. (b) Update `agent/instructions.md` to teach the model when to use sandbox tools vs `request_repo_info`. (c) Add new tools: `grep_repo` (ripgrep-like), `list_dir`, `find_file_by_partial_path`. (d) Skill `agent/skills/codebase-context.md` documents the tool selection heuristic. | 3-4 days | P1 (template validation can suggest files) |
| **P5 — Tests + evals** | Fixture set of 20-30 historical issues with expected labels + comment rubric. `eve eval` in CI. Quality gate before merge. | 2-3 days | P1-P4 (evals test the whole flow) |

**Total: 12-17 days.** P1-P3 ship a complete v2. P4-P5 are quality and depth.

## Risks and open questions

### Risks

1. **Turso free tier limits** at 10M rows written/month. With state writes on every re-triage + comment edit, this is enough for ~50k turns/month before we hit the cap. If we hit it, the Developer tier ($4.99/mo) bumps the cap to a much larger pool. Turso blocks with `BLOCKED` errors on overflow — no silent truncation.
2. **Re-triage on every meaningful edit could become noisy** if the issue author is iterating. Mitigation: the history table in the comment is one entry per turn; the agent doesn't @-mention anyone, so no one gets pinged.
3. **The edit-in-place strategy means we lose `X-GitHub-Event` provenance in the comment timeline** — but we have it in the audit table.
4. **Vercel Sandbox runtime cost** scales linearly with turns once P4 lands. Low-volume OK on free tier; sustained high volume requires pay-as-you-go. Mitigation: `request_repo_info` handles most cases; sandbox is escalation only. Monitor turn counts in Agent Runs dashboard.
5. **Sandbox tool abuse surface** — the model has `bash` and `write_file` access. Disabling `write_file` for v2 (we don't modify code from triage) reduces risk. Sandbox network egress is restricted at the platform level but the model could still call APIs; the same `request_repo_info` tool discipline applies.

### Open questions

1. **Where do `eve eval` fixtures come from?** As of 2026-06-24, this repo has only 3 closed issues — all test/example ("another one", "other issue", "example issue") — none of which represent real triage scenarios. So Option B (pull from real repo history) is **not viable today**. Updated recommendation: **start with Option C (synthetic generation)** for the first eval suite — generate 20-30 issues across all 4 types (`bug`, `feature`, `refactor`, `docs`) with known good labels, ground-truth from the architecture docs (label-taxonomy.md, architecture-map.md). Once real issues accumulate in production (likely after a few weeks of v2 deployment), add an Option B evaluation suite from those. Hand-curation (Option A) is the fallback when neither synthetic nor real data is rich enough. — **Decision: start with Option C (synthetic), add Option B later.**
2. **Should the agent post a separate `Quality notes` comment** or fold into the pinned comment? — **Decision: fold into the pinned comment. Single source of truth per issue.**
3. **What happens on a label conflict** — if the model wants to apply `priority: p1: high` but `priority: p2: medium` is already applied (different model run, race condition)? — **Decision: take the highest priority of the two and post a note in the comment history. The model's intent overrides the stale label; the comment explains why.**
4. **Vercel Sandbox `deny-all` network policy** — does this block the agent from making LLM calls to MiniMax? **Decision: verify at P4 implementation time. Theory says no (LLM calls happen in the function runtime, not the sandbox), but confirm with a real test.** If it does block, scope the policy to outbound only (allow MiniMax endpoints).

## References

- v1 deployment: PR #18 (`docs/internal/architecture/agents/reports/` ← this doc describes what comes after)
- v1.5 polish items: `.claude/agent-memory/tech-lead/project/project-agent-triage-v15-polish.md`
- Vercel monorepo deploy config: `.claude/agent-memory/tech-lead/learnings/vercel-monorepo-subdirectory.md`
- Eve docs: `https://eve.dev/docs/channels/github`, `https://eve.dev/docs/guides/deployment`, `https://eve.dev/docs/sandbox`
- probot best practices: `https://probot.github.io/docs/best-practices/`
- GitHub Issues Comments API: `https://docs.github.com/en/rest/issues/comments` (PATCH for edit)
- GitHub App webhooks: `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps`
- GitHub issue form schema: `https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms`
- Turso + Vercel: `https://docs.turso.tech/integrations/vercel`
- Turso pricing: `https://turso.tech/pricing`
- Upstash Redis pricing: `https://upstash.com/pricing/redis`
- Renovate config pattern: `https://docs.renovatebot.com/configuration-options/`
- probot/stale (long-lived bot comment pattern reference): `https://github.com/probot/stale`

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-06-24 | Initial draft | User-stated requirements: stateful re-triage, content critique, template compliance, code digging, single pinned comment |
| 2026-06-24 | Sandbox checkout added (Decision 4) | Required for v2 P4 code digging — `request_repo_info` alone can't traverse the repo |
| 2026-06-24 | Turso numbers corrected (5GB / 500M read / 10M written, not 9GB / 5GB written) | Verified against turso.tech/pricing on 2026-06-24 |
| 2026-06-24 | Upstash numbers corrected (500K commands/mo, not 10K/day) | Verified against upstash.com/pricing/redis on 2026-06-24 |
| 2026-06-24 | P5 fixture source: synthetic generation first, real-issues second | Repo has only 3 closed test issues — no real historical data yet |
| 2026-06-24 | Added "no new GitHub App permissions needed for v2" note | Verified via GitHub docs: single `Issues` subscription covers all actions |
| 2026-06-24 | Scope: this repo only (no legacy Markdown template support) | User decision: minimize P1 scope |
| 2026-06-24 | State retention: TTL 365 days + immediate purge on `closed` / `transferred` events | Privacy (PII in issues), bounded storage growth |
| 2026-06-24 | Schema migrations: Drizzle ORM | Parity with `packages/db/`, monorepo consistency |
| 2026-06-24 | `.github/triage.yml` reload interval: 5 min default, env-var configurable | Standard cache TTL, debounced on mtime change |
| 2026-06-24 | Material-change threshold: 20% body delta default, tune in production via `.github/triage.yml` | Ship with sensible default, iterate |
| 2026-06-24 | Open questions resolved: synthetic fixtures first, fold quality into pinned comment, highest-priority-wins on label conflict, verify deny-all at P4 impl time | All answered |