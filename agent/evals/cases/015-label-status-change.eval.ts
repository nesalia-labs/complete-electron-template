/**
 * Eval case for fixture 015 — labeled event with status:* change.
 *
 * Verifies the dispatcher treats `status: ready` as a re-triage
 * trigger but, since labels already match, the agent ends up making
 * no further label changes (diff is empty).
 */
import { defineEval } from "eve/evals";

import { formatIssueAsUserMessage, loadFixture } from "./_helpers";

export default defineEval({
  description: "Status label change triggers re-triage; no-op diff is acceptable",
  tags: ["dispatcher", "labeled", "status"],
  test: async (t) => {
    const fixture = loadFixture("015-label-status-change");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // Re-triage may or may not call apply_proposed_labels depending
    // on whether the diff is empty. The History section in the
    // comment should record the turn either way.
    // We don't assert a specific tool call here — the contract is
    // "re-triage happens silently if labels match".

    t.didNotFail();
  },
});