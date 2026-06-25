/**
 * Eval case for fixture 018 — reopened event.
 *
 * Verifies the dispatcher treats `reopened` like a fresh `opened`
 * with prior history context. Labels are already correct; the
 * agent should not change them but should still post a comment.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import { formatIssueAsUserMessage, loadFixture } from "./_helpers";

export default defineEval({
  description: "Reopened event dispatches a fresh triage turn with history",
  tags: ["dispatcher", "reopened"],
  test: async (t) => {
    const fixture = loadFixture("018-reopened");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // Labels are already correct, so apply_proposed_labels may not
    // be called (empty diff). But the triage comment IS posted.
    t.calledTool("post_triage_comment");
    t.check(t.reply, includes("## History"));

    t.completed();
    t.noFailedActions();
  },
});