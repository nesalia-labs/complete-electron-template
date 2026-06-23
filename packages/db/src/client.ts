import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema/index.js'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

export interface DatabaseConfig {
  dataPath: string
  /**
   * If `true`, copy the existing database file (if any) to
   * `<dataPath>/database.sqlite.backup` before opening it.
   *
   * This is a last-resort safety net for the desktop app: if the main
   * database file gets corrupted between sessions (e.g. process killed
   * mid-write, OS crash), the renderer can be pointed at the `.backup`
   * file to recover the user's recent projects. The copy happens before
   * better-sqlite3 opens the file, so it's a pure filesystem operation
   * with no concurrency concerns.
   *
   * Off by default — opt-in from the desktop main process only.
   */
  backup?: boolean
}

export interface DatabaseHandle {
  sqlite: Database.Database
  db: AppDatabase
}

export function initDatabase(config: DatabaseConfig): DatabaseHandle {
  mkdirSync(config.dataPath, { recursive: true })
  const dbPath = join(config.dataPath, 'database.sqlite')

  if (config.backup && existsSync(dbPath)) {
    // Best-effort copy. If the backup fails (disk full, perms), we don't
    // want to abort startup — the main DB is still good. Swallow errors
    // and let the caller observe via logs if they care.
    try {
      copyFileSync(dbPath, `${dbPath}.backup`)
    } catch {
      // Backup is advisory; safe to ignore.
    }
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle({ client: sqlite, schema })
  return { sqlite, db }
}

export function closeSqlite(handle: DatabaseHandle): void {
  try {
    handle.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // WAL checkpoint can fail on already-closed or read-only connections; safe to ignore.
  }
  handle.sqlite.close()
}