import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initDatabase,
  closeSqlite,
  type DatabaseHandle
} from '../src/client.js'
import { runMigrations } from '../src/migrator.js'

/**
 * Per-test context: an isolated database on a tmp directory with migrations applied.
 * Tests can use `ctx.handle.db` for direct Drizzle access.
 */
export interface DBTestContext {
  dataPath: string
  handle: DatabaseHandle
  cleanup: () => void
}

export function createDBTestContext(): DBTestContext {
  const dataPath = mkdtempSync(join(tmpdir(), 'db-test-'))
  const handle = initDatabase({ dataPath })
  runMigrations(handle.db)

  return {
    dataPath,
    handle,
    cleanup: () => {
      try { closeSqlite(handle) } catch { /* idempotent */ }
      try { rmSync(dataPath, { recursive: true, force: true }) } catch { /* idempotent */ }
    }
  }
}
