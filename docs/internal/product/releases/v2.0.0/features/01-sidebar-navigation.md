# Feature: Sidebar Navigation

**Feature ID:** F1
**V2.0.0 Release:** Core
**Status:** Proposed
**Owner:** Tech Lead

---

## 1. Context

V1 ships with a single-page demo: `__root.tsx` (top-bar + `Outlet`) + `index.tsx` (demo content). V2 needs a real app shell — a persistent sidebar that provides navigation to the app's sections. The sidebar must feel like a product (Linear, VS Code, Raycast), not a template.

TanStack Router v1 supports **layout routes** natively via file-based routing conventions. shadcn v4 (`shadcn 4.7.0`, already in use) ships a **first-party `Sidebar` component** that handles collapsible, resize, icon-only mode, overlay, and tooltip states.

---

## 2. User Stories

| ID | Story |
|---|---|
| US-1 | As a user, I can see a persistent sidebar on the left so that I can navigate between app sections without using the browser back button |
| US-2 | As a user, I can collapse the sidebar to icon-only mode so that I have more screen space for content |
| US-3 | As a user, hovering over a collapsed icon shows a tooltip with the section name |
| US-4 | As a user, I can see my active route highlighted in the sidebar |
| US-5 | As a user, I can open the command palette with `⌘K` / `Ctrl+K` to navigate without using the mouse |
| US-6 | As a user, the sidebar state (collapsed/expanded) persists across sessions |

---

## 3. UI/UX Specification

### 3.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ __root.tsx                                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ _app.tsx                                                │  │
│  │  ┌──────────┬──────────────────────────────────────┐  │  │
│  │  │          │                                       │  │  │
│  │  │          │  ┌─────────────────────────────────┐  │  │  │
│  │  │ _sidebar │  │ _sidebar (content slot)         │  │  │  │
│  │  │  .tsx    │  │  └── index.tsx (route content)  │  │  │  │
│  │  │          │  └─────────────────────────────────┘  │  │  │
│  │  │  (fixed) │                                       │  │  │
│  │  └──────────┴──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

- `__root.tsx` stays at the top of the tree — it owns the TanStack Devtools shell and must not be inside a collapsible layout
- `_app.tsx` initializes settings (language, theme) and wraps the sidebar + content
- `_sidebar.tsx` is the sidebar layout route — it renders `<Sidebar>` and `<Outlet />` in its content slot
- Content area (`<Outlet />`) scrolls independently of the sidebar

### 3.2 Sidebar Dimensions

| State | Width |
|---|---|
| Expanded | `240px` |
| Collapsed (icon-only) | `48px` |
| Desktop threshold | `≥ 1024px` (sidebar visible) |
| Mobile threshold | `< 768px` (sidebar becomes overlay drawer) |

### 3.3 Sidebar Sections

```
┌──────────────────────────────┐
│  ┌────────────────────────┐   │  ← SidebarHeader (app logo + name)
│  │  ⚡ Electron App       │   │
│  └────────────────────────┘   │
│                               │
│  Navigation                   │  ← Section: "Navigation"
│  ┌────────────────────────┐   │
│  │  🏠 Projects    [1/]  │   │  ← Active state: filled bg + text-primary
│  │  ⚙️ Settings    [/]   │   │
│  └────────────────────────┘   │
│                               │
│  ─────────────────────────    │  ← Separator
│                               │
│  Recent Projects              │  ← Section: "Recent Projects" (collapsible)
│  ┌────────────────────────┐   │
│  │  ▶ Marketing Site  [▼]│   │  ← Collapsible section
│  │    • Dashboard        │   │     (future: project sub-nav)
│  │    • Analytics        │   │
│  └────────────────────────┘   │
│                               │
│  ─────────────────────────    │
│  User Avatar + Name           │  ← SidebarFooter
│  ┌────────────────────────┐   │
│  │  👤 Martin            │   │
│  │  Open Settings         │   │
│  └────────────────────────┘   │
└──────────────────────────────┘
```

### 3.4 Components Used

| Component | Source | Role |
|---|---|---|
| `Sidebar` | `pnpm ui:add sidebar` (shadcn v4) | Shell: resize, collapse, overlay, slots |
| `SidebarHeader` | shadcn `Sidebar` slot | App name + logo |
| `SidebarContent` | shadcn `Sidebar` slot | Navigation items |
| `SidebarFooter` | shadcn `Sidebar` slot | User info |
| `SidebarNav` | `Nav` built with `Button` variants | Navigation links |
| `Collapsible` | Existing in `packages/ui` | Recent projects section |
| `ScrollArea` | Existing in `packages/ui` | Sidebar content scroll |
| `Separator` | Existing in `packages/ui` | Section dividers |
| `Avatar` | Existing in `packages/ui` | User avatar |
| `Tooltip` | `pnpm ui:add tooltip` (needed) | Icon-only mode labels |
| `Command` + `CommandDialog` | Existing (`cmdk` dep) | `⌘K` palette |

