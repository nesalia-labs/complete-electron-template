/**
 * Eval case for fixture 007 — docs change.
 *
 * Verifies the agent classifies as docs and applies xs effort
 * (two-line README fix).
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Small docs change gets type:docs, effort:xs",
  tags: ["triage", "docs"],
  test: async (t) => {
    const fixture = loadFixture("007-docs");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: docs"));

    t.completed();
    t.noFailedActions();
  },
});