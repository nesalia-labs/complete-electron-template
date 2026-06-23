import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema/index.js';
export function initDatabase(config) {
    mkdirSync(config.dataPath, { recursive: true });
    const dbPath = join(config.dataPath, 'database.sqlite');
    if (config.backup && existsSync(dbPath)) {
        // Best-effort copy. If the backup fails (disk full, perms), we don't
        // want to abort startup — the main DB is still good. Swallow errors
        // and let the caller observe via logs if they care.
        try {
            copyFileSync(dbPath, `${dbPath}.backup`);
        }
        catch {
            // Backup is advisory; safe to ignore.
        }
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('busy_timeout = 5000');
    const db = drizzle({ client: sqlite, schema });
    return { sqlite, db };
}
export function closeSqlite(handle) {
    try {
        handle.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    }
    catch {
        // WAL checkpoint can fail on already-closed or read-only connections; safe to ignore.
    }
    handle.sqlite.close();
}
//# sourceMappingURL=client.js.map