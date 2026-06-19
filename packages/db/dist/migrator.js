import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolveMigrationsDir } from './migrations.js';
/**
 * Apply any pending Drizzle migrations synchronously.
 * Idempotent: tracks applied migrations in `__drizzle_migrations`.
 * Safe to call on every boot.
 */
export function runMigrations(db) {
    migrate(db, { migrationsFolder: resolveMigrationsDir() });
}
//# sourceMappingURL=migrator.js.map