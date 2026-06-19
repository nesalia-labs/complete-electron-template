---
name: monorepo-structure
description: pnpm workspace structure with 5 packages: desktop, web, api, db, sdk
type: project
---

# Monorepo Structure

**Workspace packages:**
```
apps/desktop    → Electron main process + preload
apps/web        → TanStack Start web app (React 19)
packages/api    → oRPC server router with Zod schemas
packages/db     → Drizzle ORM + better-sqlite3
packages/sdk    → Shared SDK (re-exports AppRouter type)
```

**Dependency flow:**
```
apps/web ──────► packages/sdk ──────► packages/api
                                     │
                                     ▼
                                  packages/db

apps/desktop ──► packages/api ◄─────── packages/db
                  │
                  ▼
              packages/sdk
```

**Entry points:**
- `apps/desktop/src/main/index.ts` — Electron main
- `apps/desktop/src/preload/index.ts` — Preload bridge
- `apps/web/src/main.tsx` — Web entry
- `packages/api/src/router.ts` — oRPC procedures
- `packages/db/src/initDb.ts` — DB init