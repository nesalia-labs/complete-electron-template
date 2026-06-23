import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;
export interface DatabaseConfig {
    dataPath: string;
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
    backup?: boolean;
}
export interface DatabaseHandle {
    sqlite: Database.Database;
    db: AppDatabase;
}
export declare function initDatabase(config: DatabaseConfig): DatabaseHandle;
export declare function closeSqlite(handle: DatabaseHandle): void;
//# sourceMappingURL=client.d.ts.map