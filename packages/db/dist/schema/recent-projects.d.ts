/**
 * Recent projects the user has opened. Used by the Settings → Projects panel
 * and (in PR 5+) the home screen quick-open menu.
 *
 * - `project_id`: stable opaque ID (e.g. absolute path hash, or a UUID).
 *   Unique-indexed so duplicate touches collapse into a single row and
 *   `onConflictDoUpdate` can target it directly.
 * - `project_name`: human-readable display name. Stored separately so the
 *   list can render even when the project on disk has been moved/renamed.
 * - `opened_at`: ms-precision Unix epoch (stored as INTEGER, returned as
 *   Date by Drizzle thanks to `mode: 'timestamp_ms'`). Unique-indexed so
 *   we can sort by it for the "most recent" view without a separate scan.
 *
 * PR 4 owns insert + update only. PR 5 will introduce a `projects` table
 * with FK from this `project_id` for the full project metadata.
 */
export declare const recentProjects: import("drizzle-orm/sqlite-core").SQLiteTableWithColumns<{
    name: "recent_projects";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "id";
            tableName: "recent_projects";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        projectId: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "project_id";
            tableName: "recent_projects";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        projectName: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "project_name";
            tableName: "recent_projects";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        openedAt: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "opened_at";
            tableName: "recent_projects";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "sqlite";
}>;
export type RecentProject = typeof recentProjects.$inferSelect;
export type NewRecentProject = typeof recentProjects.$inferInsert;
//# sourceMappingURL=recent-projects.d.ts.map