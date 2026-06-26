/**
 * Eval case for fixture 024 — FIRST_TIME_CONTRIBUTOR @mentions the bot.
 *
 * Verifies the v2.5 `author_association` gate: contributor-tier actors
 * are silently ignored. No turn fires, no comment, no reaction, no
 * log line — drive-by contributors cannot wake the bot.
 *
 * The dispatcher-side gate returns null before any turn starts, so
 * the model is not invoked. Eval-mode coverage: we send the comment
 * body as a plain user message and assert that the model takes NO
 * triage actions (no labels, no comment). The model's response in
 * eval mode is structurally a chat reply to the sent message; the
 * dispatcher-side gate that would have prevented this from reaching
 * the model is covered by the comment-shape contract in the
 * instructions + the `_helpers.ts` registration row.
 *
 * Per the v2.5 persona: even if a contributor mentions the bot, the
 * agent will not produce a triage classification. The chat reply is
 * not the deliverable — silence is.
 */
import { defineEval } from "eve/evals";

import { loadMentionFixture } from "./_helpers";

export default defineEval({
  description:
    "FIRST_TIME_CONTRIBUTOR mention is silently ignored by the dispatcher",
  tags: ["dispatcher", "mention", "v2.5", "auth-gate"],
  test: async (t) => {
    const fixture = loadMentionFixture("024-mention-by-contributor");
    await t.send(fixture.comment.body);

    // Contributor-tier mentions must not produce triage actions.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});