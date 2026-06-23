import type { AppDatabase } from '@electron-template/db'
import { createSystemRoutes } from './system/index.js'
import { createUsersRoutes } from './users/index.js'
import { createProjectsRoutes } from './projects.js'
import { createSettingsRoutes, type AppStore } from './settings.js'

/**
 * Aggregate all domain routers into a single router.
 * Each domain module owns its procedures and closes over the dependencies it needs.
 */
export function createRouter(db: AppDatabase, store: AppStore) {
  return {
    ...createSystemRoutes(),
    ...createUsersRoutes(db),
    ...createProjectsRoutes(db),
    ...createSettingsRoutes(store)
  }
}

export type AppRouter = ReturnType<typeof createRouter>

export type { AppStore }