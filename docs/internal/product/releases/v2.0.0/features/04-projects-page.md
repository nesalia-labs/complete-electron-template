# Feature: Projects Page

**Feature ID:** F4
**V2.0.0 Release:** Core
**Status:** Proposed
**Owner:** Tech Lead

---

## 1. Context

V1's `index.tsx` is a demo page (oRPC ping + user creation). V2 replaces it with a **Projects list page** — the landing page of the app. Each project is a self-contained workspace with its own SQLite database, stored at the project's location on disk.

The Projects page demonstrates the settings system end-to-end (persistence, oRPC, theming) while providing the first real app use case: create, list, and open projects.

V2.0 is **single-workspace**: the user has one active project at a time. V2.1 adds multi-project windows.

---

## 2. User Stories

| ID | Story |
|---|---|
| US-1 | As a user, I can see a list of my recent projects so that I can quickly resume work |
| US-2 | As a user, I can create a new project so that I can start organizing my work |
| US-3 | As a user, I can open an existing project so that I can continue where I left off |
| US-4 | As a user, I can delete a project so that I can remove unwanted workspaces |
| US-5 | Each project has its own SQLite database so that data stays isolated per project |

---

## 3. UI/UX Specification

### 3.1 Projects List Page (`/`)

```
/  →  Projects List
```

```
┌────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Your Projects                                          │   │
│  │  Create and manage your workspaces                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  🔍 Search projects...                                  │     │  ← Command palette shortcut
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  Recent Projects                                        [New]  │  ← Header + action button
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  ┌─────────────────────┐  ┌──────────────────────────┐ │     │
│  │  │ 📁 Marketing Site  │  │ 📁 Analytics Dashboard  │ │     │  ← 2-column grid
│  │  │ 2 tables · 4 docs  │  │ 1 table · 12 docs       │ │     │
│  │  │ Modified 2h ago     │  │ Modified yesterday      │ │     │
│  │  │ ~/projects/marketing│  │ ~/projects/analytics   │ │     │
│  │  └─────────────────────┘  └──────────────────────────┘ │     │
│  │                                                            │     │
│  │  ┌─────────────────────────────────────────────────────┐ │     │
│  │  │  + Create new project                               │ │     │  ← Empty state / CTA
│  │  └─────────────────────────────────────────────────────┘ │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Create Project Dialog

```
┌────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Create New Project                                   ✕  │  │
│  │                                                          │  │
│  │  Name                                                    │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │ My New Project                                      │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                                                          │  │
│  │  Description (optional)                                 │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │                                                      │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                                                          │  │
│  │  Location                                                │  │
│  │  ┌─────────────────────────────────────┐ ┌────────────┐ │  │
│  │  │ ~/projects/my-new-project            │ │  Browse   │ │  │
│  │  └─────────────────────────────────────┘ └────────────┘ │  │
│  │                                                          │  │
│  │  ┌──────────────────┐  ┌───────────────────────────┐   │  │
│  │  │     Cancel       │  │      Create Project        │   │  │
│  │  └──────────────────┘  └───────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 Components Used

| Component | Source | Role |
|---|---|---|
| `Card` | `packages/ui` (existing) | Project card |
| `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | `packages/ui` (existing) | Project card sections |
| `Input` | `packages/ui` (existing) | Project name input |
| `Textarea` | `packages/ui` (existing) | Description input |
| `Button` | `packages/ui` (existing) | Create, Open, Delete |
| `Dialog` | `packages/ui` (existing) | Create project modal |
| `Command` + `CommandDialog` | `packages/ui` (existing) | Search projects via `⌘K` |
| `AlertDialog` | `packages/ui` (existing) | Delete confirmation |
| `sonner` (Toaster) | `packages/ui` (existing) | "Project created", "Project deleted" |
| `Separator` | `packages/ui` (existing) | Section dividers |
| `Badge` | `packages/ui` (existing) | Table/doc counts on project card |

---

## 4. Functionality Specification

### 4.1 Projects Table (SQLite)

```typescript
// packages/db/src/schema/projects.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id:        text('id').primaryKey(),           // nanoid — unique per project DB
  name:      text('name').notNull(),
  description: text('description'),
  dbPath:    text('db_path').notNull(),          // absolute path to this project's SQLite file
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export type Project    = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
```

The `projects` table lives in the **global settings database**, not in the per-project database. The per-project database only holds the user's content (users, posts — the existing schema).

### 4.2 Project Database Isolation

Each project has its own SQLite file at:

```
{projectRoot}/.electron-template/data.db
```

The project root is chosen by the user via a folder picker dialog. The `.electron-template/` directory is created inside the chosen folder. The `data.db` file is the per-project database.

```
~/projects/my-app/
├── .electron-template/
│   ├── config.json         ← project-level config (future)
│   └── data.db             ← per-project SQLite (Drizzle)
└── ...                     ← user's project files
```

The main process owns the active project's `initDatabase` call. When the user opens a project, the main process initializes a new `DatabaseHandle` for that project's `data.db`.

### 4.3 oRPC Procedures

```typescript
// packages/api/src/routes/projects.ts
import { os } from '@orpc/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { projects } from '@electron-template/db'

