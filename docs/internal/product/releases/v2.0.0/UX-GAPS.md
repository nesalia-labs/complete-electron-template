# V2.0.0 — UX Gap Analysis

**Date:** 2026-06-22
**Author:** Tech Lead
**Source:** First-principles UX audit against `complete-electron-template` V2.0.0 feature specs
**Status:** Working document — to be expanded by UX auditor agent

---

## Overview

The V2.0.0 feature specs define *what the app does* (routes, procedures, schemas, components) but not *how it feels*. This document catalogues every UX gap: loading states, error states, empty states, transitions, micro-interactions, keyboard interactions, accessibility, and onboarding.

**Philosophy:** UX is not polish applied after engineering. The interaction model must be designed before implementation, or the engineers will fill in the blanks with the default (no loading, no error handling, instant transitions).

---

## 1. Loading States

### 1.1 Settings Page

**Gap:** `useSettings()` is async. When the component mounts, it renders before the query resolves. The user sees empty inputs or blank space until the settings load.

**What is undefined:**
- Skeleton: do the language dropdown and theme cards show skeletons while loading?
- Immediate vs deferred render: does the page render with default values immediately (optimistic) or wait for `getSettings()`?
- If `getSettings()` fails: does the page show an error or blank fields?

**Required decision:**
- Strategy A: Render with hardcoded defaults immediately, hydrate with real values on resolve (fast perceived load)
- Strategy B: Render skeletons, wait for data (avoids flash of wrong state)

---

### 1.2 Projects List

**Gap:** `useProjects()` is async. On first load, the list is empty until the query resolves.

**What is undefined:**
- Skeleton: do project cards show skeleton placeholders (2-3 grey cards)?
- If `listProjects()` is empty: is this "no projects yet" or "still loading"?
- The difference must be communicated to the user — not ambiguity between "loading" and "empty".

**Required decision:**
- Show 3 skeleton cards during loading, then swap to empty state or populated list.
- Never show a blank page with no indication of activity.

---

### 1.3 Theme Application

**Gap:** Theme is applied in `useEffect`. On first paint, the user sees the system default (white/light). The `useEffect` runs after React renders. Even if fast, this is a visible flash on dark-mode users.

**What is undefined:**
- Is there a blocking inline script in `index.html` that applies the class before React loads?
- Or is the flash acceptable (CSR — user expects JavaScript to load)?

**Current spec says:** "useEffect in `_app.tsx` — sufficient for CSR". This is a UX compromise.

---

## 2. Empty States

### 2.1 Projects List — First Launch

**Gap:** F4 defines "Empty state with CTA" but provides no copy, no illustration description, and no UX flow.

**What is undefined:**
```
Visual:  [Illustration: a folder with a spark] or [Empty folder illustration]
Heading:  "No projects yet" / "Start building" / "Your workspace is empty" — which?
Subtext:  "Create your first project to get started" — or something else?
CTA:      Primary button: "Create Project" + icon
Secondary: "Open existing" (if a project exists elsewhere on disk)
```

**Required decisions:**
- Copy tone: welcoming ("Welcome! Create your first project") vs neutral ("No projects")
- Is there a keyboard shortcut shown in the empty state? (`Ctrl+N`)
- Does the sidebar show "Recent Projects" section when no projects exist? (hidden vs shown empty)

---

### 2.2 Settings — Projects Tab

**Gap:** F2 §3.1 wireframe shows a "Projects" tab in Settings. F4 §3.1 shows the Projects list at `/`. These are the same data.

**What is undefined:**
- Is the "Projects" tab in Settings the same as the `/` Projects list?
- Or is it a mini-version (just default project path setting)?
- The wireframe shows it with no content defined.

**Required decision:**
- One canonical Projects view (at `/`) OR a split: Settings Projects tab = app-level settings (default DB path), `/` = project management.
- Conflicting UX if both exist without clear purpose.

---

### 2.3 Sidebar — Recent Projects (Empty)

**Gap:** F1 sidebar shows "Recent Projects" as a collapsible section. If no projects exist or none are recent, what is shown?

