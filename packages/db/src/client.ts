import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema/index.js'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

export interface DatabaseConfig {
  dataPath: string
}

export interface DatabaseHandle {
  sqlite: Database.Database
  db: AppDatabase
}

export function initDatabase(config: DatabaseConfig): DatabaseHandle {
  mkdirSync(config.dataPath, { recursive: true })
  const dbPath = join(config.dataPath, 'database.sqlite')

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
