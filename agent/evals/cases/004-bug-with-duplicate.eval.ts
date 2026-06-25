/**
 * Eval case for fixture 004 — duplicate bug.
 *
 * Verifies the agent detects the duplicate (refs #22) and routes to
 * `status: blocked` with a low effort estimate (the work is to close
 * in favor of the canonical issue).
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Duplicate bug is routed to status:blocked with a pointer to the canonical issue",
  tags: ["triage", "bug", "duplicate"],
  test: async (t) => {
    const fixture = loadFixture("004-bug-with-duplicate");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    // The agent must reference the canonical issue number in its
    // comment so the maintainer knows where to merge this into.
    t.check(t.reply, includes("#22"));

    t.completed();
    t.noFailedActions();
  },
});