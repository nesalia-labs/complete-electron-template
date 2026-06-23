import { desc, eq } from 'drizzle-orm';
import { recentProjects } from './recent-projects.js';
/**
 * Return the most-recently-opened projects, newest first.
 *
 * @param db     The Drizzle handle (from `initDatabase()`).
 * @param limit  Maximum rows to return. Defaults to 10 — matches the
 *               default shown in the Settings → Projects panel.
 */
export function listRecentProjects(db, limit = 10) {
    return db
        .select()
        .from(recentProjects)
        .orderBy(desc(recentProjects.openedAt))
        .limit(limit)
        .all();
}
/**
 * Record that the user just opened `projectId`. If a row already exists for
 * this projectId, refresh `projectName` and bump `openedAt` to now.
 *
 * Uses `onConflictDoUpdate` on the `project_id` unique index so the upsert
 * is a single SQL statement (no SELECT-then-INSERT race).
 *
 * @param db          The Drizzle handle.
 * @param projectId   Stable opaque ID (e.g. absolute path hash).
 * @param projectName Human-readable name to display.
 * @returns           The row after the upsert.
 */
export function touchRecentProject(db, projectId, projectName) {
    const rows = db
        .insert(recentProjects)
        .values({ projectId, projectName })
        .onConflictDoUpdate({
        target: recentProjects.projectId,
        set: { projectName, openedAt: new Date() }
    })
        .returning()
        .all();
    const row = rows[0];
    if (!row) {
        throw new Error(`touchRecentProject: upsert returned no row for ${projectId}`);
    }
    return row;
}
/**
 * Remove a row from the recent projects list.
 *
 * @param db        The Drizzle handle.
 * @param projectId The project_id to delete.
 * @returns         `true` if a row was removed, `false` if no row matched.
 */
export function deleteRecentProject(db, projectId) {
    const result = db
        .delete(recentProjects)
        .where(eq(recentProjects.projectId, projectId))
        .run();
    return result.changes > 0;
}
//# sourceMappingURL=recent-projects-repository.js.map