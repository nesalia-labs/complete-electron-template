# V2.0.0 — UX Audit Report

**Date:** 2026-06-22
**Authors:** Tech Lead + UX Auditor Agent (general-purpose, adversarial)
**Sources:** UX-GAPS.md (first-principles gap analysis) + full spec + codebase review
**Status:** Working document

---

## Executive Summary

The V2.0.0 feature specs define **what the app does** with precision. They define **how it feels** almost not at all. 4 Critical UX findings block implementation. 18 Major findings must be resolved before each affected release ships.

**The core UX problem:** every unspecified interaction will be filled in by an engineer with a default — and the default is no loading state, no error handling, no animation, no accessibility. That's a template that shocks in the wrong way.

---

## Critical Findings — Must Resolve Before Implementation

---

### C-UX-1: Loading states — zero defined for any mutation

**Severity:** Critical
**Raised by:** Tech Lead (UX-GAPS) + UX Auditor (Finding 4)

**What happens right now if implemented as-is:**

Every button click, form submit, and navigation has no defined loading state. The user sees:
- Clicking "Create Project" → nothing happens for 500ms → project appears
- Changing language → instant or 500ms delay → change applies
- Submitting a form during an error → button doesn't disable → double-submit possible

**What must be defined for every mutation:**

| Mutation | During pending | On success | On error |
|---|---|---|---|
| `updateSettings` | Button disabled? Spinner? Optimistic UI? | Toast "Saved" | Toast "Failed to save" |
| `createProject` | Button disabled? Spinner? | Project appears in list? Toast? | Error dialog? |
| `deleteProject` | Button disabled? Row removed optimistically? | Toast "Deleted"? | Toast + rollback? |
| `openProject` | Loading indicator on projects list? | Navigate? | Error dialog? |

**Required decisions (UX-D1, UX-D2, UX-D14):**
- Strategy: optimistic (UI updates immediately, revert on error) vs synchronous (wait for server)
- Button state: `disabled={mutation.isPending}` on every submit button
- `aria-disabled` for accessibility during pending state

---

### C-UX-2: Error states — undefined for every failure path

**Severity:** Critical
**Raised by:** Tech Lead (UX-GAPS §3) + UX Auditor (Findings 5, 6)

**Failure paths with no defined UX:**

| Failure | Current spec says | User sees |
|---|---|---|
| `electron-store` write fails (disk full) | `store.set(...)` → undefined | Nothing |
| Project folder moved / `dbPath` stale | `initDatabase(...)` creates new empty DB | Silent data loss |
| Folder picker cancelled | `return null` | Dialog closes, no feedback |
| `global.db` corrupted on launch | App likely crashes | Crash with no recovery |
| DB lock (another process using it) | `better-sqlite3` throws | Unhandled exception |

**Required decisions (UX-D6, UX-D7, UX-D13):**
- Error dialog: what copy? ("Something went wrong" vs specific message)
- Recovery path: "Choose new location" for stale paths, "Reset settings" for corruption
- Confirmation dialogs: single-click delete or type-to-confirm for destructive actions?

---

### C-UX-3: Missing `Sidebar` and `Tooltip` components

**Severity:** Critical
**Raised by:** UX Auditor (Finding 1)

**Problem:** F1 (Sidebar) and F3 (Theming) depend on `Sidebar` and `Tooltip` from shadcn. These components do not exist in `packages/ui/src/components/index.ts`. All sidebar work blocks on them being added.

**Evidence:**
```
packages/ui/src/components/index.ts  →  no sidebar, no tooltip export
features/01-sidebar-navigation.md       →  lists both as "pnpm ui:add"
SPEC.md §4.4                          →  lists both as "new"
```

**Fix:** `pnpm ui:add sidebar tooltip` must be in V2.3.0 acceptance criteria AND must be verified before any sidebar implementation begins. Not a coding task — a scaffolding task.

---

### C-UX-4: 12+ missing i18n keys, no i18n strategy for new UI

**Severity:** Critical
**Raised by:** UX Auditor (Finding 8)

**Problem:** Every string in the specs that uses `t('...')` falls back to hardcoded English. The French and Spanish translations are not defined for any new V2 string.

**Missing keys (all three language files):**

