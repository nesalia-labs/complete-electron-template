/**
 * Eval case for fixture 026 — the bot itself @mentions the bot.
 *
 * Verifies the framework-level self-loop filter
 * (`isIgnoredGitHubComment` in
 * `eve/dist/src/public/channels/github/inbound.js:107-113`): bot-
 * authored comments are filtered BEFORE `onComment` runs. The
 * dispatcher never sees them.
 *
 * This eval is defense-in-depth — if the framework's filter ever
 * regressed, the bot's OWNER association would still cause a
 * self-loop. The eval pins the expected behavior at the model
 * surface: the model must not produce triage actions when handed a
 * bot-authored comment body in eval mode (eval mode bypasses the
 * framework's filter, so this is the only layer we can pin via the
 * suite).
 *
 * The dispatcher-side filter is in the framework, not in our code;
 * we cannot assert on it directly. The test below pins the model-
 * side behavior the v2.5 persona prescribes for bot-authored
 * comments: do not triage.
 */
import { defineEval } from "eve/evals";

import { loadMentionFixture } from "./_helpers";

export default defineEval({
  description:
    "Bot self-mention is filtered by the framework — defense-in-depth pin",
  tags: ["dispatcher", "mention", "v2.5", "self-loop"],
  test: async (t) => {
    const fixture = loadMentionFixture("026-bot-self-mention");
    await t.send(fixture.comment.body);

    // Bot-authored comments must not produce triage actions. Even if
    // the framework's filter regressed, the bot is not authorized to
    // talk to itself in a triage capacity.
    t.notCalledTool("apply_proposed_labels");
    t.notCalledTool("post_triage_comment");

    t.didNotFail();
  },
});