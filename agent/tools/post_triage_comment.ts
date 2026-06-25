/**
 * Post — or edit in place — the bot's single structured triage comment on
 * the issue.
 *
 * v2 of the issue-triage agent (see `docs/internal/architecture/agents/
 * reports/issue-triage-v2-design.md` Decision 3) collapses the v1
 * "always POST a new comment" behavior into a lifetime-one comment that
 * is **edited in place** on every subsequent turn. The model calls
 * `find_existing_triage_comment` first; if it returns a `commentId`,
 * this tool does a `PATCH` instead of a `POST`. Same tool signature
 * (with an optional `commentId`); same `body` validation; same model
 * instructions ("compose the body in the model, don't template it
 * here"). The HTML marker `<!-- bot:marty-action triage:v2 -->` is
 * prepended to every body so `find_existing_triage_comment` can locate
 * the previous comment.
 *
 * Hard rule enforced by `instructions.md`: this is the *only* sanctioned
 * channel for proposing state changes (status moves, body edits,
 * close/reopen, assignment). The comment is the proposal; a human
 * applies it.
 *
 * GitHub API surface: see the note in `apply_proposed_labels.ts` —
 * the `ctx.github.request(...)` helper that earlier betas exposed on
 * `ToolContext` is gone in `eve@0.13.3`. We call `callGitHub` from
 * `agent.ts` instead.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { callGitHub } from "../agent.js";

/** Marker comment written at the very top of every triage body. */
export const TRIAGE_COMMENT_MARKER = "<!-- bot:marty-action triage:v2 -->";

/**
 * Ensure every body the model submits carries the v2 marker at the
 * top. We do this in code (not by trusting the skill) so a model that
 * omits the marker cannot break the edit-in-place lookup. The marker
 * line is invisible to humans in rendered Markdown.
 */
function ensureMarker(body: string): string {
  if (body.includes(TRIAGE_COMMENT_MARKER)) return body;
  return `${TRIAGE_COMMENT_MARKER}\n\n${body}`;
}

export default defineTool({
  description:
    "Post — or edit in place — the bot's single structured triage comment on " +
    "the issue. Pass `commentId` to PATCH (edit) an existing triage comment; " +
    "omit `commentId` to POST a fresh one. Always call " +
    "`find_existing_triage_comment` first to discover whether a previous " +
    "comment exists; do not post a second comment when one is already there. " +
    "The body must follow the Summary / Classification / Quality notes / " +
    "Template compliance / Code context / Dedupe / Info request / History " +
    "shape from `triage-workflow.md` Step 7.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number to comment on."),
    body: z
      .string()
      .min(1)
      .describe(
        "The full triage comment body in GitHub-flavored Markdown. " +
          "Composed by the model from `triage-workflow.md`, not templated here. " +
          "If this is a PATCH (commentId provided) and an existing `## History` " +
          "section is present, replace the table wholesale with the new " +
          "content including the new turn row.",
      ),
    commentId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Existing triage comment id to edit in place. Omit to POST a new " +
          "comment. Always call `find_existing_triage_comment` first to " +
          "discover whether a previous comment exists.",
      ),
  }),
  async execute({ owner, repo, issueNumber, body, commentId }, ctx) {
    type Comment = {
      readonly id: number;
      readonly html_url: string;
    };
    const markedBody = ensureMarker(body);
    const repoPath = `/repos/${owner}/${repo}/issues`;

    if (commentId !== undefined) {
      // Edit-in-place: PATCH the existing comment. The marker is
      // idempotent (ensureMarker no-ops if already present) so a
      // re-PATCH on the same body is safe.
      const { body: updated } = await callGitHub<Comment>(
        ctx,
        "PATCH",
        `${repoPath}/comments/${commentId}`,
        { body: markedBody },
      );
      return {
        id: updated.id,
        htmlUrl: updated.html_url,
        action: "updated" as const,
      };
    }

    const { body: created } = await callGitHub<Comment>(
      ctx,
      "POST",
      `${repoPath}/${issueNumber}/comments`,
      { body: markedBody },
    );
    return {
      id: created.id,
      htmlUrl: created.html_url,
      action: "posted" as const,
    };
  },
  toModelOutput(output) {
    const verb = output.action === "updated" ? "updated in place" : "posted";
    return {
      type: "text",
      value: `Triage comment ${verb}: id=${output.id} ${output.htmlUrl}`,
    };
  },
});
