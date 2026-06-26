/**
 * Write a new triage turn to the Turso state backend.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 1 + § "State shape"). The dispatcher calls this once per
 * dispatched turn (and on `edited`-no-op turns to keep the audit
 * trail complete). One row per call; the composite PK
 * `(repo, issue_number, turn_id)` means a duplicate turnId overwrites
 * — the caller must generate a fresh `turnId` per dispatch (e.g.
 * `crypto.randomUUID()` or `Date.now().toString(36)`).
 *
 * `eventAction` is one of `opened` | `edited` | `labeled` | `reopened`
 * | `no-op`. The dispatcher is responsible for passing the correct
 * value; we don't validate against a closed enum here so the
 * `closed` / `transferred` paths that write to the same table
 * (currently via `purge_issue_state`) can keep their own contract.
 *
 * `labelsApplied` is stored as a JSON string. We don't add a join
 * table because labels are write-once per turn and we never query by
 * individual label.
 *
 * Write-only with `needsApproval: never()`. The MCP allowlist (when
 * the GitHub connection is wired in v1.1) sits at the network
 * boundary; state writes to our own Turso DB are not a destructive
 * surface and don't need approval gating.
 *
 * Idempotency: the dispatcher may re-run on a partial failure. If the
 * same `turnId` is replayed, the INSERT OR REPLACE (Drizzle's `insert`
 * is upsert-shaped for PK collisions) overwrites with the same data,
 * producing the same end state. A different `turnId` for the same
 * logical event produces an extra row — that's the audit trail's job
 * to surface (the History section in the pinned comment), not the
 * tool's.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { getDb, issueTriageState } from "../db/client.js";

const eventActionSchema = z.enum([
  "opened",
  "edited",
  "labeled",
  "reopened",
  "no-op",
]);

export default defineTool({
  description:
    "Record a new triage turn to the Turso state backend. Call once per " +
    "dispatched turn (and on `edited`-no-op turns to keep the audit trail " +
    "complete). The `turnId` must be unique per dispatch — generate a fresh " +
    "one (e.g. `crypto.randomUUID()`) for every call. Writes one row to " +
    "`issue_triage_state`.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number this turn belongs to."),
    turnId: z
      .string()
      .min(1)
      .describe(
        "Unique identifier for this turn (PK part). Generate a fresh one " +
          "per call — e.g. `crypto.randomUUID()`.",
      ),
    eventAction: eventActionSchema.describe(
      "What triggered this turn: `opened` (new issue), `edited` (issue body " +
        "changed materially), `labeled` (status:* flipped), `reopened` " +
        "(treat as fresh-with-history), or `no-op` (edited but no material " +
        "change; record-only).",
    ),
    bodyHash: z
      .string()
      .min(1)
      .describe(
        "sha256 of the issue body at the time of this turn. Used by the " +
          "dispatcher on the next `edited` event to compare against for " +
          "material-change detection.",
      ),
    labelsApplied: z
      .array(z.string().min(1))
      .describe(
        "Label names applied during this turn. Stored as a JSON array.",
      ),
    commentId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "The bot's pinned triage comment id, if one was created/edited this " +
          "turn. `null` until the first triage comment lands.",
      ),
    commentHash: z
      .string()
      .min(1)
      .optional()
      .describe(
        "sha256 of the triage comment body, if one was created/edited this " +
          "turn. Stored alongside `commentId` for staleness detection.",
      ),
  }),
  async execute(input) {
    const repoKey = `${input.owner}/${input.repo}`;
    const db = await getDb();
    const inserted = await db
      .insert(issueTriageState)
      .values({
        repo: repoKey,
        issueNumber: input.issueNumber,
        turnId: input.turnId,
        createdAt: Date.now(),
        eventAction: input.eventAction,
        bodyHash: input.bodyHash,
        labelsApplied: JSON.stringify(input.labelsApplied),
        commentId: input.commentId ?? null,
        commentHash: input.commentHash ?? null,
        closedAt: null,
      })
      .returning({ turnId: issueTriageState.turnId });

    return {
      recorded: true as const,
      turnId: inserted[0]?.turnId ?? input.turnId,
    };
  },
  toModelOutput(output) {
    return { type: "text", value: `Recorded turn ${output.turnId}.` };
  },
});