| Key | Used in | Fallback (EN) |
|---|---|---|
| `settings.title` | Settings page heading | `'Settings'` |
| `settings.description` | Settings page subheading | `'Manage your language...'` |
| `settings.language` | Language tab label | `'Language'` |
| `settings.appearance` | Appearance tab label | `'Appearance'` |
| `settings.projects` | Projects tab label | `'Projects'` |
| `settings.theme.light` | Theme card | `'Light'` |
| `settings.theme.dark` | Theme card | `'Dark'` |
| `settings.theme.system` | Theme card | `'System'` |
| `projects.title` | Projects page heading | `'Your Projects'` |
| `projects.description` | Projects page subheading | `'Create and manage your workspaces'` |
| `projects.new` | New Project button | `'New Project'` |
| `projects.search` | Search input placeholder | `'Search projects...'` |
| `projects.delete.title` | Delete dialog | `'Delete project?'` |
| `projects.delete.description` | Delete dialog | `'This will remove...'` |
| `common.cancel` | Cancel buttons | `'Cancel'` |
| `common.delete` | Delete buttons | `'Delete'` |
| `errors.settingsWriteFailed` | Error toast | NOT DEFINED |
| `errors.projectOpenFailed` | Error dialog | NOT DEFINED |
| `errors.projectCreateFailed` | Error dialog | NOT DEFINED |

**Also:** V1 keys that become dead after V2.4 ships:
- `common.test`, `common.clickToTest`, `users.*` — remove from `common.json` in V2.4.0

**Fix (UX-D3):** Add all 17 new keys to `en/common.json`, `fr/common.json`, `es/common.json`. Add acceptance criterion: "All new UI strings use i18n keys. Zero hardcoded English in JSX."

---

## Major Findings — Resolve Before Each Release Ships

---

### M-UX-1: `DialogFooter` used in spec, not in component index

**Severity:** Major
**Raised by:** UX Auditor (Finding 2)

**Problem:** F4 code example uses `<DialogFooter>` in the create project dialog. This compound component is not exported from `packages/ui/src/components/index.ts`.

**Fix:** Either add `DialogFooter` to `packages/ui` or replace with:
```tsx
<div className="flex justify-end gap-2 mt-6">
  <Button variant="outline">{t('common.cancel')}</Button>
  <Button>{t('projects.new')}</Button>
</div>
```

---

### M-UX-2: `CardRadioGroup` is not a shadcn component

**Severity:** Major
**Raised by:** UX Auditor (Finding 3)

**Problem:** F2 wireframe labels theme selection as `CardRadioGroup`. The theming spec (§3.3) correctly uses `<button role="radio">`. The wireframe is wrong.

**Fix:** Remove `CardRadioGroup` from F2 wireframe. Document explicitly: theme cards are `<button role="radio">` styled with `Card` CSS classes. Add `role="radiogroup"` to the container.

---

### M-UX-3: `createProjectDatabase` called but never defined

**Severity:** Major
**Raised by:** UX Auditor (Finding 7)

**Problem:** F4 §4.3 calls `await createProjectDatabase(dbPath)` but this function is not defined anywhere. F5 §5.1 shows `initProjectDb` instead. Two different names, neither fully defined.

**Fix:** Use `initProjectDb(dbPath)` consistently. Define the full function in F5 §5.1:
```typescript
async function initProjectDb(dbPath: string) {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const handle = initDatabase({ dataPath: dbPath })
  runProjectMigrations(handle.db)
  return handle
}
```

---

### M-UX-4: `aria-current="page"` missing on active sidebar nav

**Severity:** Major
**Raised by:** UX Auditor (Finding 13)

**Problem:** Active sidebar item has visual styling (`bg-primary`) but no ARIA attribute for screen readers. Screen reader users cannot determine which route is active.

**Fix:** Add `aria-current="page"` to the active `<NavLink>`:
```tsx
<NavLink
  to="/"
  className={isActive ? 'bg-primary text-primary-foreground' : '...'}
  aria-current={isActive ? 'page' : undefined}
>
  Projects
</NavLink>
```

---

### M-UX-5: `role="radiogroup"` missing on theme card container

**Severity:** Major
**Raised by:** UX Auditor (Finding 14)

**Problem:** Theme cards use `<button role="radio">` individually but the container has no `role="radiogroup"`. Keyboard users cannot navigate the radio group with arrow keys.

**Fix:**
```tsx
<div
  role="radiogroup"
  aria-label={t('settings.theme', 'Theme')}
  className="grid grid-cols-3 gap-3"
>
  {OPTIONS.map((opt) => (
    <button key={opt.value} role="radio" aria-checked={...} ...>
```

---

### M-UX-6: Optimistic update strategy undefined

**Severity:** Major
**Raised by:** Tech Lead (UX-GAPS §7.4) + UX Auditor (Finding 6)

**Problem:** Language and theme changes fire mutations. If the user changes language to French then to Spanish before the French mutation resolves, the final state is ambiguous. If a mutation fails after the user moved on, there is no rollback defined.

**Fix (UX-D14):** Explicitly choose:
- **Option A (optimistic):** UI updates immediately. `onError` reverts to previous value + shows error toast.
- **Option B (synchronous):** UI waits for server confirmation before applying. Disable controls during pending.

