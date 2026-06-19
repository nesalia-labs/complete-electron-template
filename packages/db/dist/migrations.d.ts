/**
 * Returns the absolute path to the bundled `drizzle/` migrations folder.
 *
 * In dev (pnpm symlink to source), `import.meta.url` points at `src/migrations.ts`
 * and the returned path resolves to `packages/db/drizzle/`.
 * In packaged builds, `import.meta.url` points at `dist/migrations.js` and the
 * returned path resolves to `packages/db/dist/drizzle/` (populated by the
 * `scripts/copy-drizzle.mjs` build step).
 */
export declare function resolveMigrationsDir(): string;
//# sourceMappingURL=migrations.d.ts.map