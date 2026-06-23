import { os, ORPCError } from '@orpc/server'
import { z } from 'zod'
import {
  listRecentProjects,
  touchRecentProject,
  deleteRecentProject,
  type AppDatabase
} from '@electron-template/db'

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
export function createProjectsRoutes(db: AppDatabase) {
  const listRecent = os
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional()
        })
        .optional()
    )
    .handler(({ input }) => {
      return listRecentProjects(db, input?.limit ?? 10)
    })

  const touch = os
    .input(
      z.object({
        projectId: z.string().min(1),
        projectName: z.string().min(1)
      })
    )
    .handler(({ input }) => {
      return touchRecentProject(db, input.projectId, input.projectName)
    })

  const remove = os
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .handler(({ input }) => {
      const removed = deleteRecentProject(db, input.projectId)
      if (!removed) {
        throw new ORPCError('NOT_FOUND', {
          message: `No recent project with id "${input.projectId}"`
        })
      }
      return { success: true, projectId: input.projectId }
    })

  return {
    listRecentProjects: listRecent,
    touchRecentProject: touch,
    deleteRecentProject: remove
  }
}