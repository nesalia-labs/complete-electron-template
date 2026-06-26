/**
 * Eval case for fixture 011 — bug with very long body and multiple code blocks.
 *
 * Verifies the agent handles a long body without errors and applies
 * the standard labels.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Bug with a long body and multiple code blocks still gets classified correctly",
  tags: ["triage", "bug", "formatting"],
  test: async (t) => {
    const fixture = loadFixture("011-bug-long-body");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    // Body should be referenced (test that the agent reads it).
    t.check(t.reply, includes("type: bug"));

    t.completed();
    t.noFailedActions();
  },
});