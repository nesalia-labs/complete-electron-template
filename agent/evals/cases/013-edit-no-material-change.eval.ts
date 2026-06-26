/**
 * Eval case for fixture 013 — edited event with no material change.
 *
 * Verifies the agent's dispatcher treats whitespace-only edits as
 * no-ops: no `apply_proposed_labels` call, no new triage comment.
 * The agent should record a no-op turn and exit silently.
 */
import { defineEval } from "eve/evals";

import { formatIssueAsUserMessage, loadFixture } from "./_helpers";

export default defineEval({
  description: "Edited event without material change is a no-op",
  tags: ["dispatcher", "edited", "no-op"],
  test: async (t) => {
    const fixture = loadFixture("013-edit-no-material-change");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // No re-triage: the dispatcher should silently record the no-op.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});