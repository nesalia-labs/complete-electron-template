/**
 * Eval case for fixture 027 — OWNER posts a comment WITHOUT @mentioning
 * the bot.
 *
 * Verifies the framework-level mention gate
 * (`shouldDispatchGitHubComment` in
 * `eve/dist/src/public/channels/github/inbound.js:1`): the framework
 * checks for the `@<botName>` token in the body and returns false if
 * missing — `onComment` is never called.
 *
 * Eval-mode caveat: eval mode bypasses the channel and sends a plain
 * user message. The framework's mention-detection gate is not
 * exercisable in eval mode. The pin below is for the model-side
 * behavior: even if the dispatcher fired (which it doesn't, by
 * framework contract), the model must not produce triage actions on
 * a non-mention comment.
 *
 * The `notCalledTool` assertions below cover the model side; the
 * framework-side gate is contractually guaranteed by the
 * `eve@0.13.3` `shouldDispatchGitHubComment` helper, which the v2.5
 * design doc references as the framework-level layer of the
 * defense-in-depth stack.
 */
import { defineEval } from "eve/evals";

import { loadMentionFixture } from "./_helpers";

export default defineEval({
  description:
    "Non-mention comment by an OWNER is ignored — framework-level gate",
  tags: ["dispatcher", "mention", "v2.5", "mention-gate"],
  test: async (t) => {
    const fixture = loadMentionFixture("027-non-mention-comment-by-maintainer");
    await t.send(fixture.comment.body);

    // A non-mention comment is not a triage trigger. Even with OWNER
    // association, the bot stays silent.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});