/**
 * Eval case for fixture 016 — labeled event with non-status label.
 *
 * Verifies the dispatcher ignores non-status label changes (e.g.
 * `type: bug`) per the v2 dispatcher rules — no turn, no label diff.
 */
import { defineEval } from "eve/evals";

import { formatIssueAsUserMessage, loadFixture } from "./_helpers";

export default defineEval({
  description: "Non-status label change is ignored by the dispatcher",
  tags: ["dispatcher", "labeled", "non-status"],
  test: async (t) => {
    const fixture = loadFixture("016-label-non-status-change");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});