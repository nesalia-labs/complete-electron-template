/**
 * Regression eval for the priority-label-actually-applies bug.
 *
 * Before the fix: the validator accepted "priority: p1: high" (which
 * matched no real repo label), the tool's unknownInRepo filter caught
 * it, and the label silently never landed. The existing
 * expectLabelsApplied matcher only checked the tool's INPUT, so the
 * 20 evals passed despite the bug.
 *
 * This eval uses BOTH matchers: expectLabelsApplied (the bot
 * proposed the right label) AND expectLabelsActuallyApplied (the bot's
 * call actually returned `applied: ['p1: high', ...]` — not
 * `unknownInRepo: ['priority: p1: high']`).
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsActuallyApplied,
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "p1 bug label actually lands on the issue, not silently no-op'd by unknownInRepo",
  tags: ["triage", "bug", "regression", "priority-routing"],
  test: async (t) => {
    const fixture = loadFixture("021-priority-label-actually-applies");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // The proposal is correct.
    t.calledTool(
      "apply_proposed_labels",
      expectLabelsApplied(fixture.expected.labels_applied),
    );
    // The label actually landed on the issue.
    t.calledTool(
      "apply_proposed_labels",
      expectLabelsActuallyApplied(fixture.expected.labels_applied),
    );

    t.check(t.reply, includes("## Latest classification"));
    t.check(t.reply, includes("p1: high"));

    t.completed();
    t.noFailedActions();
  },
});