**Options:**
- A: Section hidden entirely (clean, no empty section)
- B: Section shown with "No recent projects" text
- C: Section shown with "Create your first project →" link

---

## 3. Error States

### 3.1 Settings — Failed Write

**Gap:** `updateSettings` calls oRPC → `electron-store`. If the write fails (disk full, permissions), what does the user see?

**Current spec:** `onSuccess` invalidates the query and shows a Toaster "Settings saved". No `onError` handling defined.

**Required decision:**
- Toast error: "Failed to save settings. Please try again."
- Does the UI revert to the previous value or stay in the failed state?
- Is there a retry mechanism?

---

### 3.2 Projects — Failed Project Open

**Gap:** `openProject` calls `initDatabase` on the project's `dbPath`. If the path doesn't exist, is corrupted, or is locked:

**Required decision:**
- Error dialog: "This project could not be opened. The folder may have been moved or deleted."
- Options: "Choose new location" / "Remove from recent" / "Cancel"
- Does the app stay on the Projects list or navigate to an error state?

---

### 3.3 Projects — Folder Picker Cancelled

**Gap:** F4 §4.5 shows: `if (result.canceled) return null`

**Required decision:**
- Cancel the dialog (already happens — `onOpenChange(false)`)
- But: if the user already filled in a project name, does it persist if they reopen the dialog?
- Is there a "recent folders" list in the folder picker?

---

### 3.4 Database Corruption

**Gap:** `electron-store` corruption. `global.db` corruption.

**Required decision:**
- Does the app show a recovery dialog on launch if `config.json` is invalid JSON?
- Does `electron-store` handle this gracefully or crash?
- Is there a "Reset settings" option?

---

## 4. Transitions and Animations

### 4.1 Sidebar Collapse

**Gap:** The spec defines "collapsed state" as a boolean. It does not define the transition.

**Required decisions:**
- Duration: instant (0ms), 150ms, 200ms (VS Code is ~200ms ease)?
- Easing: `ease-in-out`?
- What animates: `width` or `grid-template-columns`?
- Does the content area expand simultaneously (smooth resize)?

**Recommended:**
```css
.sidebar { transition: width 200ms ease-in-out; }
.sidebar.collapsed { width: 48px; }
```

---

### 4.2 Theme Switch

**Gap:** Changing theme toggles `.dark` class on `<html>`. CSS variables change instantly.

**Required decision:**
- Add `transition` on `background-color`, `color`, `border-color` to smooth the switch?
- Without transition: jarring instant swap
- With transition: 150ms ease on `*` is too expensive; scope to specific selectors

**Recommended:**
```css
html { transition: background-color 150ms ease, color 150ms ease; }
```

---

### 4.3 Dialog Open / Close

**Gap:** `CreateProjectDialog` — open animation undefined.

**Required decision:**
- Fade in + scale from 95% to 100% (Radix Dialog default)?
- Or: slide up from bottom?
- Duration: 150ms?

---

### 4.4 Tab Content Switch

**Gap:** `Tabs` component — switching tabs: fade, slide, or instant content swap?

**Required decision:**
- Radix `Tabs.Content` has no built-in animation — content swaps instantly
- For production quality: add a CSS fade-in on the content panel
- Duration: 100ms

---

### 4.5 Toast Notifications

**Gap:** `sonner` is installed but not configured.

**Required decisions:**
- Position: bottom-right (default) or bottom-center?
- Duration: 3s (default) or 4s for errors?
- Are errors dismissible immediately or do they persist?
- Max toasts visible at once: 3?

---

### 4.6 Navigation Loading

**Gap:** TanStack Router's `<Link>` navigation is instant in CSR. But when a route has a `loader`, does the user see a progress indicator?

**Required decision:**
- TanStack Router shows a `<RouterOutlet>` that can wrap in `<Suspense>` with a skeleton
- Should the sidebar show a loading state during navigation?
- Or does the content area show a spinner in the outlet?

---

## 5. Command Palette UX

### 5.1 Discovery

**Gap:** `⌘K` is defined as the shortcut. But how does a new user know it exists?

