import { createSystemRoutes } from './system/index.js';
import { createUsersRoutes } from './users/index.js';
import { createSettingsRoutes } from './settings.js';
/**
 * Aggregate all domain routers into a single router.
 * Each domain module owns its procedures and closes over the dependencies it needs.
 */
export function createRouter(db, store) {
    return {
        ...createSystemRoutes(),
        ...createUsersRoutes(db),
        ...createSettingsRoutes(store)
    };
}
//# sourceMappingURL=index.js.map