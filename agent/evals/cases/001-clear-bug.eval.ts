/**
 * Eval case for fixture 001 — trivial bug with clear repro.
 *
 * Verifies the agent:
 * - applies `type: bug`, `priority: p2: medium`, `effort: s`
 * - posts a triage comment with the standard classification section
 * - completes without tool failures
 *
 * Mirrors the P5 design doc's fixture-001 baseline.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Clear bug with repro steps gets the standard type/priority/effort labels",
  tags: ["triage", "bug", "happy-path"],
  test: async (t) => {
    const fixture = loadFixture("001-clear-bug");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("## Latest classification"));
    t.check(t.reply, includes("type: bug"));
    t.check(t.reply, includes("priority: p2: medium"));
    t.check(t.reply, includes("effort: s"));

    t.completed();
    t.noFailedActions();
  },
});