**Required decisions:**
- A: Empty state or sidebar footer shows a hint: "Press ⌘K to search"
- B: On first launch, a one-time toast: "Pro tip: press ⌘K to open the command palette"
- C: No hint — power users discover it

---

### 5.2 Command UX

**Gap:** 6 commands defined. Searchable? Keyboard navigation? Shortcut hints?

**Required decisions:**
- Search: typing "da" shows "Switch to Dark Mode"?
- Keyboard nav: ↑↓ to move, Enter to select, Escape to close
- Shortcut hints: show `⌘K ⌘P` next to "Go to Projects"?
- Empty state: "No commands found" when search returns nothing
- Does Escape close the palette or cancel the search?

---

## 6. Keyboard Navigation

### 6.1 Global Shortcuts

**Gap:** F1 §4.3 defines `⌘K` for the command palette. Nothing else.

**Required decisions:**
| Shortcut | Action | Notes |
|---|---|---|
| `⌘K` / `Ctrl+K` | Open command palette | Defined |
| `Ctrl+N` | New project | Missing — should open `CreateProjectDialog` |
| `⌘,` / `Ctrl+,` | Open Settings | Missing — standard desktop app convention |
| `Escape` | Close dialog / palette | Partial — needs explicit definition |
| `Tab` | Move focus through sidebar nav | Not defined |
| `Enter` | Activate focused item | Partial — needs definition |

---

### 6.2 Settings Page Keyboard

**Gap:** Language dropdown, theme cards — keyboard accessible?

**Required decisions:**
- Language dropdown: standard `<select>` is keyboard accessible natively
- Theme cards: rendered as `<button role="radio">` — keyboard navigable with arrow keys (ARIA)
- Is `role="radiogroup"` set on the cards container?

---

### 6.3 Dialog Keyboard

**Gap:** `CreateProjectDialog` — focus trap? Escape to close? Submit on Enter?

**Required decisions:**
- Focus is trapped inside the dialog when open (Radix Dialog does this)
- Escape closes the dialog (Radix Dialog does this)
- Enter in the name input: does it submit or insert a newline?
- Does Tab cycle focus within the dialog or escape it?

---

## 7. Micro-interactions

### 7.1 Sidebar Nav Item Hover

**Gap:** F1 §3.5 defines visual states for nav items. Not the transition.

**Required decision:**
- Hover: instant bg change or 100ms ease transition?
- Active (current route): filled bg vs text color change?

---

### 7.2 Project Card Hover

**Gap:** F4 §4.4 shows project cards in a grid.

**Required decisions:**
- Hover: subtle shadow lift (`box-shadow`), scale(1.01), or border color change?
- Is the entire card clickable or just the title?
- Does hovering show additional actions (delete icon appears on hover)?

---

### 7.3 Delete Confirmation

**Gap:** F4 §4.4: "Delete project" opens `AlertDialog`. What's the interaction?

**Required decisions:**
- The delete button on the card: is it always visible or does it appear on hover?
- Does clicking "Delete" require a confirmation ("Are you sure? Type the project name to confirm") or is one click enough?
- For destructive actions: require typing the project name or double-click?

---

### 7.4 Language / Theme Change Feedback

**Gap:** F2 §4.7: after selecting a language or theme, does the UI immediately reflect the change before the mutation completes?

**Required decision:**
- Optimistic update: language/theme changes UI immediately, mutation fires in background
- If mutation fails: revert the UI + show error toast
- Or: wait for mutation to complete before applying (slower but consistent)

---

## 8. Accessibility (a11y)

### 8.1 ARIA Labels

**Gap:** Sidebar nav items — do they have `aria-label` or `aria-current="page"` for the active route?

**Required decisions:**
- Active nav item: `aria-current="page"` (required for screen readers)
- Sidebar collapse button: `aria-label="Collapse sidebar"` / `aria-expanded`
- Theme cards: `role="radiogroup"` with `aria-checked` per card

---

### 8.2 Focus Management

**Gap:** When a dialog opens, where does focus go? When it closes, where does focus return?