### 3.5 Navigation Items

| Label | Icon | Route | Active indicator |
|---|---|---|---|
| Projects | `Home` (Lucide) | `/` | Filled bg `bg-accent text-accent-foreground` |
| Settings | `Settings` (Lucide) | `/settings` | Same |

### 3.6 Visual States

**Sidebar item default:**
```css
/* text-muted-foreground */
color: hsl(var(--muted-foreground));
```

**Sidebar item hover:**
```css
/* bg-accent text-accent-foreground */
background-color: hsl(var(--accent));
color: hsl(var(--accent-foreground));
```

**Sidebar item active:**
```css
/* bg-primary text-primary-foreground */
background-color: hsl(var(--primary));
color: hsl(var(--primary-foreground));
```

**Collapsed mode:**
- Only icons visible
- Labels hidden (`hidden` class)
- Tooltip shown on hover via Radix `Tooltip`
- Tooltip positioned right of icon

---

## 4. Functionality Specification

### 4.1 Routing Architecture

```typescript
// apps/web/src/routes/
__root.tsx                              // TanStack Devtools (unchanged)
_app.tsx                                // Shell: settings init, theme/i18n, layout
_sidebar.tsx                            // Layout route: <Sidebar> + <Outlet />
  index.tsx                             // /  → Projects list
  settings.tsx                          // /settings  → Settings page
  projects.$id.tsx                      // /projects/:id  → V2.1
```

TanStack Router convention: `_` prefix on the directory name creates a **layout route group**. The layout wraps all child routes without adding a path segment.

### 4.2 Sidebar Collapse State

State lives in `_sidebar.tsx` via `useState(false)`:
- `false` = expanded (240px)
- `true` = collapsed (48px, icon-only)

Persisted to `electron-store`:
```typescript
// apps/desktop/src/main/settings.ts
interface GlobalSettings {
  language: 'en' | 'fr' | 'es'
  theme: 'light' | 'dark' | 'system'
  recentProjects: string[]
  sidebarCollapsed: boolean   // ← NEW
}
```

### 4.3 Command Palette Integration

`cmdk` is already a dep. `Command` and `CommandDialog` components exist in `packages/ui`.

Commands exposed in V2.0:

| Command | Action |
|---|---|
| `Go to Projects` | Navigate to `/` |
| `Go to Settings` | Navigate to `/settings` |
| `Toggle Sidebar` | Toggle collapsed state |
| `Switch to Light Mode` | Update theme setting |
| `Switch to Dark Mode` | Update theme setting |
| `Switch to System Theme` | Update theme setting |

Implementation:
- `CommandDialog` with `open` state in `_app.tsx`
- `useEffect` in `_app.tsx` listening for `keydown` (`⌘K` / `Ctrl+K`)
- Navigation via `useNavigate` from `@tanstack/react-router`
- Theme/language mutations via `useMutation` from `@tanstack/react-query` (or direct `client.updateSettings()`)

### 4.4 URL Schema

| Route | Description |
|---|---|
| `/` | Projects list (V2.0 landing) |
| `/settings` | Settings page |
| `/projects/:id` | Project detail (V2.1) |
| `/projects/:id/*` | Project-specific routes (V2.1) |

---

## 5. Technical Specification

### 5.1 File Changes

| File | Action | Package |
|---|---|---|
| `apps/web/src/routes/_app.tsx` | Create — app shell, settings init | `apps/web` |
| `apps/web/src/routes/_sidebar.tsx` | Create — layout route, Sidebar component | `apps/web` |
| `apps/web/src/routes/index.tsx` | Modify — migrate demo → Projects list | `apps/web` |
| `apps/web/src/routes/settings.tsx` | Create — Settings page | `apps/web` |
| `packages/ui/src/components/sidebar.tsx` | `pnpm ui:add sidebar` | `packages/ui` |
| `packages/ui/src/components/tooltip.tsx` | `pnpm ui:add tooltip` | `packages/ui` |
| `packages/ui/src/components/index.ts` | Add exports | `packages/ui` |
| `apps/web/src/routes/__root.tsx` | Simplify — move devtools here only | `apps/web` |
| `apps/desktop/src/main/settings.ts` | Add `sidebarCollapsed` to `GlobalSettings` | `apps/desktop` |

