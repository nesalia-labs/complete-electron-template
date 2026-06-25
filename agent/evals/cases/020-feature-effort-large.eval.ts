/**
 * Eval case for fixture 020 — large feature spanning multiple files.
 *
 * Verifies the agent classifies as feature with `effort: l` (large)
 * and routes to `status: triage` rather than `status: ready` —
 * a multi-week feature needs Tech Lead scoping.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Large feature spanning multiple files routes to triage with effort:l",
  tags: ["triage", "feature", "large"],
  test: async (t) => {
    const fixture = loadFixture("020-feature-effort-large");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: feature"));
    t.check(t.reply, includes("effort: l"));

    t.completed();
    t.noFailedActions();
  },
});