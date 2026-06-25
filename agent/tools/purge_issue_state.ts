/**
 * Purge all triage state for an issue.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 2 + § "State retention"). The dispatcher calls this on
 *   - `issues.closed`    — issue is done; no future re-triage possible
 *   - `issues.transferred` — issue moved to another repo; its state
 *                            here is meaningless going forward
 *
 * Decision: **soft delete via `closedAt` timestamp, not hard delete.**
 * Rationale:
 *
 *   1. The audit trail still needs to show the close event itself.
 *      Hard-deleting on `closed` would erase the evidence that the
 *      dispatcher noticed and acted.
 *   2. The TTL retention sweep (`agent/schedules/retention-sweep.ts`)
 *      does the hard delete N days later (`TRIAGE_STATE_RETENTION_DAYS`,
 *      default 365). Soft-deleted rows survive until then so the
 *      history is answerable if the issue is reopened inside the
 *      window (reopened → re-triage → fresh row, but the previous
 *      `closed` row stays as audit evidence).
 *
 * Idempotency: rows that already have a non-null `closedAt` are
 * left untouched (we don't keep bumping the timestamp). Re-running
 * the tool produces the same end state.
 *
 * Returns `purged: true` and the count of rows that were stamped.
 * `purged: true` is the documented contract regardless of whether
 * N rows were affected (zero rows is a valid outcome for an issue
 * that never had a triage turn).
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, issueTriageState } from "../db/client.js";

export default defineTool({
  description:
    "Mark all triage state for an issue as closed. Called by the dispatcher " +
    "on `issues.closed` and `issues.transferred` events. Soft-delete via the " +
    "`closed_at` timestamp — the rows stay in the table until the daily " +
    "retention sweep (`agent/schedules/retention-sweep.ts`) hard-deletes them " +
    "after `TRIAGE_STATE_RETENTION_DAYS` (default 365). Idempotent.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number whose state should be purged."),
  }),
  async execute({ owner, repo, issueNumber }) {
    const repoKey = `${owner}/${repo}`;
    const db = await getDb();
    const now = Date.now();

    // Update only rows that don't already have a closedAt — re-runs
    // are no-ops on the timestamp. SQLite/libSQL supports UPDATE
    // without RETURNING in the current Drizzle API; we count via a
    // pre-flight select to report the delta to the model.
    const before = await db
      .select({ turnId: issueTriageState.turnId })
      .from(issueTriageState)
      .where(
        and(
          eq(issueTriageState.repo, repoKey),
          eq(issueTriageState.issueNumber, issueNumber),
          isNull(issueTriageState.closedAt),
        ),
      );

    if (before.length > 0) {
      await db
        .update(issueTriageState)
        .set({ closedAt: now })
        .where(
          and(
            eq(issueTriageState.repo, repoKey),
            eq(issueTriageState.issueNumber, issueNumber),
            isNull(issueTriageState.closedAt),
          ),
        );
    }

    return {
      purged: true as const,
      rowsStamped: before.length,
    };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: output.rowsStamped === 0
        ? "No open state rows to purge (already closed or never triaged)."
        : `Purged ${output.rowsStamped} state row(s) (soft-delete; retention sweep will hard-delete after the TTL).`,
    };
  },
});