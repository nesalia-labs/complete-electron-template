import { createSystemRoutes } from './system/index.js';
import { createUsersRoutes } from './users/index.js';
/**
 * Aggregate all domain routers into a single router.
 * Each domain module owns its procedures and closes over the DB it needs.
 */
export function createRouter(db) {
    return {
        ...createSystemRoutes(),
        ...createUsersRoutes(db)
    };
}
//# sourceMappingURL=index.js.map