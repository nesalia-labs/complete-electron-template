/**
 * Read the latest triage state for an issue from the Turso backend.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 1 + § "State shape"). The dispatcher calls this on every
 * `edited` / `labeled (status:*)` / `reopened` event to load the prior
 * turn before deciding whether to re-triage (Decision 2's
 * material-change heuristic reads `bodyHash` from this row).
 *
 * Returns the **latest** row per `(repo, issue_number)` ordered by
 * `created_at DESC`. The full audit trail (older turns) is reachable
 * through Drizzle directly when needed (e.g. the agent's "History"
 * section in the pinned comment) but the model rarely asks for more
 * than the latest; a dedicated `list_triage_history` tool can come
 * later if it becomes a real need.
 *
 * Read-only, no side effects. `needsApproval: never()`.
 *
 * Graceful empty: a missing row returns `null` (not an error). The
 * dispatcher treats that as "no prior turn" — equivalent to a fresh
 * `opened` dispatch.
 *
 * Failure modes that DO throw (and surface to the model):
 *   - Turso env vars missing → `getDb()` throws. Model sees a clear
 *     "state backend not configured" message; dispatcher should
 *     treat as "fresh triage" rather than failing the whole turn.
 *   - Network / 5xx from Turso → propagates as a thrown error.
 *     Model decides whether to retry or proceed without state.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb, issueTriageState, type IssueTriageStateRow } from "../db/client.js";

export default defineTool({
  description:
    "Read the latest triage state for an issue from the Turso state backend. " +
    "Returns the most recent `issue_triage_state` row (one per dispatch turn) " +
    "or `null` if no state exists for the issue. Use before re-triage to load " +
    "the previous body hash and applied labels. Read-only.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number to load state for."),
  }),
  async execute({ owner, repo, issueNumber }) {
    // `repo` here is the issue's `owner/name`. The state backend keys
    // on `owner/name` so two installations against the same GitHub
    // repo share state regardless of which App installation triggered
    // the webhook.
    const repoKey = `${owner}/${repo}`;
    const db = await getDb();
    const rows = await db
      .select()
      .from(issueTriageState)
      .where(
        and(
          eq(issueTriageState.repo, repoKey),
          eq(issueTriageState.issueNumber, issueNumber),
        ),
      )
      .orderBy(desc(issueTriageState.createdAt))
      .limit(1);

    const latest: IssueTriageStateRow | undefined = rows[0];
    if (!latest) {
      return { found: false as const, latest: null };
    }

    // `labelsApplied` is a JSON-serialized array. Decode for the model
    // so it can read `latest.labelsApplied` as a string[], not a
    // JSON string. Falls back to the raw string on parse error so a
    // malformed row doesn't sink the read.
    let labelsApplied: string[];
    try {
      const parsed = JSON.parse(latest.labelsApplied);
      labelsApplied = Array.isArray(parsed)
        ? parsed.filter((l): l is string => typeof l === "string")
        : [];
    } catch {
      labelsApplied = [];
    }

    return {
      found: true as const,
      latest: {
        repo: latest.repo,
        issueNumber: latest.issueNumber,
        turnId: latest.turnId,
        createdAt: latest.createdAt,
        eventAction: latest.eventAction,
        bodyHash: latest.bodyHash,
        labelsApplied,
        commentId: latest.commentId,
        commentHash: latest.commentHash,
        closedAt: latest.closedAt,
      },
    };
  },
  toModelOutput(output) {
    if (!output.found) {
      return { type: "text", value: "No prior triage state for this issue." };
    }
    const l = output.latest;
    return {
      type: "text",
      value:
        `Latest turn: id=${l.turnId} action=${l.eventAction} ` +
        `createdAt=${new Date(l.createdAt).toISOString()} ` +
        `bodyHash=${l.bodyHash.slice(0, 12)}… ` +
        `labels=${l.labelsApplied.join(",") || "(none)"} ` +
        `commentId=${l.commentId ?? "(none)"}${l.closedAt ? ` closedAt=${new Date(l.closedAt).toISOString()}` : ""}`,
    };
  },
});