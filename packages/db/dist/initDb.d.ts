import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
export interface DatabaseConfig {
    dataPath: string;
}
export declare function initDatabase(config: DatabaseConfig): {
    sqlite: Database.Database;
    db: ReturnType<typeof drizzle>;
};
export declare function getDb(): Promise<import("drizzle-orm/better-sqlite3").BetterSQLite3Database<Record<string, unknown>> & {
    $client: Database.Database;
}>;
//# sourceMappingURL=initDb.d.ts.map