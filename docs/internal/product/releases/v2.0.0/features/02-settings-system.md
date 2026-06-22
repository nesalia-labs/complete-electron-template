# Feature: Settings System

**Feature ID:** F2
**V2.0.0 Release:** Core
**Status:** Proposed
**Owner:** Tech Lead

---

## 1. Context

V1 has no settings. `LanguageSwitcher` is a top-bar dropdown that calls `i18n.changeLanguage()` directly — language is ephemeral (lost on reload) and lives only in the renderer's memory. V2 introduces a settings system where all preferences are persisted to `electron-store` in the main process and accessible to the renderer via the existing oRPC `MessagePort` bridge.

The settings system is the **persistence backbone** for the entire V2 app — sidebar collapse state, language, theme, and (in V2.1) project metadata all flow through it.

---

## 2. User Stories

| ID | Story |
|---|---|
| US-1 | As a user, I can change the language so that the app displays in my preferred language |
| US-2 | As a user, my language preference persists across app restarts |
| US-3 | As a user, I can switch between light and dark mode so that the app matches my visual preference |
| US-4 | As a user, I can set the theme to "system" so that the app follows my OS preference |
| US-5 | As a user, my theme preference persists across app restarts |
| US-6 | As a user, the app applies my theme before first paint so that there is no flash of wrong theme |

---

## 3. UI/UX Specification

### 3.1 Settings Page Layout

```
/settings  →  Settings Page
```

```
┌────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────────┐   │
│ │  Settings                                                  │   │
│ │  Manage your language, appearance, and preferences        │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  [Language]  [Appearance]  [Projects]                  │    │  ← Tabs
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Language                                               │    │
│  │                                                          │    │
│  │  Select your preferred language                        │    │
│  │  ┌──────────────────────────────────────────────────┐ │    │
│  │  │ English                                    ▼       │ │    │  ← NativeSelect
│  │  └──────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Appearance                                              │    │
│  │                                                          │    │
│  │  Theme                                                   │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐        │    │
│  │  │  ○ Light   │ │  ● Dark    │ │  ○ System   │        │    │  ← CardRadioGroup
│  │  │   ☀️       │ │   🌙       │ │   💻       │        │    │
│  │  └────────────┘ └────────────┘ └────────────┘        │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Components Used

| Component | Source | Role |
|---|---|---|
| `Tabs` | `pnpm ui:add tabs` (new) | Settings sections |
| `Select` / `NativeSelect` | `packages/ui` (existing) | Language picker |
| `Card` | `packages/ui` (existing) | Theme option cards |
| `RadioGroup` (styled as cards) | `packages/ui` (existing) | Theme selection |
| `Toaster` | `sonner` (existing) | "Settings saved" confirmation |
| `Switch` | `pnpm ui:add switch` (new) | Future per-feature toggles |

### 3.3 Visual States

**Theme card — default:**
```css
border: 1px solid hsl(var(--border));
background: hsl(var(--card));
color: hsl(var(--card-foreground));
```

**Theme card — selected:**
```css
border: 2px solid hsl(var(--primary));
background: hsl(var(--primary) / 0.05);
```

**Theme card — hover:**
```css
border-color: hsl(var(--primary) / 0.5);
background: hsl(var(--accent));
```

---

## 4. Functionality Specification

### 4.1 Settings Schema

```typescript
// apps/desktop/src/main/settings.ts
import Store from 'electron-store'

interface GlobalSettings {
  language: 'en' | 'fr' | 'es'
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  recentProjects: string[]   // project IDs, max 10
}

export const store = new Store<GlobalSettings>({
  name: 'config',           // writes to {userData}/config.json
  defaults: {
    language: 'en',
    theme: 'system',
    sidebarCollapsed: false,
    recentProjects: [],
  },
})
```

### 4.2 The `electron-store` Location

`electron-store` resolves the file path via `app.getPath('userData')` (Node's `path` module, available in main):

```
Windows:  %APPDATA%\{app.name}\config.json
macOS:    ~/Library/Application Support/{app.name}/config.json
Linux:    ~/.config/{app.name}/config.json
```

The `config.json` file is human-readable and easy to inspect or back up.

### 4.3 oRPC Procedures

```typescript
// packages/api/src/routes/settings.ts
import { os } from '@orpc/server'
import { z } from 'zod'
import { store } from '../main/settings.js'   // imported from desktop main (server-side only)

export const getSettings = os
  .input(
    z.object({
      keys: z.array(z.string()).optional().describe('Specific keys to retrieve'),
    })
  )
  .handler(({ input }) => {
    if (input.keys) {
      return Object.fromEntries(input.keys.map((k) => [k, store.get(k)]))
    }
    return store.store  // returns the full settings object
  })

