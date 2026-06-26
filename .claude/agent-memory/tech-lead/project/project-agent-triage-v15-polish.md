---
name: project-agent-triage-v15-polish
description: Known v1.5 polish items for the issue-triage eve agent. Deferred from v1 because they require either framework API additions or behavior the deployed model handles differently than expected.
metadata:
  type: project
---

Items the v1 issue-triage agent (in `agent/`) deliberately deferred. Each entry has: symptom, root cause, and the v1.5 fix.

## 1. Double-comment behavior on every triage — **RESOLVED 2026-06-26 via PR #31**

**Symptom** (observed on issues #22 and #30, 2026-06-24 and 2026-06-26): agent posts two comments per triage — the structured comment per `triage-workflow.md`, plus a 1–2 sentence "Triage complete for issue #N" wrap-up a few seconds later.

**Root cause:** the model (MiniMax M3) decides unprompted to add a confirmation summary in addition to the structured comment. eve's framework doesn't deduplicate or prevent this. `instructions.md` said "exactly one triage comment per turn" but prose-only rules are unreliable against a model that wants to summarize.

**v1.5 fix (landed in PR #31, 2026-06-26) — two reinforcing controls:**

1. **Model-side (primary):** `agent/instructions.md` now declares a `### HARD RULE: One triage comment per turn` subsection inside the Authority model block. Includes the verbatim #30 anti-example, a `Forbidden phrases` list ("Triage complete", "Done", "Recap", "Acknowledged", "Labels applied", "Summary: I just…"), and the v2 marker contract.

2. **Deploy-side (safety net):** `agent/channels/github.ts` adds a `turn.completed` event handler that auto-deletes any recap comment posted within `RECAP_WINDOW_SECONDS = 120` of the structured triage comment. The hook reuses `channel.github.request`, identifies the bot's structured comment by the `<!-- bot:marty-action triage:v2 -->` marker, and DELETEs any other bot-authored comment in the window. All errors logged, never thrown. The 4 existing event handlers (`turn.started`, `message.completed`, `session.failed`, `turn.failed`) are untouched.

3. **Regression eval:** `agent/evals/cases/022-no-double-comment.eval.ts` asserts `post_triage_comment` was called EXACTLY ONCE (`times: 1`, body carrying the v2 marker), plus the labels `type: bug`, `p3: low`, `effort: xs` applied. Fixture uses #30's body verbatim.

**Caveat — eval gate not currently validating:** The eval-agent.yml CI workflow has never passed in repo history (see [[project-eval-agent-workflow-broken]]). Case 022's regression coverage is structural — manually verified, not CI-validated. Fix the CI workflow separately; the eval will then gate automatically.

**Caveat — 404 trigger chain not closed:** The 404-on-unpushed-doc-link nudge that triggered #30's double-comment is still possible. See [[feedback-issue-body-file-references]] — reporter-side hygiene, not bot-side. The hook now defends against the symptom regardless of trigger.

## 2. Re-triage trigger on `issues.labeled`

**Symptom:** when a maintainer adds `status: triage` to an existing issue, the agent doesn't re-triage. v1 only dispatches on `issue.action === "opened"`.

**Root cause:** in `eve@0.13.3`, the public `onIssue` signature only exposes `{ action, issueNumber, raw }` where `raw` is the issue sub-payload — the added label lives on the top-level webhook envelope, not surfaced to the channel hook. Reaching for it would require parsing undocumented payload shape.

**v1.5 fix candidates:**
- Wait for eve to expose the labeled-event payload explicitly
- If eve doesn't, use a `vercel.json` `routes` rule that filters only the labeled event with `status: triage` to a custom handler that wraps the GitHub event and calls `eve receive(github, ...)` manually

## 3. (Future) `@triage-bot` mention surface

**Symptom:** not yet observed — was deferred in the original v1 design (never built). Would let users summon re-triage by mentioning the bot in any comment, not just by adding a label.

**v1.5 fix:** add `onComment: (ctx, comment) => comment.body.includes('@triage-bot') ? { auth: defaultGitHubAuth(ctx) } : null` to `agent/channels/github.ts`. Requires eve's comment-event payload to expose the comment body (separate API gap from issue #2).

## Related

- `learnings/vercel-monorepo-subdirectory.md` — Vercel deploy-config gotcha resolved by PR #18
- PR #14 (`feat(agent): add eve issue-triage agent scaffold at repo root`) — original scaffold, includes the v1 design decisions
- PR #18 (`fix(agent): deploy from repo root`) — deploy-config fix
- PR #19 (`feat(agent): switch model to MiniMax M3`) — model swap
- PR #31 (`fix(agent): kill double-comment anti-pattern via deploy-side hook + hardened instructions`) — item #1 resolution
- [[deploy-side-recap-hook]] — the precedent for escalating prose rules to deploy-side hooks
- [[project-eval-agent-workflow-broken]] — why case 022 isn't currently CI-validated