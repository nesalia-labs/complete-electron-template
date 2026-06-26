/**
 * Eval case for fixture 023 — OWNER role @mentions the bot on an issue
 * timeline comment.
 *
 * Verifies the v2.5 mention dispatch contract:
 *   1. `author_association=OWNER` is in the default allowlist → the
 *      dispatcher returns `{ auth }` from `onComment` and a turn fires.
 *   2. The turn is a CHAT reply, not a triage turn. The chat reply is
 *      posted via the framework's default reply path (NOT a structured
 *      `post_triage_comment`), so:
 *      - `post_triage_comment` is NOT called (no triage marker, no
 *        recap-comment guard interaction).
 *      - `apply_proposed_labels` is NOT called (chat replies don't
 *        apply labels per the v2.5 persona).
 *      - The reply mentions the bot's name back (the framework strips
 *        the `@eve-triage` token before delivery) and reflects the
 *        user's question.
 *
 * Eval-mode caveat: `onComment` itself is dispatcher-side logic, not
 * model-side. In eval mode, `t.send(...)` invokes the model directly
 * (bypassing the channel), so the assertion that the DISPATCHER would
 * have dispatched on this fixture is pinned by structure: the model
 * receives a chat-shaped prompt (mention context, no triage trigger)
 * and produces a chat-shaped response. The dispatcher-side gate is
 * covered indirectly by cases 024/025/026/027 which pin the
 * `notCalledTool` shape for the negative cases.
 */
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

import { loadMentionFixture } from "./_helpers";

export default defineEval({
  description:
    "OWNER mention dispatches a chat-reply turn — no triage marker, no label mutation",
  tags: ["dispatcher", "mention", "v2.5", "chat"],
  test: async (t) => {
    const fixture = loadMentionFixture("023-mention-by-maintainer");
    // Mention turns render the comment body as the user message; the
    // framework has already stripped the `@eve-triage` token.
    await t.send(fixture.comment.body);

    // Chat reply — NOT a structured triage comment, NOT a label change.
    t.notCalledTool("post_triage_comment");
    t.notCalledTool("apply_proposed_labels");

    // The reply should reflect the user's question. We assert on a
    // minimal, fixture-stable token (no LLM judge per the P5 budget).
    t.check(t.reply, includes("take a look"));

    t.completed();
    t.noFailedActions();
  },
});