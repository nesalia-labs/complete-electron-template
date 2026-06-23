import type { AppDatabase } from '../client.js';
import { type RecentProject } from './recent-projects.js';
/**
 * Return the most-recently-opened projects, newest first.
 *
 * @param db     The Drizzle handle (from `initDatabase()`).
 * @param limit  Maximum rows to return. Defaults to 10 — matches the
 *               default shown in the Settings → Projects panel.
 */
export declare function listRecentProjects(db: AppDatabase, limit?: number): RecentProject[];
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
export declare function touchRecentProject(db: AppDatabase, projectId: string, projectName: string): RecentProject;
/**
 * Remove a row from the recent projects list.
 *
 * @param db        The Drizzle handle.
 * @param projectId The project_id to delete.
 * @returns         `true` if a row was removed, `false` if no row matched.
 */
export declare function deleteRecentProject(db: AppDatabase, projectId: string): boolean;
//# sourceMappingURL=recent-projects-repository.d.ts.map