**Required decisions:**
- Dialog open: focus moves to first focusable element (Radix default) or to the dialog container
- Dialog close: focus returns to the trigger button (Radix default — must verify)
- Settings page: focus moves to page heading on navigation?

---

### 8.3 Color Contrast

**Gap:** Dark mode CSS variables from shadcn. Are they verified to meet WCAG AA?

**Required decisions:**
- Primary green (`--color-primary`) on dark background: contrast ratio?
- Muted text on dark background?
- Should the spec validate contrast ratios or trust shadcn defaults?

---

## 9. Onboarding / First Launch

### 9.1 What Does the User See?

**Gap:** On first launch after V2 installs:

```
1. App opens
2. electron-store initializes with defaults
3. getSettings() returns defaults
4. Theme applies (system → OS preference)
5. User lands on / (Projects list)
6. Projects list is empty
7. Empty state shown
```

Step 7: what exactly does "empty state" look like? See §2.1.

**Required decisions:**
- Is there a guided tour (tooltip on sidebar sections)?
- Is there a banner: "Welcome to Electron App — press ⌘K to get started"?
- Or is the app completely silent and leaves the user to discover?

---

### 9.2 Keyboard Shortcut Discovery

**Gap:** How does the user learn `⌘K` exists?

**Options:**
- Persistent hint in sidebar footer: "⌘K to search"
- First-launch toast: "Pro tip: ⌘K opens the command palette"
- Empty state copy mentions it: "Create a project or press ⌘K to search"

---

## 10. Responsive / Edge Cases

### 10.1 Window Min Size

**Gap:** No minimum window size defined.

**Required decision:**
- Electron BrowserWindow `minWidth` / `minHeight`: what values?
- Below min size: sidebar collapses automatically?
- Or: sidebar hides, content area takes full width?

---

### 10.2 Sidebar at Narrow Widths

**Gap:** Between 768px and 1024px — what happens?

**Options:**
- Always show sidebar (expanded or collapsed)
- Show sidebar as overlay (drawer pattern)
- Collapse to icon-only automatically

---

### 10.3 Long Project Names

**Gap:** Project names up to 255 characters. Sidebar nav items truncate? How?

**Required decisions:**
- Truncate with ellipsis after 1 line?
- Tooltip shows full name on hover?
- Project cards: same truncation in card title?

---

## 11. Status: Summary of UX Decisions Required

| # | Decision | Options | Affects |
|---|---|---|---|
| UX-1 | Loading strategy for settings | Skeleton vs optimistic defaults | F2 |
| UX-2 | Loading strategy for projects list | Skeleton vs empty state | F4 |
| UX-3 | First launch empty state copy + visual | Define exact copy + illustration | F4 |
| UX-4 | "Projects" tab in Settings vs `/` | Merge or clarify purpose | F2 / F4 |
| UX-5 | Recent Projects sidebar: hidden vs empty vs link | One of three | F1 |
| UX-6 | Error toast on settings write failure | Toast error + revert | F2 |
| UX-7 | Project open failure UX | Error dialog with recovery options | F4 |
| UX-8 | Sidebar collapse animation | 200ms ease-in-out vs instant | F1 |
| UX-9 | Theme switch transition | 150ms ease vs instant | F3 |
| UX-10 | Toast configuration | Position, duration, max visible | F2, F4 |
| UX-11 | Command palette discovery hint | Toast, footer hint, or silent | F1 |
| UX-12 | Global keyboard shortcuts | Add `Ctrl+N`, `Ctrl+,` | F1 |
| UX-13 | Delete confirmation: single vs double click | Define risk threshold | F4 |
| UX-14 | Optimistic updates on settings change | Optimistic vs wait-for-server | F2, F3 |
| UX-15 | Window min size | Define minWidth / minHeight | F1 |
| UX-16 | Sidebar at narrow widths | Always visible vs overlay | F1 |
| UX-17 | Hover states on project cards | Shadow lift vs scale vs border | F4 |
| UX-18 | Onboarding: tour, toast, or silent | Define first-launch experience | F1, F4 |
