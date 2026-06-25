/**
 * Eval case for fixture 010 — P0 release blocker.
 *
 * Verifies the agent classifies as p0 (critical) and proposes
 * `status: in-progress` (the agent proposes; maintainer applies).
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Release-blocking crash on macOS gets p0:critical and status:in-progress",
  tags: ["triage", "bug", "critical"],
  test: async (t) => {
    const fixture = loadFixture("010-bug-p0-critical");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("priority: p0: critical"));

    t.completed();
    t.noFailedActions();
  },
});