### 5.2 Route Tree Generation

After creating `_app.tsx` and `_sidebar.tsx`, regenerate the route tree:

```bash
pnpm --filter web dev
```

TanStack Router's Vite plugin will regenerate `routeTree.gen.ts` automatically.

### 5.3 Sidebar Component API (shadcn v4)

shadcn v4 `Sidebar` exposes:

```typescript
// packages/ui/src/components/sidebar.tsx (generated by shadcn)
interface SidebarProps {
  defaultCollapsed?: boolean
  collapsed?: boolean       // controlled
  onCollapsedChange?: (collapsed: boolean) => void
  children: React.ReactNode
  className?: string
}
```

Key sub-components (slots):
- `Sidebar.Header` — app branding
- `Sidebar.Content` — scrollable nav area
- `Sidebar.Footer` — user section
- `Sidebar.Nav` — nav items wrapper
- `Sidebar.Section` — collapsible nav section
- `Sidebar.Toggle` — collapse toggle button (or use `SidebarTrigger`)

### 5.4 TanStack Router Layout Route Pattern

```tsx
// apps/web/src/routes/_sidebar.tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarNav } from '@electron-template/ui'
import { Home, Settings } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@electron-template/ui'

export const Route = createFileRoute('/_app/_sidebar')({
  component: SidebarLayout,
})

function SidebarLayout() {
  const { sidebarCollapsed } = Route.useSearch()  // or from zustand
  return (
    <Sidebar defaultCollapsed={sidebarCollapsed}>
      <SidebarHeader>
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav>
          <NavLink to="/" icon={Home}>Projects</NavLink>
          <NavLink to="/settings" icon={Settings}>Settings</NavLink>
        </SidebarNav>
        {/* Recent projects section — collapsible */}
      </SidebarContent>
      <SidebarFooter>
        <UserSection />
      </SidebarFooter>
    </Sidebar>
  )
}
```

### 5.5 Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Sidebar state in React context without persistence | Lost on page reload; user must collapse again |
| `Sidebar` in `__root.tsx` | Devtools must stay at the top; sidebar should be collapsible without hiding them |
| `Link` from `react-router` instead of TanStack Router | Breaks `beforeLoad` hooks and loader data on the target route |
| Navigation items as `button` elements | No URL, no browser history, no `⌘+click` to open in new tab |
| Hardcoded `240px` instead of CSS variable | Inconsistent with shadcn's CSS variable system |

---

## 6. Open Questions

| # | Question | Options | Impact |
|---|---|---|---|
| O1 | Where does sidebar collapse state live? | A: `electron-store` (persisted) **B:** `zustand` in renderer (ephemeral) | A chosen in analysis — settings should survive restarts |
| O2 | Should the sidebar show a resize handle or just a collapse toggle? | A: Toggle only **B:** Resize handle (VS Code style) | Toggle only for V2.0 — resize adds complexity |
| O3 | Should recent projects be per-user or per-project? | A: Per-user (all recent projects across workspaces) **B:** Per-project | Per-user for V2.0 |

---

## 7. Acceptance Criteria

| ID | Criterion | Testable |
|---|---|---|
| AC-1 | Navigating to `/` renders the Projects list with the sidebar visible | Manual |
| AC-2 | Navigating to `/settings` renders the Settings page | Manual |
| AC-3 | Active route is visually highlighted in the sidebar | Visual |
| AC-4 | Clicking the collapse toggle reduces the sidebar to icon-only mode | Manual |
| AC-5 | Hovering over a collapsed icon shows a tooltip with the section name | Manual |
| AC-6 | Pressing `⌘K` / `Ctrl+K` opens the command palette | Manual |
| AC-7 | Selecting "Go to Settings" in the command palette navigates to `/settings` | Manual |
| AC-8 | After collapsing the sidebar, reloading the page keeps it collapsed | Manual |
| AC-9 | `pnpm --filter web typecheck` passes with the new route tree | CI |
| AC-10 | `pnpm --filter web build` succeeds with the new route tree | CI |

---

## 8. Effort Estimate

| Phase | Tasks | Estimate |
|---|---|---|
| Setup | Create `_app.tsx`, `_sidebar.tsx`, `pnpm ui:add sidebar tooltip` | 1–2h |
| Sidebar shell | Render sidebar with nav items, collapse toggle, Tooltip | 2–3h |
| Command palette | Wire `⌘K` listener, add commands, integrate navigation | 1–2h |
| Persistence | Persist collapse state to `electron-store` via oRPC | 1h |
| Polish | Active states, mobile overlay mode, keyboard nav | 1h |
| **Total** | | **6–9h** |
