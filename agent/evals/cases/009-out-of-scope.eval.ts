/**
 * Eval case for fixture 009 — off-topic question.
 *
 * Verifies the agent does NOT apply any triage labels and does NOT
 * call `apply_proposed_labels` for off-topic content. Per the v1
 * "out of scope" path, the comment is also not expected.
 */
import { defineEval } from "eve/evals";

import {
  formatIssueAsUserMessage,
  loadFixture,
  notCalledApplyLabels,
} from "./_helpers";

export default defineEval({
  description: "Off-topic issue is not labelled and not commented on",
  tags: ["triage", "out-of-scope"],
  test: async (t) => {
    const fixture = loadFixture("009-out-of-scope");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // No label application for off-topic issues.
    t.notCalledTool("apply_proposed_labels");
    // No triage comment for off-topic issues.
    t.notCalledTool("post_triage_comment");
    void notCalledApplyLabels;

    // Out-of-scope path can still complete without errors (the agent
    // is allowed to read repo info for context, just not modify).
    t.didNotFail();
  },
});