# @electron-toolkit/utils — Usage Guide

## Overview

`@electron-toolkit/utils` is a small, opinionated companion package maintained by
[alex8088/electron-toolkit](https://github.com/alex8088/electron-toolkit). It bundles
the cross-platform glue code that every real-world Electron application ends up
rewriting: dev/prod environment detection, runtime platform checks, login item
registration, system proxy bypass, and a tiny set of frameless window IPC helpers.
The intent is to keep the main process bootstrap small and consistent.

The package's history is one of incremental consolidation. The 3.x line bundled an
IPC helper directly inside the utils package. In the **4.0.0 release
(2025-02-06)** that helper was removed: IPC is a first-class concern in modern
Electron apps and now lives in a dedicated package — `@electron-toolkit/typed-ipc`
or `@electron-toolkit/preload` — so utils can stay focused on environment,
platform, and OS-integration primitives. If you are upgrading from 3.x, treat 4.0.0
as a deliberate narrowing of the API surface rather than a feature drop.

After the 4.0.0 cut, `@electron-toolkit/utils` exports a deliberately small API:

| Export group | Purpose |
|--------------|---------|
| `is`          | Boolean predicates for dev/prod state |
| `platform`    | Normalized OS detection (mac/win/linux) |
| `electronApp` | Main-process helpers: `setAutoLaunch`, `skipProxy`, `registerFramelessWindowIpc`, `watchWindowShortcuts` |
| `optimizer`   | Vite/Electron dev-server URL resolution: `watchWindowShortcuts`, plus a `getMainWindow` style helper |

The remainder of this guide focuses on what is new in 4.0.0, the migration path
from 3.x, and the gotchas that bite teams during the upgrade.

---

## Key new features since 3.0.0

### 1. Production-safe DevTools shortcut (F12)

In 3.x, `optimizer.watchWindowShortcuts` could leave the F12 → DevTools shortcut
active in packaged builds. That is harmless in development, but in a shipped app
it is a small but real attack-surface expansion: anyone with a keyboard can open
DevTools in a production window.

In 4.0.0, the shortcut is **explicitly gated on dev mode**. Packaged builds
ignore F12 entirely. You no longer need to wrap the call in
`if (is.dev)`; the helper does it for you.

```ts
// electron/main/index.ts
import { optimizer } from '@electron-toolkit/utils'

const win = new BrowserWindow({ /* ... */ })
optimizer.watchWindowShortcuts({ window: win })
```

If you had a custom shortcut that you wanted to keep working in production, wire
it up via Electron's normal `before-input-event` handler on the window — do not
rely on `watchWindowShortcuts` outside dev.

### 2. `setAutoLaunch` actually works on Windows

In 3.x, `electronApp.setAutoLaunch(true)` on Windows did not reliably toggle the
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry value. The API
returned success but the login item never registered on many machines. In 4.0.0
the implementation is corrected:

```ts
import { electronApp } from '@electron-toolkit/utils'

// macOS: uses app.setLoginItemSettings under the hood
// Windows: writes the registry Run key directly
electronApp.setAutoLaunch(true)
```

If your 3.x codebase carried a workaround (for example, manually invoking
`app.setLoginItemSettings` on Windows, or shelling out to `reg add`), remove it.
The corrected behavior may now conflict with your workaround and double-register
the app at login.

### 3. Tighter TypeScript surface

The 4.0.0 release tightens the signature of `optimizer.watchWindowShortcuts`. The
options bag now requires explicit typing for `zoom` and `escToCloseWindow`. This
catches a class of bugs (boolean vs. structured options) at compile time rather
than at runtime.

```ts
// Typed explicitly. No more `as any` to satisfy the looser 3.x signature.
optimizer.watchWindowShortcuts({
  window: win,
  zoom: true,
  escToCloseWindow: true,
})
```

Run `tsc --noEmit` after the upgrade. Anything that relied on the loose signature
will surface immediately.

### 4. Smaller, focused export surface

The headline change is structural: removing the IPC helper means there is one
less thing in `utils` to confuse with `typed-ipc` or `preload`. If your IDE's
auto-import picks up the wrong helper today, the upgrade will force a manual
review and a clean import.

---

## Migration path: 3.0.0 → 4.0.0

### Step 1 — Identify IPC helper usage

The IPC helper that used to live in `@electron-toolkit/utils` is gone. Find every
import site first:

```bash
# ripgrep across the desktop app
rg "from '@electron-toolkit/utils'" apps/desktop
```

Then look for any import of the IPC helper shape — typically `ipcMain` wrapper
functions exposed on the default export or a named `ipc` export. If you find
them, you need to choose a replacement **before** bumping the version, because
the package will fail to type-check as soon as the new version is installed.

### Step 2 — Pick a replacement

There are two first-party options maintained by the same team:

- **`@electron-toolkit/typed-ipc`** — end-to-end typed IPC between main, preload,
  and renderer. Best when you control both sides and want channel names, params,
  and return types checked at compile time.
- **`@electron-toolkit/preload`** — prebuilt preload script that exposes a small
  set of safe APIs to the renderer via `contextBridge`. Best when you want the
  boring, correct default and don't need deeply typed channels.

For most teams, `@electron-toolkit/typed-ipc` is the right choice. The shape of
the migration is roughly:

```ts
// Before (3.x) — IPC helper lived in utils
import { ipc } from '@electron-toolkit/utils'
ipc.handle('user:create', (payload) => /* ... */)

// After (4.x) — typed-ipc owns the surface
import { ipcMain } from 'electron'
import { router } from './router' // your typed router
router.user.create.handle(async (payload) => /* ... */)
```

The exact shape depends on which typed-ipc APIs you use, but the principle is
the same: the router is now your single source of truth for channel names and
payloads, and the utils package is no longer in the IPC path.

### Step 3 — Fix `watchWindowShortcuts` callers

Add explicit options:

```ts
// Before (3.x) — loose signature accepted partial options
optimizer.watchWindowShortcuts({ window: win })

// After (4.x) — explicit options bag
optimizer.watchWindowShortcuts({
  window: win,
  zoom: true,
  escToCloseWindow: true,
})
```

If you only need the default behavior (zoom + ESC-to-close), you can pass the
full defaults above. The values are stable across platforms.

### Step 4 — Remove Windows `setAutoLaunch` workarounds

If your 3.x code did any of the following to compensate for the broken Windows
implementation, delete it:

- Manual `app.setLoginItemSettings({ openAtLogin: true })` on Windows (no-op
  there; the fix uses the registry).
- Spawning `reg add` or calling `winreg` to write the Run key.
- A custom `electronApp.setAutoLaunch` wrapper that hid the bug.

After the upgrade, call `electronApp.setAutoLaunch(true)` once and confirm the
Run key is written. Then exercise the full login flow: log out, log back in, and
verify the app launches. Workarounds left in place will produce duplicate login
items.

### Step 5 — Type-check and smoke-test

```bash
pnpm --filter desktop typecheck
pnpm --filter desktop build
```

Then manually verify the four behaviors that changed:

1. Press F12 in a packaged build — DevTools must **not** open.
2. Toggle auto-launch on Windows, log out, log back in — the app must start.
3. Toggle auto-launch on macOS — the login item must appear in
   *System Settings → General → Login Items*.
4. Use zoom (Ctrl/Cmd +/-, Ctrl/Cmd 0) and ESC in every window — both must
   behave the same as in 3.x.

---

## Common pitfalls and gotchas

### 1. `watchWindowShortcuts` no longer accepts a partial options bag

The most common upgrade failure is a `tsc` error like:

> `Argument of type '{ window: BrowserWindow }' is not assignable to parameter of type 'WatchWindowShortcutsOptions'.`

The 4.0.0 type now requires `zoom` and `escToCloseWindow` to be explicit. If you
have a shared helper that wraps `watchWindowShortcuts`, fix it once there
rather than at every call site.

### 2. `setAutoLaunch` is now correct on Windows — including for code that was wrong

If your 3.x code worked around the broken Windows behavior, removing the
workaround is the fix. Leaving it in produces two login items on first launch.
Audit your main process startup for any code paths that call
`app.setLoginItemSettings` or shell out to `reg` near `electronApp.setAutoLaunch`.

### 3. DevTools shortcut is intentionally inert in production

Do not try to "fix" the F12 gating by calling `optimizer.watchWindowShortcuts`
unconditionally — the gating is by design. If you ship a diagnostics build and
need DevTools, gate the call on a build-time flag or an env var:

```ts
if (is.dev || process.env.ENABLE_DEVTOOLS === '1') {
  optimizer.watchWindowShortcuts({ window: win, zoom: true, escToCloseWindow: true })
}
```

Note that `watchWindowShortcuts` itself is now dev-gated internally, so this is
redundant unless you also want to disable the zoom/ESC bindings in production.

### 4. The IPC helper is gone, not deprecated

There is no deprecation warning; the export simply no longer exists. A
`tsc --noEmit` is the fastest way to find every site that needs to change. A
runtime `require` will throw `TypeError: ... is not a function`, which is what
most teams hit first when they ship a partial upgrade.

### 5. `registerFramelessWindowIpc` is unchanged — but verify your preload still references `'win:invoke'`

The 4.0.0 release keeps `registerFramelessWindowIpc()` and its `'win:invoke'`
channel intact. If your preload script sends custom frameless control messages
on a different channel, they will not be picked up. The canonical channel is
`'win:invoke'`, accepting one of `'show' | 'showInactive' | 'min' | 'max' | 'close'`.

### 6. `skipProxy()` is a no-op on Linux

`electronApp.skipProxy()` writes to `app.commandLine.appendSwitch('--no-proxy-server')`
on macOS and Windows. On Linux the switch has historically been ineffective for
some desktop environments. If proxy bypass is critical on Linux, validate it on
your target distros rather than trusting the API to "just work."

---

## References

- Release notes (source of truth for this guide):
  https://github.com/alex8088/electron-toolkit/blob/master/packages/utils/CHANGELOG.md
- Companion packages referenced for the IPC migration:
  - `@electron-toolkit/typed-ipc`
  - `@electron-toolkit/preload`
- Electron docs — for what `app.setLoginItemSettings` actually does on each
  platform, and for the `before-input-event` shortcut pattern that the toolkit
  wraps.
