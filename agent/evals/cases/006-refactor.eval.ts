/**
 * Eval case for fixture 006 — refactor request.
 *
 * Verifies the agent classifies as refactor and proposes `effort: l`
 * (large — needs breakdown), which routes to `status: triage` rather
 * than `status: ready`.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Refactor request gets type:refactor, effort:l, and a triage comment that asks for a breakdown",
  tags: ["triage", "refactor"],
  test: async (t) => {
    const fixture = loadFixture("006-refactor");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("type: refactor"));
    t.check(t.reply, includes("effort: l"));

    t.completed();
    t.noFailedActions();
  },
});