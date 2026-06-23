import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
/**
 * Recent projects the user has opened. Used by the Settings → Projects panel
 * and (in PR 5+) the home screen quick-open menu.
 *
 * - `project_id`: stable opaque ID (e.g. absolute path hash, or a UUID).
 *   Unique-indexed so duplicate touches collapse into a single row and
 *   `onConflictDoUpdate` can target it directly.
 * - `project_name`: human-readable display name. Stored separately so the
 *   list can render even when the project on disk has been moved/renamed.
 * - `opened_at`: ms-precision Unix epoch (stored as INTEGER, returned as
 *   Date by Drizzle thanks to `mode: 'timestamp_ms'`). Unique-indexed so
 *   we can sort by it for the "most recent" view without a separate scan.
 *
 * PR 4 owns insert + update only. PR 5 will introduce a `projects` table
 * with FK from this `project_id` for the full project metadata.
 */
export const recentProjects = sqliteTable('recent_projects', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id').notNull(),
    projectName: text('project_name').notNull(),
    openedAt: integer('opened_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
}, (table) => ({
    projectIdUniqueIdx: uniqueIndex('recent_projects_project_id_unique').on(table.projectId),
    openedAtUniqueIdx: uniqueIndex('recent_projects_opened_at_unique').on(table.openedAt)
}));
//# sourceMappingURL=recent-projects.js.map