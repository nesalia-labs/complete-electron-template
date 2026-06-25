/**
 * Apply the autonomous triage labels to an issue.
 *
 * This is the agent's only state-mutating tool that runs without human
 * approval. The authority model (see `instructions.md`) restricts it to
 * three namespaces:
 *
 *   - `type:*`      (bug / feature / refactor / docs / security)
 *   - `p[0-3]:*`    (p0:critical / p1:high / p2:medium / p3:low)
 *   - `effort:*`    (xs / s / m / l)
 *
 * Everything else — most importantly `status:*` — is rejected at the Zod
 * level before this code runs. Status transitions are propose-only via
 * `post_triage_comment`. A label that does not exist in the repo is also
 * rejected (GitHub returns 422), so we fetch the repo's label set first
 * and write the intersection.
 *
 * Idempotency: `eve` warns that a step interrupted mid-execution re-runs,
 * so non-idempotent side effects must be made idempotent or gated with
 * approval. We do both: `needsApproval: never()` AND existing-label
 * dedupe before write, so a partial replay produces the same end state.
 *
 * GitHub API surface (`callGitHub`): in `eve@0.13.3` the
 * `ctx.github.request(...)` helper that earlier betas exposed on
 * `ToolContext` was removed. Tools now reach GitHub through the
 * shared `callGitHub` helper exported from `agent.ts`, which mints
 * an installation token via `ctx.getToken(githubAuth)` and signs
 * the call with it.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { callGitHub } from "../agent.js";

const AUTONOMOUS_NAMESPACES = ["type:", "p0:", "p1:", "p2:", "p3:", "effort:"] as const;

const autonomousPrefix = z
  .string()
  .min(1)
  .refine(
    (label) => AUTONOMOUS_NAMESPACES.some((ns) => label.startsWith(ns)),
    {
      // The hard gate. `status:*` and any other namespace (or invented
      // label) fails Zod validation before `execute` is called.
      message:
        "Only `type:*`, `p[0-3]:*`, and `effort:*` labels are autonomous. " +
        "Status transitions are propose-only via `post_triage_comment`.",
    },
  );

export default defineTool({
  description:
    "Apply the autonomous triage labels (type, p[0-3], effort) to an issue. " +
    "Call once per issue, after deciding all three from `label-taxonomy.md`. " +
    "Labels in any other namespace — especially `status:*` — are rejected " +
    "by validation; propose those in a comment instead. Labels that do not " +
    "exist in the repository are skipped (not invented).",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number. PRs share their number with the issue API."),
    labels: z
      .array(autonomousPrefix)
      .min(1)
      .describe(
        "Exact label names from `label-taxonomy.md`. Must start with " +
          "`type:`, `p[0-3]:`, or `effort:`. Validation rejects anything else.",
      ),
  }),
  async execute({ owner, repo, issueNumber, labels }, ctx) {
    const repoPath = `/repos/${owner}/${repo}`;

    // 1. Fetch the labels that actually exist in the repo. Hard gate
    //    against invented labels — GitHub returns 422 for unknown ones,
    //    and the model is told to invent nothing but we enforce here.
    type RepoLabel = { readonly name: string };
    const { body: existing } = await callGitHub<RepoLabel[]>(
      ctx,
      "GET",
      `${repoPath}/labels?per_page=100`,
    );
    const existingNames = new Set(existing.map((label) => label.name));

    // 2. Dedupe within the requested set AND against what already exists.
    //    A label already on the issue is silently dropped — this is the
    //    idempotency guarantee. A partial replay writes the same end
    //    state as the first successful run.
    const requested = Array.from(new Set(labels));
    const applied = requested.filter(
      (label) => existingNames.has(label) && true, // exists in repo
    );
    const unknownInRepo = requested.filter((label) => !existingNames.has(label));

    // 3. Check what's already on the issue so re-runs are no-ops.
    type IssueLabel = { readonly name: string };
    const { body: issueLabels } = await callGitHub<IssueLabel[]>(
      ctx,
      "GET",
      `${repoPath}/issues/${issueNumber}/labels?per_page=100`,
    );
    const alreadyOnIssue = new Set(issueLabels.map((label) => label.name));

    const toAdd = applied.filter((label) => !alreadyOnIssue.has(label));
    const skippedAlreadyApplied = applied.filter((label) =>
      alreadyOnIssue.has(label),
    );

    // 4. Write only the delta. POST replaces the issue's label set with
    //    the body we send, so we send `toAdd` unioned with what was
    //    already there — never zero out a label we didn't intend to.
    if (toAdd.length > 0) {
      await callGitHub(
        ctx,
        "POST",
        `${repoPath}/issues/${issueNumber}/labels`,
        { labels: [...alreadyOnIssue, ...toAdd] },
      );
    }

    return {
      applied: toAdd,
      skippedAlreadyApplied,
      unknownInRepo,
    };
  },
  toModelOutput(output) {
    const parts: string[] = [];
    if (output.applied.length > 0) {
      parts.push(`Applied: ${output.applied.join(", ")}.`);
    }
    if (output.skippedAlreadyApplied.length > 0) {
      parts.push(
        `Already on issue: ${output.skippedAlreadyApplied.join(", ")}.`,
      );
    }
    if (output.unknownInRepo.length > 0) {
      parts.push(
        `Ignored (no such label in repo — create it first or remove from proposal): ${output.unknownInRepo.join(", ")}.`,
      );
    }
    if (parts.length === 0) {
      parts.push("No autonomous labels to apply.");
    }
    return { type: "text", value: parts.join(" ") };
  },
});