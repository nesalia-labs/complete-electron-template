/**
 * Drizzle schema for the v2 issue-triage agent's Turso state backend.
 *
 * Two tables, both SQLite/libSQL-compatible. See
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`
 * § "State shape" for the SQL-equivalent definitions and the rationale
 * for each column.
 *
 *   - `issue_triage_state` — one row per dispatch turn. The latest row
 *     per `(repo, issue_number)` is the current state; older rows are
 *     the audit trail. Indexed for the "latest state for an issue"
 *     read and the retention sweep's time-range delete.
 *
 *   - `triage_config` — per-repo cache of `.github/triage.yml`. Read
 *     by `load_triage_config`; populated on first dispatch and on
 *     config reload (debounced by `loaded_at`). PK on `repo` is
 *     enough — one row per repo.
 *
 * No foreign keys: state is denormalized for query simplicity. The
 * composite PK on `issue_triage_state` is the audit trail's natural
 * key — `(repo, issue_number, turn_id)`.
 *
 * Timestamps are unix milliseconds (`number`). The design doc's SQL
 * declares INTEGER; Drizzle's `{ mode: 'timestamp_ms' }` returns
 * JS Date which we'd then `.getTime()`-convert at every read. Storing
 * as raw `number` matches the doc and skips the round-trip.
 *
 * Migrations: this file is the schema source. The corresponding
 * `agent/db/migrations/` directory is populated by `drizzle-kit
 * generate` and applied at startup by `runMigrations()` in
 * `agent/db/migrate.ts`. See `agent/drizzle.config.ts` for the
 * kit config.
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Audit trail of every triage dispatch. One row per turn per issue.
 *
 * `eventAction` is one of: `opened` | `edited` | `labeled` | `reopened`
 * | `closed` | `transferred` | `no-op`. `no-op` is recorded when an
 * `edited` event fails the material-change heuristic (see
 * `agent/channels/github.ts`) — the dispatcher exits silently but
 * still writes a row so the audit trail captures the event.
 *
 * `labelsApplied` is a JSON-serialized array of label names. JSON,
 * not a join table, because labels are write-once per turn and we
 * never query by individual label.
 *
 * `commentId` / `commentHash` are the bot's pinned triage comment
 * (see Decision 3 in the design doc). `null` on the `opened` turn
 * if the dispatcher hasn't posted yet; populated on every subsequent
 * turn via `find_existing_triage_comment` + `post_triage_comment`.
 *
 * `closedAt` is set on a `purge_issue_state` call when the issue is
 * `closed` / `transferred`. Soft-delete marker: rows are physically
 * deleted by the retention sweep (TTL), not on purge, so the audit
 * trail shows the close event itself.
 */
export const issueTriageState = sqliteTable(
  "issue_triage_state",
  {
    repo: text("repo").notNull(),
    issueNumber: integer("issue_number").notNull(),
    turnId: text("turn_id").notNull(),
    createdAt: integer("created_at").notNull(),
    eventAction: text("event_action").notNull(),
    bodyHash: text("body_hash").notNull(),
    labelsApplied: text("labels_applied").notNull(),
    commentId: integer("comment_id"),
    commentHash: text("comment_hash"),
    closedAt: integer("closed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.repo, table.issueNumber, table.turnId] }),
    // Index for "latest state per (repo, issue_number) ORDER BY created_at DESC".
    // The retention sweep's `created_at < cutoff` predicate uses the same index.
    index("idx_state_issue").on(table.repo, table.issueNumber, table.createdAt),
  ],
);

/**
 * Per-repo cache of `.github/triage.yml`. Read by `load_triage_config`;
 * `loadedAt` lets the dispatcher / a future cache layer detect staleness.
 *
 * `triggersEnabled` is a JSON blob of `{ opened, edited, labeled }`
 * booleans. `materialThreshold` defaults to 0.2 (20% body delta).
 */
export const triageConfig = sqliteTable("triage_config", {
  repo: text("repo").primaryKey(),
  configYaml: text("config_yaml").notNull(),
  materialThreshold: real("material_threshold").notNull().default(0.2),
  triggersEnabled: text("triggers_enabled").notNull(),
  loadedAt: integer("loaded_at").notNull(),
});

export type IssueTriageStateRow = typeof issueTriageState.$inferSelect;
export type NewIssueTriageStateRow = typeof issueTriageState.$inferInsert;
export type TriageConfigRow = typeof triageConfig.$inferSelect;
export type NewTriageConfigRow = typeof triageConfig.$inferInsert;