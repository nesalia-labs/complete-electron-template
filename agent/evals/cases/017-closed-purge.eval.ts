/**
 * Eval case for fixture 017 — closed event.
 *
 * Verifies the dispatcher purges state and does NOT dispatch a
 * turn. The eval target should record the closed event but the
 * model should not be invoked.
 */
import { defineEval } from "eve/evals";

import { formatIssueAsUserMessage, loadFixture } from "./_helpers";

export default defineEval({
  description: "Closed event purges state without dispatching a turn",
  tags: ["dispatcher", "closed", "purge"],
  test: async (t) => {
    const fixture = loadFixture("017-closed-purge");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // No triage on closed events.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});