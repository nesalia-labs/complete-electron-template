/**
 * Turso (libSQL-over-HTTP) client for the v2 issue-triage agent's state
 * backend.
 *
 * Why HTTP (`@libsql/client/http`) and not the Node-native `@libsql/client`:
 * Vercel's Node runtime is fine with native modules, but the agent's
 * self-imposed constraint (see the v2 design doc, Decision 1) is "fetch
 * only, no native deps". `@libsql/client/http` is exactly the Turso
 * HTTP transport — it talks to Turso's `https://<db>.turso.io/v2/...`
 * endpoint with `fetch`, no `libsql` / `better-sqlite3` / native addon.
 * The `drizzle-orm/libsql/http` adapter consumes that client directly.
 *
 * `getDb()` is the single access point. It's async (Turso's
 * `createClient` returns a Client synchronously but we wrap the
 * connection bootstrap to keep the call site simple), throws a clear
 * error if env vars are missing, and memoizes the wrapped Drizzle
 * instance so subsequent calls reuse the same connection.
 *
 * Env vars (set on Vercel):
 *   - `TURSO_DATABASE_URL` — `libsql://<db>-<org>.turso.io`
 *   - `TURSO_AUTH_TOKEN`   — long-lived JWT from `turso db tokens create`
 *
 * No silent fallback: the design doc is explicit that "the code should
 * fail gracefully if env vars are missing (clear error, not silent
 * fallback)". A misconfigured deploy must not silently lose state.
 */
import { createClient, type Client } from "@libsql/client/http";
import { drizzle } from "drizzle-orm/libsql/http";
import * as schema from "./schema.js";

/**
 * The Drizzle-wrapped Turso client. We infer the type rather than
 * importing `LibSQLDatabase` from `drizzle-orm/libsql/http` (not
 * re-exported in the public API surface) — `drizzle(client, { schema })`
 * returns the schema-bound DB type and `ReturnType<typeof drizzle<...>>`
 * captures it.
 */
export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let cached: Promise<AppDatabase> | null = null;

/**
 * Returns the Drizzle-wrapped Turso client. Memoizes the wrapped DB
 * across calls within the same Node process so the connection is
 * reused (libSQL clients are stateless HTTP so memoization is purely
 * a setup-cost optimization).
 *
 * Throws a clear, actionable error if either env var is missing —
 * callers (the dispatcher's no-op short-circuit, the tools' first
 * read) get a message that names the missing variable rather than a
 * downstream "ECONNREFUSED" or empty result set.
 */
export function getDb(): Promise<AppDatabase> {
  if (cached) return cached;
  cached = (async (): Promise<AppDatabase> => {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error(
        "Turso state backend not configured: missing `TURSO_DATABASE_URL`. " +
          "Create a Turso database (`turso db create <name>`) and set the " +
          "URL on Vercel.",
      );
    }
    if (!authToken) {
      throw new Error(
        "Turso state backend not configured: missing `TURSO_AUTH_TOKEN`. " +
          "Mint a long-lived token (`turso db tokens create <db>`) and set " +
          "it on Vercel.",
      );
    }
    const client: Client = createClient({ url, authToken });
    return drizzle(client, { schema });
  })();
  return cached;
}

/** Re-export the schema so `getDb()` consumers can import table defs from one place. */
export { issueTriageState, triageConfig } from "./schema.js";
export type {
  IssueTriageStateRow,
  NewIssueTriageStateRow,
  TriageConfigRow,
  NewTriageConfigRow,
} from "./schema.js";