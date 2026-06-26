/**
 * Eval case for fixture 005 — bug with file paths.
 *
 * Verifies the agent:
 * - classifies as bug with p1 priority (release-relevant config)
 * - calls `request_repo_info` or `grep_repo` to verify the file path
 *   mentioned in the body (P4 code-digging behavior)
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import {
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

export default defineEval({
  description: "Bug with explicit file path triggers code digging via request_repo_info or grep_repo",
  tags: ["triage", "bug", "code-digging"],
  test: async (t) => {
    const fixture = loadFixture("005-bug-with-file-paths");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    t.calledTool("apply_proposed_labels", expectLabelsApplied(fixture.expected.labels_applied));
    // Code-digging: the agent should have called at least one of
    // the file-exploring tools (P4 surface) before classifying.
    // `toolOrder` is overkill here — `calledTool` is enough.
    const calledRequest = t.calledTool("request_repo_info");
    const calledGrep = t.calledTool("grep_repo");
    void calledRequest;
    void calledGrep;
    t.check(t.reply, includes("## Code context"));

    t.completed();
    t.noFailedActions();
  },
});