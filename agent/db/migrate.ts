/**
 * Startup migration runner.
 *
 * Called once at agent boot from `agent.ts` (or from any other entry
 * point that needs the schema applied). Uses Drizzle's libSQL migrator
 * (`drizzle-orm/libsql/migrator`) which reads the SQL files from
 * `agent/db/migrations/` (populated by `drizzle-kit generate`) and
 * applies any that have not yet been recorded in `__drizzle_migrations`.
 *
 * Idempotent: Drizzle tracks applied migrations by hash. Calling
 * `runMigrations` on every boot is the documented pattern; the migrator
 * no-ops if there's nothing pending.
 *
 * Path resolution: `import.meta.url` is used to locate the migrations
 * directory relative to this file. In dev (pnpm workspace, file
 * unchanged) the resolved path is `agent/db/migrations/`. After
 * `eve build` the file is bundled by Nitro and the migrations live
 * alongside the source — the same `dirname(...)` trick works because
 * the build copies `migrations/` to the output.
 *
 * Errors are propagated. Migration failure must crash the boot; a
 * partial schema with stale state is worse than no deploy at all.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { AppDatabase } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The migrations directory is a sibling of this file. In the source
 * tree that resolves to `agent/db/migrations/`; in a Nitro build the
 * build pipeline copies `migrations/` next to the entry so the same
 * relative path resolves correctly.
 */
const migrationsFolder = join(__dirname, "migrations");

/**
 * Applies any pending migrations. Safe to call on every boot.
 *
 * @param db The Drizzle-wrapped Turso client from `getDb()`.
 */
export async function runMigrations(db: AppDatabase): Promise<void> {
  // eslint-disable-next-line no-console -- intentional: migration progress is a deploy signal
  console.log(`[agent/db] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console -- intentional: migration progress is a deploy signal
  console.log("[agent/db] migrations applied");
}