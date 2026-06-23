import { z } from 'zod';
import { type AppDatabase } from '@electron-template/db';
/**
 * oRPC procedures for the "recent projects" panel in Settings.
 *
 * Closure factory pattern (see packages/api/CLAUDE.md) — the DB handle is
 * captured once when `createProjectsRoutes(db)` runs and reused by every
 * procedure invocation. No `os.$context` plumbing.
 *
 * Procedures:
 *   - `listRecentProjects({ limit? })` — newest-first, capped at `limit`.
 *   - `touchRecentProject({ projectId, projectName })` — upsert by
 *     `project_id`, refresh `opened_at` to now.
 *   - `deleteRecentProject({ projectId })` — remove a row, throw
 *     `NOT_FOUND` if no row matched (the renderer treats this as an error
 *     to show the user, not a silent no-op).
 */
export declare function createProjectsRoutes(db: AppDatabase): {
    listRecentProjects: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodOptional<z.ZodObject<{
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>, import("@orpc/server").Schema<{
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }[], {
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }[]>, Record<never, never>, Record<never, never>>;
    touchRecentProject: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        projectId: z.ZodString;
        projectName: z.ZodString;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }, {
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }>, Record<never, never>, Record<never, never>>;
    deleteRecentProject: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        projectId: z.ZodString;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        success: boolean;
        projectId: string;
    }, {
        success: boolean;
        projectId: string;
    }>, Record<never, never>, Record<never, never>>;
};
//# sourceMappingURL=projects.d.ts.map