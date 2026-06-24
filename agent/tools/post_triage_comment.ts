/**
 * Post the single structured triage comment on the issue.
 *
 * The agent's `instructions.md` dictates the body shape (Summary,
 * Classification, Dedupe, Info request, Proposed status). The model
 * composes the body per the `triage-workflow` skill — this tool does not
 * template it. Composing in the model (rather than string-concatenating
 * in the tool) is what lets the comment adapt to edge cases like
 * duplicates or out-of-scope spam.
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

export default defineTool({
  description:
    "Post the single structured triage comment on the issue. Call exactly " +
    "once per turn, after applying autonomous labels. The body must follow " +
    "the Summary / Classification / Dedupe / Info request / Proposed status " +
    "shape from `instructions.md`. Do not split into multiple comments.",
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
          "Composed by the model from `triage-workflow.md`, not templated here.",
      ),
  }),
  async execute({ owner, repo, issueNumber, body }, ctx) {
    type Comment = {
      readonly id: number;
      readonly html_url: string;
    };
    const { body: created } = await callGitHub<Comment>(
      ctx,
      "POST",
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body },
    );
    return { id: created.id, htmlUrl: created.html_url };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Triage comment posted: ${output.htmlUrl}`,
    };
  },
});