export const updateSettings = os
  .input(
    z.object({
      key: z.string(),
      value: z.unknown(),
    })
  )
  .handler(({ input }) => {
    store.set(input.key, input.value)
    return { success: true, key: input.key, value: input.value }
  })

export const updateMultipleSettings = os
  .input(
    z.object({
      updates: z.record(z.unknown()),
    })
  )
  .handler(({ input }) => {
    Object.entries(input.updates).forEach(([key, value]) => {
      store.set(key, value)
    })
    return { success: true }
  })
```

**Note:** The oRPC procedures live in `packages/api/src/routes/settings.ts`. The `store` is imported from the desktop main process — this is safe because oRPC runs in the main process for the desktop app (the renderer connects via MessagePort to the main process's `RPCHandler`).

### 4.4 Settings Initialization Flow

```
1. App starts (Electron main process initializes)
2. electron-store reads config.json (or creates with defaults)
3. MessagePort bridge starts (start-orpc-server IPC)
4. Renderer loads → _app.tsx beforeLoad / component mounts
5. client = await initORPC()
6. settings = await client.getSettings()   ← oRPC over MessagePort
7. Apply theme: document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
8. Apply language: i18n.changeLanguage(settings.language)
9. Render app
```

**Step 7 (theme before first paint):** TanStack Router's `beforeLoad` or `_app.tsx` `onMount` must apply the theme class **before** React renders — use `useEffect` in the layout component with `document.documentElement.classList.toggle('dark', ...)`.

### 4.5 Theme Application

```typescript
// apps/web/src/routes/_app.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'   // custom hook wrapping oRPC

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const { data: settings } = useSettings()
  const theme = settings?.theme ?? 'system'

  // Apply theme class before first paint
  useEffect(() => {
    const effective = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : theme
    document.documentElement.classList.toggle('dark', effective === 'dark')
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      document.documentElement.classList.toggle('dark', mq.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <Outlet />
}
```

### 4.6 Custom Hook — `useSettings`

```typescript
// apps/web/src/hooks/useSettings.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useORPC } from '@/lib/orpc'

export function useSettings() {
  const client = useORPC()  // returns the ORPCClient, or undefined during init
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => client.getSettings(),
    enabled: !!client,
    staleTime: Infinity,  // settings are the source of truth; invalidate on mutation
  })
}

