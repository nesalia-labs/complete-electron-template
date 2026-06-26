/**
 * Locate the bot's existing triage comment on an issue, if any.
 *
 * Companion to `post_triage_comment` for v2 edit-in-place
 * (see `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`
 * Decision 3). The model calls this on every turn before posting, so
 * subsequent reviews can PATCH the previous comment instead of posting
 * a fresh one.
 *
 * The bot's triage comments carry an HTML marker at the very top of
 * the body: `<!-- bot:marty-action triage:v2 -->`. The marker is
 * injected by `post_triage_comment.execute` (`ensureMarker`), so the
 * model cannot accidentally omit it. This tool searches the issue's
 * comment list for the marker and returns the id of the most recent
 * match, or `null` if none.
 *
 * Stateless: comment_id is resolved per-turn by querying GitHub. The
 * GitHub API call cost is accepted as the v2 design tradeoff; P3 will
 * cache the id in Turso so the cost is amortized to one lookup per
 * state change.
 *
 * Pagination: 100 comments per page. The triage comment is always the
 * bot's most recent, and the agent only ever leaves one — but old
 * v1 comments and human replies are in the same list. Scanning page 1
 * (most recent first) is enough; we page forward only if no marker is
 * found on page 1 and there are more pages. A defensive cap of 5 pages
 * bounds worst-case runtime.
 *
 * Defensive: if multiple comments carry the marker (shouldn't happen
 * but defend against a corrupted state from a prior deployment), the
 * tool returns the most recent one. Lower-priority matches are
 * surfaced in the `extras` field for visibility.
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
import { TRIAGE_COMMENT_MARKER } from "./post_triage_comment.js";

const PER_PAGE = 100;
const MAX_PAGES = 5;

interface IssueComment {
  readonly id: number;
  readonly body: string | null;
  readonly html_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly user: { readonly login: string; readonly type: string } | null;
}

interface CommentListResponse extends Array<IssueComment> {}

export default defineTool({
  description:
    "Find the bot's existing triage comment on an issue, if any. Returns " +
    "the most recent comment whose body carries the `<!-- bot:marty-action " +
    "triage:v2 -->` marker, or `null` if none. Call this on every turn, " +
    "before `post_triage_comment`, so subsequent reviews can PATCH the " +
    "previous comment (edit-in-place) instead of posting a fresh one. " +
    "Read-only; no side effects.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number to scan for an existing triage comment."),
  }),
  async execute({ owner, repo, issueNumber }, ctx) {
    const repoPath = `/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

    // GitHub returns comments newest-first. Scan page 1, then page 2
    // only if no marker was found and there are more pages. The
    // marker is at the very top of the body, so once we find the
    // bot's most recent triage comment we can stop — anything older
    // is irrelevant.
    const matches: Array<{ id: number; htmlUrl: string; createdAt: string }> = [];
    let pagesScanned = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { body: comments } = await callGitHub<CommentListResponse>(
        ctx,
        "GET",
        `${repoPath}?per_page=${PER_PAGE}&page=${page}`,
      );
      pagesScanned += 1;

      if (!Array.isArray(comments) || comments.length === 0) {
        break;
      }

      let foundOnThisPage = false;
      for (const comment of comments) {
        if (
          typeof comment.body === "string" &&
          comment.body.includes(TRIAGE_COMMENT_MARKER)
        ) {
          matches.push({
            id: comment.id,
            htmlUrl: comment.html_url,
            createdAt: comment.created_at,
          });
          foundOnThisPage = true;
        }
      }

      if (foundOnThisPage) {
        // The newest match is on page 1; older matches (if any) are
        // less relevant and we don't need to keep scanning.
        break;
      }

      if (comments.length < PER_PAGE) {
        // Last page.
        break;
      }
    }

    if (matches.length === 0) {
      return { commentId: null, htmlUrl: null, extras: [], pagesScanned };
    }

    // `comments` is newest-first, so the first match is the most recent.
    const [mostRecent, ...extras] = matches;
    return {
      commentId: mostRecent.id,
      htmlUrl: mostRecent.htmlUrl,
      extras: extras.map((m) => ({ id: m.id, htmlUrl: m.htmlUrl })),
      pagesScanned,
    };
  },
  toModelOutput(output) {
    if (output.commentId === null) {
      return {
        type: "text",
        value: "No existing triage comment on this issue.",
      };
    }
    const extrasNote =
      output.extras && output.extras.length > 0
        ? ` (warning: ${output.extras.length} older triage comment(s) also matched: ${output.extras.map((e) => e.id).join(", ")} — investigate before posting)`
        : "";
    return {
      type: "text",
      value: `Existing triage comment: id=${output.commentId} ${output.htmlUrl}${extrasNote}`,
    };
  },
});
