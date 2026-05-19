import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { users, posts } from './schema'

console.log('[DB] Module loaded')

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: Database.Database | null = null

function getDataPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'data')
}

export function initDatabase(): { sqlite: Database.Database; db: ReturnType<typeof drizzle> } {
  const dataPath = getDataPath()
  console.log('[DB] Initializing database at:', dataPath)

  try {
    mkdirSync(dataPath, { recursive: true })
  } catch (error) {
    // Directory may already exist
  }

  const dbPath = join(dataPath, 'database.sqlite')
  console.log('[DB] Opening database at:', dbPath)
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle({ client: sqlite })
  _db = db
  _sqlite = sqlite

  return { sqlite, db }
}

export async function getDb() {
  console.log('[DB] getDb called, _db is:', _db ? 'initialized' : 'null')
  if (!_db) {
    console.log('[DB] Initializing db...')
    const { db } = initDatabase()
    _db = db
  }
  return _db
}

export async function runMigrations(): Promise<void> {
  console.log('[DB] Running migrations...')

  const { sqlite } = initDatabase()

  try {
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

    console.log('[DB] Migrations completed successfully')
  } catch (error) {
    console.error('[DB] Migration failed:', error)
    throw error
  }
}