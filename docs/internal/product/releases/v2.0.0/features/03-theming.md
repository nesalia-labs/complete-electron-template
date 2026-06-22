# Feature: Theming (Light / Dark / System)

**Feature ID:** F3
**V2.0.0 Release:** Core
**Status:** Proposed
**Owner:** Tech Lead

---

## 1. Context

V1 ships without theming. All components use shadcn's default CSS variables but no mechanism toggles them. V2 introduces a full theme system: `light`, `dark`, and `system` (follows OS preference). The toggle lives in the Settings page (`/settings`) and persists via `electron-store`.

Theming in Tailwind v4 + shadcn v4 works via **CSS custom properties** — the dark theme is a `.dark` class on `<html>` that overrides the light CSS variables with dark values. No JavaScript needed for the CSS itself; JS only toggles the class.

---

## 2. User Stories

| ID | Story |
|---|---|
| US-1 | As a user, I can set the theme to "Light" so that the app uses a light color scheme |
| US-2 | As a user, I can set the theme to "Dark" so that the app uses a dark color scheme |
| US-3 | As a user, I can set the theme to "System" so that the app follows my OS dark mode preference |
| US-4 | As a user, when I change the theme it applies immediately without a page reload |
| US-5 | As a user, there is no flash of the wrong theme when the app starts |

---

## 3. Design Specification

### 3.1 Theme Options

| Theme | CSS class | How it applies |
|---|---|---|
| Light | `class="light"` (or no class) | Default — light CSS variables apply |
| Dark | `class="dark"` | `.dark` selector overrides CSS variables |
| System | Dynamic | `class="dark"` if `prefers-color-scheme: dark`, else `class="light"` (or absent) |

**Note:** shadcn v4 defaults to `.dark` class on `<html>` for dark mode (not `data-theme`). The convention in the codebase is `.dark` — consistent with Tailwind v4's `class` dark mode strategy.

### 3.2 Theme Card UI

```
┌────────────────────────────────────────────────────────────┐
│  Theme                                                     │
│                                                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌────────────┐ │
│  │  ● Light         │ │    ○ Dark       │ │  ○ System │ │
│  │                  │ │                  │ │            │ │
│  │  ☀️              │ │    🌙            │ │    💻      │ │
│  │                  │ │                  │ │            │ │
│  │  Light mode      │ │    Dark mode     │ │    System  │ │
│  └──────────────────┘ └──────────────────┘ └────────────┘ │
│     (selected)          (not selected)    (not selected)    │
└────────────────────────────────────────────────────────────┘
```

Each card is a `<button>` styled as a `Card` with a radio input (visually hidden) for accessibility. The selected card has `border: 2px solid hsl(var(--primary))` and a subtle background tint.

### 3.3 CSS Variable Structure

```css
/* packages/ui/src/styles/globals.css */
@theme {
  /* Light defaults (the @theme block IS light) */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 3.9%);
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(0 0% 3.9%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(0 0% 3.9%);
  --color-primary: hsl(142 76% 36%);
  --color-primary-foreground: hsl(355.7 100% 97.3%);
  --color-secondary: hsl(220 14.3% 95.9%);
  --color-secondary-foreground: hsl(220.9 39.3% 11%);
  --color-muted: hsl(220 14.3% 95.9%);
  --color-muted-foreground: hsl(220 9% 46%);
  --color-accent: hsl(220 14.3% 95.9%);
  --color-accent-foreground: hsl(220.9 39.3% 11%);
  --color-destructive: hsl(0 84.2% 60.2%);
  --color-border: hsl(220 13% 91%);
  --color-input: hsl(220 13% 91%);
  --color-ring: hsl(142 76% 36%);
  --radius: 0.5rem;
}

/* Dark overrides — .dark class on <html> */
.dark {
  --color-background: hsl(0 0% 3.9%);
  --color-foreground: hsl(0 0% 98%);
  --color-card: hsl(0 0% 9.9%);
  --color-card-foreground: hsl(0 0% 98%);
  --color-popover: hsl(0 0% 9.9%);
  --color-popover-foreground: hsl(0 0% 98%);
  --color-primary: hsl(142 76% 36%);
  --color-primary-foreground: hsl(144.9 80.4% 10%);
  --color-secondary: hsl(0 0% 14.9%);
  --color-secondary-foreground: hsl(0 0% 98%);
  --color-muted: hsl(0 0% 14.9%);
  --color-muted-foreground: hsl(0 0% 63.9%);
  --color-accent: hsl(0 0% 14.9%);
  --color-accent-foreground: hsl(0 0% 98%);
  --color-destructive: hsl(0 62.8% 30.6%);
  --color-border: hsl(0 0% 14.9%);
  --color-input: hsl(0 0% 14.9%);
  --color-ring: hsl(142 76% 36%);
}
```

