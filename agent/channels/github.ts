/**
 * GitHub App webhook channel — the agent's only entry point.
 *
 * Two trigger paths dispatch a turn; everything else is ignored:
 *
 *   1. `issues` event with `action === "opened"` — a new issue lands.
 *   2. `issues` event with `action === "labeled"` and the newly added label
 *      is `status: triage` — a human (or another tool) has explicitly asked
 *      us to re-triage.
 *
 * `defaultGitHubAuth(ctx)` derives session auth from the webhook actor and
 * stamps the repo, issue number, and installation id into
 * `auth.attributes` — which `apply_proposed_labels` and `request_repo_info`
 * read to construct their API paths. Returning `null` skips dispatch.
 *
 * Credentials fall back to env vars (`GITHUB_APP_ID`,
 * `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`); the explicit block
 * below documents intent and is robust against someone renaming them.
 *
 * Webhook URL must be `https://<deployment>/eve/v1/github`. Vercel
 * Deployment Protection must be OFF — see `instructions.md`.
 *
 * `turn.started` override: the channel's built-in handler drops an `eyes`
 * reaction AND checks the repo out into a sandbox on every dispatched
 * turn. This agent triages purely from the issue body in context plus
 * targeted `request_repo_info` calls; we have no sandbox tools loaded, so
 * the checkout is pure cost. Replacing the built-in keeps the
 * acknowledgement reaction (a no-op on an opened issue, but correct for
 * any future comment-driven dispatch) and skips the clone.
 */
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

const RETRIAGE_LABEL = "status: triage";

export default githubChannel({
  botName: "eve-triage",
  credentials: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  onIssue: (ctx, issue) => {
    if (issue.action === "opened") {
      return { auth: defaultGitHubAuth(ctx) };
    }
    if (issue.action === "labeled") {
      const added = issue.label?.name;
      if (added === RETRIAGE_LABEL) {
        return { auth: defaultGitHubAuth(ctx) };
      }
    }
    return null;
  },
  events: {
    "turn.started": async (_data, channel) => {
      // Skip the default's sandbox checkout (unused here). On an opened
      // issue the reaction has no thread to attach to and no-ops; for a
      // future comment/@mention dispatch it acks the turn. Either way it
      // must never fail the triage.
      try {
        await channel.thread.react("eyes");
      } catch {
        // Swallow: a failed reaction is not a triage failure.
      }
    },
  },
});