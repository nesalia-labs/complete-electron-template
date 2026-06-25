/**
 * Eval case for fixture 003 — feature with clear use case.
 *
 * Verifies the agent classifies as feature and applies appropriate
 * labels without proposing the change itself.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Clear feature request gets type:feature and a concrete-proposal comment",
  tags: ["triage", "feature", "happy-path"],
  test: async (t) => {
    const fixture = loadFixture("003-feature-clear-use-case");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: feature"));
    t.check(t.reply, includes("priority: p2: medium"));

    t.completed();
    t.noFailedActions();
  },
});