**These values are shadcn's defaults.** V2 uses them as-is. The only customization expected in V2 is possibly adjusting the `primary` hue — everything else comes from the shadcn defaults.

---

## 4. Functionality Specification

### 4.1 Theme Resolution Logic

```typescript
// apps/web/src/lib/theme.ts
export type Theme = 'light' | 'dark' | 'system'

export function getEffectiveTheme(stored: Theme): 'light' | 'dark' {
  if (stored === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return stored
}

export function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  document.documentElement.classList.toggle('dark', effective === 'dark')
}
```

### 4.2 Theme Application Timing

The critical requirement is **no flash of wrong theme on first paint**. This requires:

1. **SSR-aware** (if SSR is re-adopted later): the class must be in the initial HTML response, not injected by JS
2. **CSR** (current): the class must be applied **synchronously** on the first render, before any content is painted

```tsx
// apps/web/src/routes/_app.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    // Load settings before the route loads — runs before first render
    const settings = await context.settings  // injected via router context
    return { settings }
  },
  component: AppLayout,
})

function AppLayout() {
  const { settings } = Route.useRouteContext()
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(
    settings?.theme ?? 'system'
  )

  // Synchronous effect: runs before paint (no dependency array = runs immediately)
  // This is the FIRST effect that runs, before any children render
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for OS dark mode changes when "system" is selected
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <Outlet />
}
```

### 4.3 System Theme Changes

When the user changes OS dark mode while the app is open and theme is set to "System":

```typescript
// The useEffect above handles this:
// mq.addEventListener('change', handler) → calls applyTheme('system')
// applyTheme('system') re-reads prefers-color-scheme and toggles .dark
```

No IPC needed — `prefers-color-scheme` is read from the renderer process.

### 4.4 Theme Select Component

```tsx
// apps/web/src/components/settings/theme-select.tsx
import { useTranslation } from 'react-i18next'
import { type Theme } from '@/lib/theme'
import { Sun, Moon, Monitor } from 'lucide-react'

interface ThemeSelectProps {
  value: Theme
  onChange: (theme: Theme) => void
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
  { value: 'dark',  label: 'Dark',  icon: <Moon className="h-5 w-5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-5 w-5" /> },
]

export function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">{t('settings.theme', 'Theme')}</label>
      <div className="grid grid-cols-3 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
              value === opt.value
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
            )}
          >
            {opt.icon}
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-xs text-muted-foreground">
              {t(`settings.theme.${opt.value}`, opt.label)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

### 4.5 Tailwind v4 Dark Mode Configuration

Tailwind v4 uses the `class` strategy by default (no config needed):

```js
// apps/web/vite.config.ts — no darkMode config needed in v4
// v4 infers dark mode from .dark class on <html>
```

In Tailwind v4, dark mode is configured via CSS, not JS:

```css
/* In globals.css — dark mode class strategy */
@custom-variant dark (&:where(.dark, .dark *));
```

This means any element with `.dark` on an ancestor gets dark styles applied. No `dark:` class needed in HTML — it's automatic.

---

## 5. Technical Specification

### 5.1 Files to Create / Modify

| File | Action | Note |
|---|---|---|
| `apps/web/src/lib/theme.ts` | Create | `getEffectiveTheme`, `applyTheme` |
| `apps/web/src/routes/_app.tsx` | Modify | Apply theme in beforeLoad / useEffect |
| `apps/web/src/components/settings/theme-select.tsx` | Create | Theme card grid |
| `packages/ui/src/styles/globals.css` | Verify | `.dark` override block exists (shadcn adds it) |

### 5.2 Tailwind v4 Dark Mode Setup

Tailwind v4 changed dark mode compared to v3. Verify in `apps/web/src/styles.css`:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

If this line is absent, add it. This tells Tailwind to apply `dark:` styles when `.dark` is present on `<html>`.

### 5.3 Dark Mode Flash Prevention (Advanced)

For zero-flash, the theme class should ideally be set before React hydrates:

```html
<!-- apps/web/index.html — inline script before React loads -->
<script>
  // Read from localStorage (renderer-only) or a cookie set by main
  // document.documentElement.classList.toggle('dark', isDark)
