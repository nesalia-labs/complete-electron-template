---
name: deploy-side-recap-hook
description: When prose rules in agent instructions get repeatedly violated by the model, escalate to a deploy-side hook (e.g. eve's turn.completed handler that auto-deletes offending comments). Precedent: PR #31, 2026-06-26.
metadata:
  type: feedback
---

# When prose rules aren't enough, enforce on the deploy side

**Rule:** If an agent's `instructions.md` has a prohibition that the model keeps violating across multiple incidents, **add a deploy-side enforcement mechanism** alongside any further prose tightening. The prose stays as the primary defense, but the hook is the safety net.

**Why:** On 2026-06-26, the issue-triage agent posted a second "Triage complete for issue #30…" recap comment 9 seconds after the structured triage comment, violating `triage-workflow.md` Step 7d. This was the **third** confirmed incident of the same anti-pattern (after #22 and an earlier example). The `instructions.md` already contained the prohibition in prose ("No follow-up comments. After the structured comment is posted, the turn ends.") and the model still violated it. The [[project-agent-triage-v15-polish]] memory entry had explicitly noted that prose-only rules are unreliable: "the model doesn't strictly follow that."

PR #31 fixed this with two reinforcing controls:

1. **Hardened prose** — moved the prohibition into a `### HARD RULE: One triage comment per turn` subsection inside the Authority model block, with the verbatim #30 anti-example and a `Forbidden phrases` list. The Authority model section is "locked — read carefully", so the rule now sits next to the other hard rules the model does follow.

2. **Deploy-side hook** — a `turn.completed` event handler in `agent/channels/github.ts` that auto-deletes any recap comment posted within `RECAP_WINDOW_SECONDS = 120` of the structured comment. The hook identifies the structured comment by the `<!-- bot:marty-action triage:v2 -->` marker (injected by `post_triage_comment`) and DELETEs any other bot-authored comment in the window. All errors logged, never thrown.

The hook is "purely additive" — it does NOT modify `turn.started`, `message.completed`, `session.failed`, or `turn.failed` handlers (those are built-in per `eve@0.13.3`'s channel config). It also doesn't need new tools, new dependencies, or DB lookups — owner/repo/issueNumber come from `channel.repository` + `channel.conversation` directly.

**How to apply:**

When you observe the model violating a `instructions.md` prohibition repeatedly (≥2 incidents):

1. Confirm the pattern — multiple incidents, same rule violated.
2. Tighten the prose anyway (move to Authority section, add anti-examples, add forbidden phrases). Even if the model keeps violating, the prose is still load-bearing for readers and reviewers.
3. **Then add a deploy-side enforcement hook.** For eve@0.13.3 channels, the public surface is documented in `node_modules/eve/dist/src/public/channels/<channel>/<channel>Channel.d.ts` — look for the `events:` interface. `turn.completed` is the standard post-turn hook; `message.completed` is the per-message hook if you need finer granularity.
4. Add a regression eval that catches the model-side violation in CI (assertions like `t.calledTool(name, { ..., times: 1 })` work in eve@0.13.3).
5. Document the hook in the relevant `skills/*.md` Step where the rule lives ("if the model violates this, the dispatcher's `<event>` hook enforces it").

**Anti-pattern:** Believing that tightening prose alone will fix a repeated violation. The model's summarization instinct is load-bearing — when it finishes a task, it wants to say "done". Prose fights that instinct; deploy-side code wins.

**Related:** [[project-agent-triage-v15-polish]] (the original symptom + fix), [[reference/hooks]] (eve channel hooks reference), [[feedback-issue-body-file-references]] (the 404 trigger chain that nudged the model on #30).