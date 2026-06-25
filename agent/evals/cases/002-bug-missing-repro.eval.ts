/**
 * Eval case for fixture 002 — bug with no repro.
 *
 * Verifies the agent routes to `status: needs-info` and surfaces
 * the missing-info signals in the comment's Quality notes section.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Bug without repro triggers needs-info path with quality notes",
  tags: ["triage", "bug", "needs-info"],
  test: async (t) => {
    const fixture = loadFixture("002-bug-missing-repro");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("## Quality notes"));
    // Missing repro steps is the canonical needs-info signal.
    t.check(t.reply, includes("repro"));

    t.completed();
    t.noFailedActions();
  },
});