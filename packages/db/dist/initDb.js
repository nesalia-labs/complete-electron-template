import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
let _db = null;
export function initDatabase(config) {
    const dbPath = join(config.dataPath, 'database.sqlite');
    mkdirSync(config.dataPath, { recursive: true });
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle({ client: sqlite });
    _db = db;
    return { sqlite, db };
}
export async function getDb() {
    if (!_db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return _db;
}
//# sourceMappingURL=initDb.js.map