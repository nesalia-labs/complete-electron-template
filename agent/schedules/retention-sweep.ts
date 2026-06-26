/**
 * Daily retention sweep for the v2 issue-triage state backend.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 2 § "State retention" + § "Phasing"). Hard-deletes rows
 * from `issue_triage_state` whose `created_at` is older than the
 * configured TTL. The event-driven purges on `closed` /
 * `transferred` are the primary retention mechanism (they soft-delete
 * via `closed_at`); this sweep is the safety net for orphaned rows
 * (e.g. issues transferred before the webhook reached us, or rows
 * where `closed_at` was never stamped because Turso was down at the
 * moment of the `closed` event).
 *
 * Schedule: 03:00 UTC daily. Off-peak for the GitHub API quota
 * window and Vercel Cron's free tier.
 *
 * Config: `TRIAGE_STATE_RETENTION_DAYS` env var (default 365).
 * Lower it for tighter retention; raise it for longer audit trails.
 *
 * No agent turn is involved — the `run` handler talks to Turso
 * directly. Schedules are the right fit for fire-and-forget
 * maintenance; a turn would burn model tokens for nothing.
 *
 * Identity: schedule name is `retention-sweep` (from the file path
 * under `agent/schedules/`).
 */
import { lt } from "drizzle-orm";
import { defineSchedule } from "eve/schedules";
import { getDb, issueTriageState } from "../db/client.js";

const DEFAULT_RETENTION_DAYS = 365;

export default defineSchedule({
  cron: "0 3 * * *",
  async run() {
    const db = await getDb();

    const retentionDaysRaw = process.env.TRIAGE_STATE_RETENTION_DAYS;
    const retentionDays = retentionDaysRaw
      ? Number.parseInt(retentionDaysRaw, 10)
      : DEFAULT_RETENTION_DAYS;
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      throw new Error(
        `retention-sweep: TRIAGE_STATE_RETENTION_DAYS must be a positive integer; got ${retentionDaysRaw ?? "(unset)"}`,
      );
    }

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Drizzle's `delete()` returns a count on libSQL via the affected
    // rows metadata. We log it so Vercel Cron's run history shows the
    // sweep's effect (zero rows is a valid outcome on a quiet day).
    await db
      .delete(issueTriageState)
      .where(lt(issueTriageState.createdAt, cutoff));

    // eslint-disable-next-line no-console -- intentional: cron run signal
    console.log(
      `[retention-sweep] deleted rows older than ${new Date(cutoff).toISOString()} (TTL=${retentionDays}d)`,
    );
  },
});