/**
 * Eval case for fixture 019 — bug with full template match.
 *
 * Verifies the agent:
 * - classifies as bug with the standard labels
 * - marks the template compliance check as passed in the Quality notes
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Bug with full bug_report.md template match passes template-compliance check",
  tags: ["triage", "bug", "template"],
  test: async (t) => {
    const fixture = loadFixture("019-bug-with-template-match");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    // The Quality notes section should mention the template.
    t.check(t.reply, includes("template"));
    t.check(t.reply, includes("followed"));

    t.completed();
    t.noFailedActions();
  },
});