import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

let _db: ReturnType<typeof drizzle> | null = null

function getDataPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'data')
}

export function initDatabase(): { sqlite: Database.Database; db: ReturnType<typeof drizzle> } {
  const dataPath = getDataPath()
  mkdirSync(dataPath, { recursive: true })

  const dbPath = join(dataPath, 'database.sqlite')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle({ client: sqlite })
  _db = db

  return { sqlite, db }
}

export async function getDb() {
  if (!_db) {
    const { db } = initDatabase()
    _db = db
  }
  return _db
}

export async function runMigrations(): Promise<void> {
  const { sqlite } = initDatabase()

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)
}