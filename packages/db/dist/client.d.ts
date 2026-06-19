import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;
export interface DatabaseConfig {
    dataPath: string;
}
export interface DatabaseHandle {
    sqlite: Database.Database;
    db: AppDatabase;
}
export declare function initDatabase(config: DatabaseConfig): DatabaseHandle;
export declare function closeSqlite(handle: DatabaseHandle): void;
//# sourceMappingURL=client.d.ts.map