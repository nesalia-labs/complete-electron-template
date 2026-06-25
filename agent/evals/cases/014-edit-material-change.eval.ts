/**
 * Eval case for fixture 014 — edited event with material change.
 *
 * Verifies the dispatcher detects the material change (new code
 * block + new file path + priority rationale) and re-triages,
 * bumping the priority label from p2 to p1.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Edited event with material change re-triages and bumps priority",
  tags: ["dispatcher", "edited", "re-triage"],
  test: async (t) => {
    const fixture = loadFixture("014-edit-material-change");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // The diff (p2 -> p1) is applied via apply_proposed_labels.
    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    t.check(t.reply, includes("priority: p1: high"));
    // The History table inside the comment should mention the re-triage.
    t.check(t.reply, includes("## History"));

    t.completed();
    t.noFailedActions();
  },
});