// Note: these procedures run in the *project* DB context (not the global settings DB).
// The oRPC handler needs to know which DB to use — passed via context.

// List all projects (from global settings DB)
export const listProjects = os
  .input(z.object({ search: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const { db } = context.globalDb  // global settings DB
    const rows = await db
      .select()
      .from(projects)
      .where(input.search ? like(projects.name, `%${input.search}%`) : undefined)
      .orderBy(desc(projects.updatedAt))
    return rows
  })

// Create a project
export const createProject = os
  .input(
    z.object({
      name:        z.string().min(1).max(255),
      description: z.string().optional(),
      rootPath:    z.string(),   // user-selected folder
    })
  )
  .handler(async ({ input, context }) => {
    const { db } = context.globalDb
    const id = nanoid()
    const dbPath = join(input.rootPath, '.electron-template', 'data.db')
    // Create .electron-template directory + init DB schema
    await createProjectDatabase(dbPath)
    const [project] = await db
      .insert(projects)
      .values({ id, name: input.name, description: input.description, dbPath })
      .returning()
    return project
  })

// Delete a project (does NOT delete user files — only .electron-template/)
export const deleteProject = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { db } = context.globalDb
    const [project] = await db.select().from(projects).where(eq(projects.id, input.id))
    // Remove .electron-template directory
    await rm(project.dbPath, { recursive: true })
    await db.delete(projects).where(eq(projects.id, input.id))
    return { success: true }
  })

// Open a project (set as active, update recentProjects in electron-store)
export const openProject = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const [project] = await db.select().from(projects).where(eq(projects.id, input.id))
    // Initialize this project's DB in main process
    await context.mainProcess.initProjectDb(project.dbPath)
    // Update recentProjects in electron-store
    await context.mainProcess.updateRecentProjects(input.id)
    return project
  })
```

### 4.4 Projects Page Component

```tsx
// apps/web/src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, AlertDialog, AlertDialogAction, AlertDialogCancel,
  Toaster, toast
} from '@electron-template/ui'
import { Plus, FolderOpen, Trash2, Clock } from 'lucide-react'
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects'

export const Route = createFileRoute('/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('projects.title', 'Your Projects')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('projects.description', 'Create and manage your workspaces')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('projects.new', 'New Project')}
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder={t('projects.search', 'Search projects...')}
        prefix={<span className="text-muted-foreground">⌘K</span>}
        disabled  // powered by command palette in V2.0
      />

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => setDeleteTarget(project.id)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setCreateOpen(false)}
      />

      {/* Delete Confirmation */}
      <AlertDialog>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t('projects.delete.title', 'Delete project?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('projects.delete.description', 'This will remove the project from this app. Your project files will not be deleted.')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteProject.mutate(deleteTarget)
                setDeleteTarget(null)
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </div>
  )
}
```

### 4.5 Folder Picker Integration

The "Browse" button in the Create Project dialog needs a native folder picker. In Electron, this is done via `dialog.showOpenDialog`:

```typescript
// This runs in the renderer, called from the CreateProjectDialog
// It uses the preload bridge via oRPC (no direct Node API in renderer)

export const pickFolder = os
  .input(z.object({ title: z.string() }))
  .handler(async ({ context }) => {
    // context.mainProcess is injected via the handler context
    return context.mainProcess.pickFolder()
  })
```

```typescript
// apps/desktop/src/main/index.ts  (inside the RPCHandler context)
import { dialog } from 'electron'

// Inside the oRPC handler for the desktop:
// context.mainProcess = { pickFolder, initProjectDb, updateRecentProjects }

// handler for pickFolder:
const result = await dialog.showOpenDialog(mainWindow, {
  properties: ['openDirectory', 'createDirectory'],
  title: 'Choose project location',
})
if (result.canceled) return null
return result.filePaths[0]
```

### 4.6 `useProjects` Hook

```typescript
// apps/web/src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useORPC } from '@/lib/orpc'

export function useProjects() {
  const client = useORPC()
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => client.listProjects(),
    enabled: !!client,
  })
}