Recommendation: **Option A** for theme (instant visual feedback is the UX selling point). **Option B** for delete (don't remove from list until confirmed).

---

### M-UX-7: Command palette — discovery mechanism undefined, shortcuts incomplete

**Severity:** Major
**Raised by:** Tech Lead (UX-GAPS §5) + UX Auditor (Finding 11, 12)

**Problem 1:** No mechanism for users to discover `⌘K`. Power users know; new users won't.

**Problem 2:** Only `⌘K` documented. Standard desktop conventions missing:
- `Ctrl+N` → New project (missing)
- `Ctrl+,` → Settings (missing)
- `Escape` → Close dialog/palette (partially defined)

**Fix (UX-D9, UX-D10):**
- Add persistent hint in sidebar footer: `⌘K to search`
- Add `Ctrl+N` → opens `CreateProjectDialog`
- Add `Ctrl+,` → navigates to `/settings`
- Verify Escape closes dialogs and palette (Radix handles this, verify)

---

### M-UX-8: `NativeSelect` vs `Select` — unresolved inconsistency

**Severity:** Major
**Raised by:** Tech Lead (UX-GAPS §10) + UX Auditor (Finding 10)

**Problem:** F2 wireframe uses `NativeSelect`. SPEC.md says both exist. Which one for language picking?

**Decision (UX-D4):**
- **Language picker:** `NativeSelect` — native `<select>`, most accessible, no custom component needed
- **Theme cards:** `<button role="radio">` — custom styled (not a Select component)

---

### M-UX-9: Empty state — "Projects" tab in Settings vs `/` route conflict

**Severity:** Major
**Raised by:** Tech Lead (UX-GAPS §2.2)

**Problem:** F2 §3.1 shows a "Projects" tab in the Settings page. F4 §3.1 shows the Projects list at `/`. Are these the same view? If yes, duplication. If different, what is the Settings Projects tab for?

**Fix (UX-D5):** One canonical Projects view at `/`. Settings page Projects tab shows app-level project settings only (e.g., "Default project location"). Document this distinction explicitly.

---

### M-UX-10: Sidebar Recent Projects empty state

**Severity:** Major
**Raised by:** Tech Lead (UX-GAPS §2.3)

**Decision (UX-D8):** When no recent projects exist:
- **Option A:** Section hidden entirely — clean, no empty list
- **Option B:** Section shown with "No recent projects" text
- **Option C:** Section shown with "Create your first project →" link

**Recommendation:** Option A for V2.0. Less UI = less cognitive load.

---

## Minor Findings

| # | Finding | Fix |
|---|---|---|
| m-1 | Theme switch is instant (no CSS transition) | Add `html { transition: background-color 150ms ease, color 150ms ease; }` |
| m-2 | Sidebar collapse is instant (no CSS transition) | Add `transition: width 200ms ease-in-out` on sidebar element |
| m-3 | Window minimum size undefined | Add `mainWindow.setMinimumSize(768, 600)` to main process |
| m-4 | Project card "2 tables · 4 docs" — count fields don't exist in schema | Remove from wireframe. Use `updatedAt` instead. |
| m-5 | Theming spec uses HSL values, codebase uses OKLCH | Update spec to OKLCH to match globals.css |
| m-6 | Lucide `Home` icon doesn't exist (should be `House`) | `import { House, Settings }` |
| m-7 | Toast configuration undefined (position, duration, max) | Configure sonner: bottom-right, 3s, max 3 visible |
| m-8 | Dialog animations undefined (open/close) | Use Radix Dialog defaults (fade + scale) |
| m-9 | Focus trap in dialogs not explicitly tested | Radix handles it, but add to AC |
| m-10 | Hover state on project cards undefined | Define: subtle shadow lift on hover |

---

## UX Decisions Required — Resolved

The following decisions are now **resolved** based on this audit:

| Decision | Resolution | Rationale |
|---|---|---|
| **UX-D1** (Loading strategy) | **Optimistic with rollback** | Theme: instant visual feedback is the UX goal. Delete: wait for confirmation. |
| **UX-D2** (Button state) | **`disabled={isPending}` + spinner** | Every submit button. Standard pattern. |
| **UX-D3** (i18n strategy) | **All strings keyed, no hardcoded EN in JSX** | Template philosophy requires full i18n from day one. |
| **UX-D4** (Select component) | **`NativeSelect` for language, `<button role="radio">` for theme** | Native is most accessible for language; theme cards need custom styling. |
| **UX-D5** (Settings Projects tab) | **Settings tab = app-level settings only; `/` = Projects management** | One canonical view. Eliminate duplication. |
| **UX-D6** (Error recovery) | **Dialog for project open failure with recovery options** | Never silently create a new DB. |
| **UX-D7** (Delete confirmation) | **Single confirm button, NOT type-to-confirm** | V2.0 simplicity. Type-to-confirm in V2.1. |
| **UX-D8** (Recent Projects empty) | **Hide section when empty** | Option A — reduces cognitive load. |
| **UX-D9** (⌘K discovery) | **Persistent hint in sidebar footer** | "⌘K to search" — follows Linear/Raycast convention. |
| **UX-D10** (Global shortcuts) | **Add `Ctrl+N` (new project) + `Ctrl+,` (settings)** | Standard OS conventions. |

---

## UX Decisions Required — Pending

| Decision | Options | Blocks |
|---|---|---|
| **UX-D11** (First launch empty state copy) | Define exact heading + subtext + illustration type | F4 |
| **UX-D12** (Window min size) | `768×600` vs `1024×700`? Below threshold: auto-collapse sidebar? | F1 |
| **UX-D13** (`electron-store` corruption) | Reset to defaults + toast? Or block launch? | F2 |
| **UX-D14** (Optimistic vs synchronous for each mutation) | Per-mutation decision table | F2, F4 |

---

## i18n Audit

### Keys to add (17 new keys, 3 language files)

```json
// In settings.* namespace
"settings.title": "Settings",
"settings.description": "Manage your language, appearance, and preferences",
"settings.language": "Language",
"settings.appearance": "Appearance",
"settings.projects": "Projects",
"settings.theme.light": "Light",
"settings.theme.dark": "Dark",
"settings.theme.system": "System",

// In projects.* namespace
"projects.title": "Your Projects",
"projects.description": "Create and manage your workspaces",
"projects.new": "New Project",
"projects.search": "Search projects...",
"projects.delete.title": "Delete project?",
"projects.delete.description": "This will remove the project from this app. Your files will not be deleted.",

// In common.*
"common.cancel": "Cancel",
"common.delete": "Delete",

// In errors.* namespace (new)
"errors.settingsWriteFailed": "Failed to save settings. Please try again.",
"errors.projectOpenFailed": "This project could not be opened. The folder may have been moved.",
"errors.projectCreateFailed": "Failed to create project. Please try again."
```

### Keys to remove (V2.4.0, when V1 demo is replaced)
- `common.test`, `common.clickToTest`
- `users.*` (all V1 demo user management keys)

---

## Acceptance Criteria Additions

Add to **RELEASES.md** quality gates:

### V2.2.0 — Add
- [ ] Every submit button has `disabled={mutation.isPending}` during submission
- [ ] `updateSettings` error calls `toast.error(t('errors.settingsWriteFailed'))`
- [ ] All 17 new i18n keys defined in `en/`, `fr/`, `es/common.json`
- [ ] No hardcoded English strings in JSX components

### V2.3.0 — Add
- [ ] Active sidebar nav item has `aria-current="page"`
- [ ] Theme card container has `role="radiogroup"`
- [ ] Sidebar footer shows "⌘K to search" hint
- [ ] `Ctrl+N` opens CreateProjectDialog
- [ ] `Ctrl+,` navigates to `/settings`
- [ ] Sidebar collapse: CSS transition 200ms ease-in-out
- [ ] Theme switch: CSS transition 150ms ease

### V2.4.0 — Add
- [ ] `createProjectDatabase` → `initProjectDb` (consistent naming)
- [ ] `Ctrl+N` shortcut works when projects list is focused
- [ ] Error dialog on stale `dbPath` with recovery options
- [ ] Empty state copy defined in i18n (UX-D11)
- [ ] Dead i18n keys removed from `common.json`

---

## Spec Corrections Required

| File | Correction |
|---|---|
| `features/01-sidebar-navigation.md` | Replace `Home` → `House` (Lucide import) |
| `features/01-sidebar-navigation.md` | Add `aria-current="page"` + `role="radiogroup"` |
| `features/02-settings-system.md` | Remove `CardRadioGroup`. Theme cards = `<button role="radio">` |
| `features/02-settings-system.md` | Remove `DialogFooter`. Use styled `<div>` |
| `features/03-theming.md` | Add `role="radiogroup"` + `aria-label` to card container |
| `features/03-theming.md` | Update CSS values to OKLCH to match `globals.css` |
| `features/04-projects-page.md` | Remove "2 tables · 4 docs" from card wireframe |
| `features/04-projects-page.md` | Replace `createProjectDatabase` → `initProjectDb` |
| `features/04-projects-page.md` | Add `isPending` checks + error toasts |
| `features/05-project-architecture.md` | Define `initProjectDb` fully |
| SPEC.md | Remove `CardRadioGroup` from component table |
