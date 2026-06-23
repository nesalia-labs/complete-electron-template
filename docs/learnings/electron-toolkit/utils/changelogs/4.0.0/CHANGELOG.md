# Changelog — @electron-toolkit/utils 4.0.0

**Release date:** 2025-02-06
**Previous line:** 3.0.0
**Severity:** Major — contains breaking API changes and behavior corrections.

This release narrows the API surface, fixes two long-standing bugs in
cross-platform behavior, and tightens the TypeScript signature of the optimizer
helpers. The headline change is the **removal of the in-package IPC helper**;
it has moved to dedicated packages (`@electron-toolkit/typed-ipc` and
`@electron-toolkit/preload`).

---

## Breaking changes

### 1. IPC helper removed

The IPC helper utility that was exported from `@electron-toolkit/utils` in 3.x
has been **removed** in 4.0.0. There is no deprecation shim; the export no
longer exists.

**Before — 3.x**

```ts
// apps/desktop/src/main/index.ts
import { ipc } from '@electron-toolkit/utils'

ipc.handle('user:create', async (payload) => {
  return db.insert(users).values(payload)
})
```

**After — 4.0.0**

The IPC helper is gone. Migrate to a dedicated package. The two first-party
options are:

- `@electron-toolkit/typed-ipc` — for end-to-end typed channels.
- `@electron-toolkit/preload` — for a prebuilt, `contextBridge`-based preload.

```ts
// Using @electron-toolkit/typed-ipc as the replacement
import { ipcMain } from 'electron'
import { typedIpcMain } from '@electron-toolkit/typed-ipc'
import { router } from './router'

typedIpcMain.handle(router.user.create, async ({ input }) => {
  return db.insert(users).values(input)
})
```

See the `@electron-toolkit/typed-ipc` documentation for router definition and
preload wiring.

### 2. `optimizer.watchWindowShortcuts` options type tightened

The TypeScript signature for `watchWindowShortcuts` was corrected. Callers that
relied on the loose 3.x signature — particularly for `zoom` and `escToCloseWindow`
— will need to pass a fully typed options bag.

**Before — 3.x (loose signature)**

```ts
optimizer.watchWindowShortcuts({ window: win })
```

**After — 4.0.0 (explicit options)**

```ts
optimizer.watchWindowShortcuts({
  window: win,
  zoom: true,
  escToCloseWindow: true,
})
```

Tracked as issue #17 in the upstream repo. The change is a compile-time
breaking change only — runtime behavior is unchanged for callers that pass the
explicit bag.

### 3. `setAutoLaunch` behavior corrected on Windows

The 3.x implementation of `electronApp.setAutoLaunch` failed to actually
configure the Windows Run key on most machines, while still reporting success.
In 4.0.0 the behavior is fixed and the Run key is written correctly.

**Implication for 3.x code:** if your codebase carried a workaround for the
broken Windows implementation (manual `app.setLoginItemSettings`, custom
`reg add` calls, or a wrapper that hid the bug), the workaround must be
removed. Leaving it in place will produce duplicate login items in 4.0.0.

**Before — 3.x (with workaround)**

```ts
electronApp.setAutoLaunch(true)               // silently failed on Windows
app.setLoginItemSettings({ openAtLogin: true }) // workaround
```

**After — 4.0.0**

```ts
electronApp.setAutoLaunch(true)               // works on macOS and Windows
```

### 4. DevTools shortcut (F12) is now disabled in production

In 3.x, the F12 → toggle-DevTools binding processed regardless of environment.
In 4.0.0 it is explicitly gated on dev mode. Packaged builds ignore F12.

This is a behavior change, not an API change. No code modification is required
to benefit from it; you may want to remove any production-only `if (is.dev)`
guards you previously added around the call.

---

## New features

### Production-safe DevTools shortcut handling

`optimizer.watchWindowShortcuts` now reliably ignores F12 in production
builds, reducing accidental DevTools exposure in shipped apps.

```ts
// electron/main/index.ts
const win = new BrowserWindow({ /* ... */ })
optimizer.watchWindowShortcuts({ window: win, zoom: true, escToCloseWindow: true })
// In a packaged build, F12 is a no-op.
```

### Corrected auto-launch support on Windows

`electronApp.setAutoLaunch(true)` now writes the appropriate registry entry on
Windows and uses `app.setLoginItemSettings` on macOS.

```ts
import { electronApp } from '@electron-toolkit/utils'

electronApp.setAutoLaunch(true)   // macOS: login item; Windows: Run key
```

### Tighter TypeScript types for `watchWindowShortcuts`

The options bag for `optimizer.watchWindowShortcuts` now requires explicit
typing for `zoom` and `escToCloseWindow`, eliminating the boolean-vs-object
ambiguity that the loose 3.x signature permitted.

### Cleaner export surface

With the IPC helper removed, the package now exports a deliberately small,
focused API: `is`, `platform`, `electronApp`, and `optimizer`. This makes
auto-import collisions with `@electron-toolkit/typed-ipc` and
`@electron-toolkit/preload` easier to reason about.

### Continued support

The following helpers remain part of the public API and are unchanged in 4.0.0:

- `electronApp.skipProxy()` — bypass the system proxy for the app.
- `electronApp.registerFramelessWindowIpc()` — exposes frameless window
  controls (`show`, `showInactive`, `min`, `max`, `close`) over the
  `'win:invoke'` IPC channel.
- `is` predicates and `platform` detection helpers.

---

## Deprecations

No APIs are deprecated in 4.0.0. The IPC helper was removed outright rather
than marked deprecated, in line with the toolkit maintainers' preference for
narrow, focused packages.

---

## Migration tips

1. **Find every IPC helper import before bumping.** The export is gone, not
   deprecated. A `tsc --noEmit` after the upgrade is the fastest way to find
   every site that needs to change.

   ```bash
   rg "from '@electron-toolkit/utils'" apps/desktop
   ```

2. **Choose a replacement IPC package.** `@electron-toolkit/typed-ipc` is the
   recommended path for new code. `@electron-toolkit/preload` is the right
   default if you do not need end-to-end typed channels.

3. **Update `watchWindowShortcuts` call sites.** Pass the full options bag
   (`zoom`, `escToCloseWindow`) to satisfy the corrected signature. A repo-wide
   codemod is safe because the change is purely additive at the type level.

4. **Remove Windows `setAutoLaunch` workarounds.** If your 3.x code manually
   invoked `app.setLoginItemSettings` or wrote to the registry, delete it. The
   4.0.0 implementation does the right thing on its own.

5. **Re-test the four changed behaviors:**
   - F12 in a packaged build → DevTools must **not** open.
   - Auto-launch on Windows, full logout/login → app must start.
   - Auto-launch on macOS → entry must appear in *Login Items*.
   - Zoom and ESC bindings in every window → unchanged from 3.x.

6. **Type-check the whole workspace** to surface any remaining callers that
   depended on the loose `watchWindowShortcuts` signature:

   ```bash
   pnpm -r typecheck
   ```

---

## Source

Release notes (authoritative):
https://github.com/alex8088/electron-toolkit/blob/master/packages/utils/CHANGELOG.md
