/**
 * Eval case for fixture 012 — feature with no template match.
 *
 * Verifies the agent falls back to v1 heuristic when the issue body
 * does not match any `.github/ISSUE_TEMPLATE/*.yml` form.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Feature without template match falls back to v1 heuristic path",
  tags: ["triage", "feature", "template-fallback"],
  test: async (t) => {
    const fixture = loadFixture("012-feature-no-template");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: feature"));

    t.completed();
    t.noFailedActions();
  },
});