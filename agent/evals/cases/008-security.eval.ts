/**
 * Eval case for fixture 008 — security issue.
 *
 * Verifies the agent classifies as security, applies `p0: critical`,
 * and routes to `status: ready` (security issues should not wait for
 * triage — the agent proposes immediate pickup).
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Security boundary bypass gets type:security and p0:critical",
  tags: ["triage", "security", "high-priority"],
  test: async (t) => {
    const fixture = loadFixture("008-security");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: security"));
    t.check(t.reply, includes("priority: p0: critical"));

    t.completed();
    t.noFailedActions();
  },
});