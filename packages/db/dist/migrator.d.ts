import type { AppDatabase } from './client.js';
/**
 * Apply any pending Drizzle migrations synchronously.
 * Idempotent: tracks applied migrations in `__drizzle_migrations`.
 * Safe to call on every boot.
 */
export declare function runMigrations(db: AppDatabase): void;
//# sourceMappingURL=migrator.d.ts.map