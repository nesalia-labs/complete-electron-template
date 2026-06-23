export { initDatabase, closeSqlite } from './client.js';
export type { AppDatabase, DatabaseConfig, DatabaseHandle } from './client.js';
export { runMigrations } from './migrator.js';
export { users, posts, recentProjects } from './schema/index.js';
export { listRecentProjects, touchRecentProject, deleteRecentProject } from './schema/index.js';
export type { User, NewUser, Post, NewPost, RecentProject, NewRecentProject } from './schema/index.js';
//# sourceMappingURL=index.d.ts.map