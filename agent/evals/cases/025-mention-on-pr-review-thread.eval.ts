/**
 * Eval case for fixture 025 — OWNER mentions the bot on a PR inline
 * review comment.
 *
 * Verifies the v2.5 surface decision: PR review threads are out of
 * scope. Even with OWNER association, the `ctx.conversation.kind ===
 * "review_thread"` short-circuit in `onComment` returns null before
 * the allowlist check fires.
 *
 * The dispatcher does not dispatch a turn. In eval mode, the model
 * still receives the comment body as a plain user message (because
 * eval mode bypasses the channel), but it must not produce triage
 * actions — a PR review thread mention is not a triage trigger.
 */
import { defineEval } from "eve/evals";

import { loadMentionFixture } from "./_helpers";

export default defineEval({
  description:
    "Owner mention on a PR review thread is ignored — issues-only surface",
  tags: ["dispatcher", "mention", "v2.5", "surface-gate", "pr"],
  test: async (t) => {
    const fixture = loadMentionFixture("025-mention-on-pr-review-thread");
    await t.send(fixture.comment.body);

    // No triage actions on a PR review-thread mention.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});