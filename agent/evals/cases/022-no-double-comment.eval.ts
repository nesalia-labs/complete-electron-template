/**
 * Regression eval for the v1.5 double-comment anti-pattern.
 *
 * Before the fix: the model (MiniMax M3) decided unprompted to post a
 * second "Triage complete for issue #30…" comment a few seconds after
 * the structured triage comment, violating `triage-workflow.md` Step 7d
 * and the v1.5 "one comment per turn" rule in `instructions.md`. The
 * dispatcher-side guard in `channels/github.ts` (the `turn.completed`
 * hook) auto-deletes any such recap; this eval asserts the model-side
 * primary defense — the HARD RULE in `instructions.md` actually held
 * the model to one `post_triage_comment` call.
 *
 * Assertions (rule-based, no LLM judge — v1.5 P5 budget):
 *   1. `post_triage_comment` was called EXACTLY ONCE.
 *   2. The single call's body carries the v2 marker
 *      `<!-- bot:marty-action triage:v2 -->`.
 *   3. The labels `type: bug`, `p3: low`, `effort: xs` were applied
 *      via `apply_proposed_labels` (same regression coverage as case
 *      021 — the labels on the real #30).
 *
 * Note on "exactly one": `calledTool(name, { times: 1 })` is the
 * supported DSL — see `EveEvalToolCallMatchOptions.times` in
 * `eve/dist/src/evals/match.d.ts`. The default is "at least one", so
 * omitting `times` would not catch a double-post.
 */
import { defineEval } from "eve/evals";

import {
  expectLabelsActuallyApplied,
  expectLabelsApplied,
  formatIssueAsUserMessage,
  loadFixture,
} from "./_helpers";

const TRIAGE_MARKER = "<!-- bot:marty-action triage:v2 -->";

export default defineEval({
  description:
    "no double-comment: model posts exactly one structured triage comment (no 'Triage complete' recap). Mirrors issue #30.",
  tags: ["triage", "bug", "regression", "v1.5-polish", "double-comment"],
  test: async (t) => {
    const fixture = loadFixture("022-no-double-comment");
    await t.send(formatIssueAsUserMessage(fixture.issue));

    // 1. EXACTLY ONE post_triage_comment call. The `times: 1` is the
    //    load-bearing assertion — without it, "at least one" passes
    //    even when the model posts a recap second.
    t.calledTool("post_triage_comment", {
      input: {
        body: (value: unknown) =>
          typeof value === "string" && value.includes(TRIAGE_MARKER),
      },
      times: 1,
    });

    // 2. Labels applied (regression coverage for #30's labels).
    t.calledTool(
      "apply_proposed_labels",
      expectLabelsApplied(fixture.expected.labels_applied),
    );
    t.calledTool(
      "apply_proposed_labels",
      expectLabelsActuallyApplied(fixture.expected.labels_applied),
    );

    t.completed();
    t.noFailedActions();
  },
});