export function useCreateProject() {
  const client = useORPC()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string; rootPath: string }) =>
      client.createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const client = useORPC()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.deleteProject({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
```

---

## 5. Technical Specification

### 5.1 File Changes

| File | Action | Package |
|---|---|---|
| `packages/db/src/schema/projects.ts` | Create | `packages/db` |
| `packages/db/src/schema/index.ts` | Add `projects` export | `packages/db` |
| `packages/db/drizzle/0001_<migration>.sql` | Create projects table migration | `packages/db` |
| `packages/api/src/routes/projects.ts` | Create `listProjects`, `createProject`, `deleteProject`, `openProject` | `packages/api` |
| `packages/api/src/routes/index.ts` | Aggregate projects routes | `packages/api` |
| `apps/web/src/hooks/useProjects.ts` | Create TanStack Query hooks | `apps/web` |
| `apps/web/src/routes/index.tsx` | Replace demo → Projects list | `apps/web` |
| `apps/web/src/components/projects/` | Create dialog + card components | `apps/web` |

### 5.2 Migration

```sql
-- packages/db/drizzle/0001_projects.sql
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  db_path     TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
```

### 5.3 Global vs Project DB Context

The oRPC handler needs to distinguish between two database contexts:

| Context | Database | Used for |
|---|---|---|
| `context.globalDb` | Global settings SQLite (in `userData`) | `projects` table, `electron-store` for settings |
| `context.projectDb` | Per-project SQLite (in project root) | `users`, `posts` tables (V1 schema) |

The oRPC procedures for **projects** use `globalDb`. The oRPC procedures for **users** (V1) use `projectDb`.

```typescript
// In apps/desktop/src/main/index.ts — the RPCHandler is constructed with both contexts:
const handler = new RPCHandler(router, {
  context: {
    globalDb: initDatabase({ dataPath: join(app.getPath('userData'), 'global.db') }),
    projectDb: null,  // initialized per-project on openProject
    mainProcess: { /* pickFolder, initProjectDb, updateRecentProjects */ },
  },
})
```

### 5.4 Per-Project Database Initialization

```typescript
// apps/desktop/src/main/index.ts
async function initProjectDb(dbPath: string) {
  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Run migrations against the project DB
  const handle = initDatabase({ dataPath: dbPath })
  runMigrations(handle.db)
  return handle
}
```

### 5.5 Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| All data in one SQLite file | No project isolation; can't share a project folder with git |
| Store `projects` in the per-project SQLite | If the project folder is deleted, project metadata is lost |
| Use `fs` directly in the renderer | Sandbox violation; must go through IPC/oRPC |
| Show `id` (nanoid) to the user | Cryptic; display `name` + show path as subtitle |
| Delete project files without confirmation | User may lose work; always confirm + explain |

---

## 6. Open Questions

| # | Question | Options | Impact |
|---|---|---|---|
| O1 | Create `.electron-template/` in project root? | A: Yes — isolated, gitignored **B:** In `userData` — simpler, less visible | A chosen; cleaner isolation |
| O2 | Should opening a project create a new Electron window? | A: Single window, swap DB context **B:** Multi-window | A for V2.0; B in V2.1 |
| O3 | Can a project be opened from a non-existent folder? | A: Error + prompt to recreate **B:** Auto-recreate | A for safety |

---

## 7. Acceptance Criteria

| ID | Criterion | Testable |
|---|---|---|
| AC-1 | Projects list renders with empty state on first launch | Manual |
| AC-2 | Clicking "New Project" opens the dialog | Manual |
| AC-3 | Clicking "Browse" opens a native folder picker | Manual |
| AC-4 | Creating a project creates `~/.projects/{name}/.electron-template/data.db` | Manual: check filesystem |
| AC-5 | Creating a project adds it to the projects list immediately | Manual |
| AC-6 | Deleting a project removes it from the list but keeps user files | Manual |
| AC-7 | `pnpm --filter db migrate` runs cleanly with the new migration | CI |
| AC-8 | `pnpm --filter api test` passes with the new projects procedures | CI |

---

## 8. Effort Estimate

| Phase | Tasks | Estimate |
|---|---|---|
| Schema + migration | Create `projects` table, run `pnpm db:generate` | 1h |
| oRPC procedures | `listProjects`, `createProject`, `deleteProject`, `openProject` | 2–3h |
| TanStack Query hooks | `useProjects`, `useCreateProject`, `useDeleteProject` | 1h |
| Projects page | `index.tsx` as Projects list | 2–3h |
| Dialog components | Create project dialog, delete confirmation | 1–2h |
| Folder picker | Wire `dialog.showOpenDialog` via oRPC mainProcess context | 1h |
| Empty state | Illustrated empty state + CTA | 30min |
| **Total** | | **8–11h** |