</script>
```

This is only needed if the SSR story (C3 deferred) is re-adopted. For pure CSR (current), `useEffect` in `_app.tsx` is sufficient — the first JS runs before CSS paints anything meaningful.

### 5.4 Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| `data-theme="dark"` instead of `.dark` class | shadcn v4 uses `.dark` class convention; inconsistent with the component library |
| `import('electron-store')` in renderer | Node API not available in sandbox; must go through oRPC |
| `document.body.classList.toggle('dark', ...)` | The class must be on `<html>`, not `<body>`, to affect all CSS variables |
| Storing the *effective* theme (`'dark'`) instead of the user's choice (`'system'`) | If user chooses "System" and switches OS dark mode, the setting should stay "System" and re-resolve |
| `setTimeout` to apply theme after mount | Introduces a visible flash; use `useEffect` with no dependency array instead |

---

## 6. Open Questions

| # | Question | Options | Impact |
|---|---|---|---|
| O1 | Flash prevention for first paint | A: `useEffect` in `_app.tsx` (sufficient for CSR) **B:** Inline `<script>` in `index.html` (zero-flash, even for SSR) | A for now; B when SSR is re-adopted |
| O2 | Custom primary color? | A: Keep shadcn default green **B:** Allow customization in settings | B in V2.1 |
| O3 | Respect `prefers-reduced-motion`? | A: Yes **B:** No | Not in V2.0 scope |

---

## 7. Acceptance Criteria

| ID | Criterion | Testable |
|---|---|---|
| AC-1 | `<html class="dark">` is present after app loads with "Dark" theme | DevTools: `document.documentElement.classList.contains('dark')` |
| AC-2 | `<html class="dark">` is absent after app loads with "Light" theme | DevTools |
| AC-3 | Setting theme to "Dark" applies `.dark` class immediately (no reload) | Manual |
| AC-4 | Switching OS dark mode while "System" is selected updates the app | Manual: toggle OS dark mode |
| AC-5 | No flash of wrong theme on cold start | Visual: observe first paint |
| AC-6 | All shadcn components respect the dark theme | Visual: check Button, Card, Dialog, DropdownMenu in dark mode |
| AC-7 | `pnpm --filter web build` produces CSS with both light and dark variables | Manual: inspect built CSS |
| AC-8 | TanStack DevTools panel also respects dark mode | Visual |

---

## 8. Effort Estimate

| Phase | Tasks | Estimate |
|---|---|---|
| CSS setup | Verify/confirm `.dark` class + Tailwind v4 dark mode variant | 30min |
| `theme.ts` | Create `getEffectiveTheme`, `applyTheme` | 30min |
| `_app.tsx` integration | Apply theme in `beforeLoad` + OS listener `useEffect` | 1h |
| `ThemeSelect` | Create theme card grid component | 1–2h |
| Testing | Manual: light/dark/system all work; OS toggle | 1h |
| **Total** | | **4–5h** |
