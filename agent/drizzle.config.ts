/**
 * Drizzle Kit config — schema migration generator.
 *
 * Used by the CLI commands:
 *
 *   npx drizzle-kit generate --config=./drizzle.config.ts
 *     # Reads ./db/schema.ts, emits SQL to ./db/migrations/, updates
 *     # ./db/migrations/meta/_journal.json. Commit the resulting files.
 *
 *   npx drizzle-kit migrate --config=./drizzle.config.ts
 *     # Applies pending migrations to the live Turso DB. Used by CI /
 *     # ad-hoc deploys; not the runtime path (runtime uses
 *     # `runMigrations()` in `agent/db/migrate.ts`).
 *
 *   npx drizzle-kit check --config=./drizzle.config.ts
 *     # Validates that `db/migrations/` is in sync with `db/schema.ts`.
 *     # Cheap; safe to wire into CI before `generate` so a stale
 *     # journal fails the build instead of silently overwriting it.
 *
 * `dialect: "turso"` is the dedicated Turso dialect (it tells
 * drizzle-kit to emit libSQL-compatible SQL and pull the URL/token
 * from `dbCredentials.url` / `dbCredentials.authToken`).
 *
 * `dbCredentials` here are only used by `migrate` and `push` (the
 * commands that talk to a real database). `generate` and `check` do
 * not connect.
 *
 * Credentials are read from env vars. For local generation we
 * recommend `turso db shell <name> --dump` style inspection; CI
 * uses Vercel-injected env vars. Never commit credentials.
 */
import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL ?? "file:./local-dev.sqlite";
const authToken = process.env.TURSO_AUTH_TOKEN;

export default defineConfig({
  dialect: "turso",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: authToken
    ? { url, authToken }
    : { url },
  verbose: true,
  strict: true,
});