export function useUpdateSetting() {
  const client = useORPC()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      client.updateSettings({ key, value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
```

### 4.7 Settings Page Component

```tsx
// apps/web/src/routes/settings.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@electron-template/ui'
import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSetting } from '@/hooks/useSettings'
import { LanguageSelect } from '@/components/settings/language-select'
import { ThemeSelect } from '@/components/settings/theme-select'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  const updateSetting = useUpdateSetting()

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('settings.title', 'Settings')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('settings.description', 'Manage your language, appearance, and preferences')}
        </p>
      </div>

      <Tabs defaultValue="language">
        <TabsList>
          <TabsTrigger value="language">{t('settings.language', 'Language')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('settings.appearance', 'Appearance')}</TabsTrigger>
          <TabsTrigger value="projects">{t('settings.projects', 'Projects')}</TabsTrigger>
        </TabsList>

        <TabsContent value="language">
          <LanguageSelect
            value={settings?.language ?? 'en'}
            onChange={(lang) => updateSetting.mutate({ key: 'language', value: lang })}
          />
        </TabsContent>

        <TabsContent value="appearance">
          <ThemeSelect
            value={settings?.theme ?? 'system'}
            onChange={(theme) => updateSetting.mutate({ key: 'theme', value: theme })}
          />
        </TabsContent>

        <TabsContent value="projects">
          <ProjectsSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

## 5. Technical Specification

### 5.1 File Changes

| File | Action | Package |
|---|---|---|
| `apps/desktop/src/main/settings.ts` | Create — `electron-store` instance | `apps/desktop` |
| `packages/api/src/routes/settings.ts` | Create — `getSettings`, `updateSettings`, `updateMultipleSettings` | `packages/api` |
| `packages/api/src/routes/index.ts` | Aggregate settings routes | `packages/api` |
| `apps/web/src/hooks/useSettings.ts` | Create — TanStack Query hooks | `apps/web` |
| `apps/web/src/routes/settings.tsx` | Create — Settings page | `apps/web` |
| `apps/web/src/components/settings/language-select.tsx` | Create | `apps/web` |
| `apps/web/src/components/settings/theme-select.tsx` | Create | `apps/web` |
| `packages/ui/src/components/tabs.tsx` | `pnpm ui:add tabs` | `packages/ui` |
| `packages/ui/src/components/switch.tsx` | `pnpm ui:add switch` | `packages/ui` |
| `packages/ui/src/components/index.ts` | Add exports | `packages/ui` |

### 5.2 Zod Schemas for Settings Values

```typescript
// packages/api/src/routes/settings.ts
export const languageSchema = z.enum(['en', 'fr', 'es'])
export const themeSchema = z.enum(['light', 'dark', 'system'])
export const sidebarCollapsedSchema = z.boolean()
export const recentProjectsSchema = z.array(z.string()).max(10)
```

These schemas derive from `electron-store` defaults but are validated at the oRPC boundary (input validation via `os.input` is already the established pattern in this codebase).

### 5.3 TanStack Query Integration

TanStack Query is **not** in `apps/web/package.json` (the phantom dep was removed in the migration). This feature requires re-adding it — but with a real use case:

```typescript
// apps/web/package.json — add to dependencies
// "@tanstack/react-query": "^5.x"   ← NOT the phantom dep (that was SSR-query)
// The standard @tanstack/react-query for data fetching
```

The `useSettings` / `useUpdateSetting` hooks above are the canonical use case for TanStack Query in V2.

### 5.4 Migration: Move `LanguageSwitcher` to Settings

V1's `LanguageSwitcher` (top bar) must be moved:

| V1 | V2 |
|---|---|
| `LanguageSwitcher` in `__root.tsx` (top bar) | `LanguageSelect` in `/settings` tab |
| `LanguageSwitcher` calls `i18n.changeLanguage()` directly | `LanguageSelect` calls `updateSetting({ key: 'language', value })` → oRPC → `electron-store` |

The `LanguageSwitcher` component can be removed from `apps/web/src/components/LanguageSwitcher.tsx` entirely — or kept as a minimal quick-switcher in the sidebar header if desired.

### 5.5 Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Reading `electron-store` directly from the renderer | `electron-store` uses Node `fs` — not available in sandboxed renderer |
| Calling `i18n.changeLanguage()` without persisting | Language is lost on reload — violates US-2 |
| Applying theme after React renders (flash of wrong theme) | Use `useEffect` in the layout — or better: apply synchronously in `beforeLoad` |
| Storing settings in SQLite via `packages/db` | SQLite is for app data (users, posts); settings are key-value preferences |
| One `settings` table in SQLite with all settings | Mixes app data and preferences; harder to migrate than `electron-store`'s JSON |

---

## 6. Open Questions

| # | Question | Options | Impact |
|---|---|---|---|
| O1 | Re-add `@tanstack/react-query`? | A: Yes — needed for `useSettings` / `useUpdateSetting` **B:** No — direct oRPC calls with React state | A chosen (analysis); re-add with the real use case |
| O2 | Settings in SQLite vs `electron-store`? | A: `electron-store` (chosen) **B:** SQLite via `packages/db` | A — keep DB for app data, store for preferences |
| O3 | Flash of wrong theme on first paint? | A: Apply in `useEffect` in `_app.tsx` **B:** Apply in `beforeLoad` (synchronous via `document` in script) | B is better for zero-flash; worth the extra complexity |

---

## 7. Acceptance Criteria

| ID | Criterion | Testable |
|---|---|---|
| AC-1 | On app load, the theme class (`dark`) is applied before React renders | Visual: no flash of light theme when dark is set |
| AC-2 | Changing language to "Français" updates all translated strings | Visual + manual |
| AC-3 | After changing language and reloading, the language is still "Français" | Manual |
| AC-4 | Setting theme to "Dark" applies `class="dark"` to `<html>` | DevTools: `document.documentElement.classList` |
| AC-5 | Setting theme to "System" follows OS dark mode setting | Manual: toggle OS dark mode, app responds |
| AC-6 | `client.getSettings()` returns the correct full object via oRPC | Integration test |
| AC-7 | `client.updateSettings({ key, value })` persists to `config.json` | Manual: edit file, verify in app |
| AC-8 | `config.json` is human-readable JSON | Manual: open file in editor |
| AC-9 | Settings page renders with three tabs (Language / Appearance / Projects) | Manual |
| AC-10 | `pnpm --filter api test` passes with new settings procedures | CI |

---

## 8. Effort Estimate

| Phase | Tasks | Estimate |
|---|---|---|
| `electron-store` setup | Create `apps/desktop/src/main/settings.ts`, wire to `RPCHandler` | 1–2h |
| oRPC procedures | Create `packages/api/src/routes/settings.ts`, wire to AppRouter | 1h |
| TanStack Query | Re-add `@tanstack/react-query`, create `useSettings` / `useUpdateSetting` | 1–2h |
| Settings page | Create `settings.tsx`, `LanguageSelect`, `ThemeSelect` components | 2–3h |
| Theme application | Apply theme in `_app.tsx`, handle system preference listener | 1–2h |
| Migration | Remove old `LanguageSwitcher`, update i18n init flow | 1h |
| Polish | Toaster confirmations, tab animations, form validation | 1h |
| **Total** | | **8–13h** |
