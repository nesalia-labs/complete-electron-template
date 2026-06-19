import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Returns the absolute path to the bundled `drizzle/` migrations folder.
 *
 * In dev (pnpm symlink to source), `import.meta.url` points at `src/migrations.ts`
 * and the returned path resolves to `packages/db/drizzle/`.
 * In packaged builds, `import.meta.url` points at `dist/migrations.js` and the
 * returned path resolves to `packages/db/dist/drizzle/` (populated by the
 * `scripts/copy-drizzle.mjs` build step).
 */
export function resolveMigrationsDir(): string {
  return resolve(here, '../drizzle')
}
