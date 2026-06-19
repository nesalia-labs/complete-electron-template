# Electron: Comprehensive Usage Guide (35.7.5 → 42.4.1)

This guide is a senior-level walkthrough of the Electron major-version journey from
**35.7.5** (the version pinned by this template) through **42.4.1** (current). It is
opinionated, focuses on trade-offs, and uses TypeScript for all examples. Every fact
here traces back to the per-version release notes linked at the bottom.

---

## 1. Overview

Electron is a runtime that combines Chromium, Node.js, and V8 into a single desktop
application framework. The three engines move on independent cadences, and each
Electron major is a coordinated bump of all three. Tracking the major timeline
matters because **breaking changes cluster around engine upgrades**, not just around
Electron's own API surface.

### Stack upgrades at a glance

| Electron | Chromium          | Node.js  | V8  | Release    |
|----------|-------------------|----------|-----|------------|
| 35.7.5   | (template pin)    |          |     | baseline   |
| 36.0.0   | 136.0.7103.48     | 22.14.0  | 13.6 | 2025-04-28 |
| 37.0.0   | 138.0.7204.35     | 22.16.0  | 13.8 | 2025-06-24 |
| 38.0.0   | 140.0.7339.41     | 22.18.0  | 14.0 | 2025-09-02 |
| 39.0.0   | 142.0.7444.52     | 22.20.0  | 14.2 | 2025-10-27 |
| 40.0.0   | 144.0.7559.60     | **24.11.1** | 14.4 | 2026-01-16 |
| 41.0.0   | 146.0.7680.65     | 24.14.0  | 14.6 | 2026-03-11 |
| 42.0.0   | 148.0.7778.96     | 24.15.0  | 14.8 | 2026-05-06 |

**The 40.x line is the largest jump.** Node 22 → 24 invalidates a number of native
modules and tightens OpenSSL behavior. The 42.x line is the second-largest: it
reworks the install flow (lazy binary download), changes offscreen rendering defaults,
and replaces macOS `NSUserNotification` with `UNNotification`.

### Why these jumps matter for this template

This template ships Electron 35.0.0 (apps/desktop) and uses oRPC, Vite, and TanStack
Start. The good news: most of the breaking changes between 35 → 42 are in niche
surfaces (offscreen rendering, macOS notification internals, asset-path lookups).
The bad news: the **engine bump cadence means every major risks breaking native
modules and Chromium-driven web platform behavior** you depend on in the renderer.

---

## 2. Key new features since 35.7.5

Below are the highest-leverage additions across 36 → 42, with TypeScript examples.
The emphasis is on APIs you will actually reach for, not on cosmetic menu/role
additions.

### 2.1 Preload script redesign (36)

`Session.getPreloads` / `Session.setPreloads` are replaced with an explicit
register/unregister lifecycle. The new model makes preload ownership explicit
and supports sandboxes more cleanly.

```ts
// Before (35.x)
import { session } from 'electron';

session.defaultSession.setPreloads([path.join(__dirname, 'preload.cjs')]);
const preloads = session.defaultSession.getPreloads();

// After (36.0.0+)
import { session } from 'electron';

const { id } = await session.defaultSession.registerPreloadScript({
  script: fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf-8'),
  type: 'frame',
});

const all = session.defaultSession.getPreloadScripts();
await session.defaultSession.unregisterPreloadScript(id);
```

### 2.2 Cross-world code execution via contextBridge (36)

`contextBridge.executeInMainWorld` lets privileged code run in the page's main
world without exposing a long-lived global. Useful for one-shot polyfills.

```ts
// main world (privileged preload)
import { contextBridge } from 'electron';

contextBridge.executeInMainWorld({
  key: '__appVersion',
  callback: () => '42.4.1',
});
```

### 2.3 Snap-arranged window detection (36)

`BrowserWindow.isSnapped()` is a cheap, native check for whether a Windows
window is in a Snap layout. Use it to adjust in-app behavior (e.g., compact
toolbars) without polling.

```ts
import { BrowserWindow } from 'electron';

const win = new BrowserWindow({ width: 1200, height: 800 });
if (win.isSnapped()) {
  // adjust layout
}
```

### 2.4 Rounded corners on Windows (36)

```ts
new BrowserWindow({
  width: 1200,
  height: 800,
  roundedCorners: true, // 36.0.0+
});
```

### 2.5 New ServiceWorkerMain class (36)

Inspect and interact with main-process service workers without dropping into
raw DevTools Protocol calls.

```ts
import { app, ServiceWorkerMain } from 'electron';

await app.whenReady();
const workers: ServiceWorkerMain[] = []; // populated as registered
for (const sw of workers) {
  console.log(sw.scriptURL, sw.scope);
}
```

### 2.6 before-mouse-event interception (37)

Intercept and prevent the default behavior of mouse events at the Chromium
layer — useful for custom drag regions, focus-stealing prevention, and IME
workarounds.

```ts
import { BrowserWindow } from 'electron';

const win = new BrowserWindow({ webPreferences: {} });
win.webContents.on('before-mouse-event', (event, mouse, keyboard) => {
  if (mouse.button === 'middle') {
    event.preventDefault(); // block middle-click open
  }
});
```

### 2.7 window.open dimensions (37)

`window.open` now accepts `innerWidth` / `innerHeight`, which means popups
opened from the renderer can be sized without a round-trip to the main process.

```ts
window.open('https://example.com', '_blank', 'innerWidth=800,innerHeight=600');
```

### 2.8 Tray icon position stability on macOS (38)

Pass a stable `guid` so the OS remembers tray icon position across launches.

```ts
import { Tray, nativeImage } from 'electron';

const tray = new Tray(nativeImage.createFromPath('iconTemplate.png'), {
  guid: 'com.example.app.tray',
});
```

### 2.9 webFrameMain.fromFrameToken (38)

Look up a `WebFrameMain` from `(processId, frameToken)` — the standard
mechanism when working with DevTools Protocol or extension APIs.

```ts
import { webFrameMain } from 'electron';

const frame = webFrameMain.fromFrameToken(processId, frameToken);
await frame.executeJavaScript('document.title');
```

### 2.10 app.getRecentDocuments() (38)

Cross-platform recent documents on Windows and macOS — replaces custom
implementations.

```ts
import { app } from 'electron';

const recent = app.getRecentDocuments(); // string[]
```

### 2.11 Window accent color (Windows, 38)

Change the OS-level accent color of a window after creation.

```ts
import { BrowserWindow } from 'electron';

const win = new BrowserWindow();
win.setAccentColor('#ff0066');
```

### 2.12 RGBAF16 / scRGB HDR (39)

Offscreen rendering now supports 10/16-bit HDR pipelines.

```ts
import { BrowserWindow } from 'electron';

const win = new BrowserWindow({
  webPreferences: { offscreen: { useSharedTexture: true } },
});
win.webContents.setFrameRate(60);
win.webContents.on('paint', (_e, _dirty, image) => {
  // image is now RGBAF16 / scRGB
});
```

### 2.13 ESM imports in non-context-isolated preloads (39)

`await import(...)` works in preloads that opted out of context isolation.
This unlocks dynamic loading of native modules per-request.

```ts
// preload (non-isolated)
const { heavyModule } = await import('./heavy.cjs');
```

### 2.14 WebAuthn with Touch ID on macOS (42)

```ts
import { app } from 'electron';

app.configureWebAuthn({
  touchID: { keychainAccessGroup: 'com.example.app' },
});
```

### 2.15 MSIX auto-updating (41)

The new MSIX update path eliminates the need for a custom updater service on
Windows for apps distributed via MSIX.

```ts
// configuration only; surface is platform-managed
import { app } from 'electron';
// app.getAutoUpdater() / app.setAutoUpdater(...) integrate with the new
// MSIX background task.
```

### 2.16 Renderer OOM stack capture (42)

```ts
import { app } from 'electron';

app.on('render-process-gone', (_e, _wc, details) => {
  if (details.reason === 'oom') {
    // details.exitCode, details.reason, and a stack frame are now available
  }
});
```

### 2.17 Lazy binary download (42)

The Electron npm package no longer downloads itself in `postinstall`. The
binary is fetched the first time the main bin script runs. CI must run the
binary at least once (or invoke `install-electron`) to populate
`node_modules` deterministically.

```bash
# New explicit pre-warm step
npx install-electron
# or
ELECTRON_INSTALL_PLATFORM=linux ELECTRON_INSTALL_ARCH=x64 node -e "require('electron')"
```

`ELECTRON_SKIP_BINARY_DOWNLOAD` is gone — use `ELECTRON_INSTALL_PLATFORM` and
`ELECTRON_INSTALL_ARCH` instead for cross-platform builds.

---

## 3. Migration path: 35.7.5 → 42.4.1

The right migration is **one major at a time**. Electron's own release notes
flag this. Skipping versions increases the risk of stacked breaking changes
masking each other.

### Step 1 — 35.7.5 → 36.0.0

- Replace `session.getPreloads` / `setPreloads` with the new register API.
- Move all `ses.extensions.*` calls into the `Session.extensions` namespace.
- Remove `systemPreferences.isAeroGlassEnabled()` calls — no replacement.
- Drop `quota: 'syncable'` from `clearDataStorage`.
- Audit `PrinterInfo.status` / `PrinterInfo.isDefault` readers.
- Plan for GTK 4 default on GNOME.

### Step 2 — 36.0.0 → 37.0.0

- Replace `ProtocolResponse.session = null` with an explicit new session.
- Stop using `NativeImage.getBitmap()` (still works in 37; will be removed).
- Verify ESM/CJS interop in packaged apps.

### Step 3 — 37.0.0 → 38.0.0

- Replace any internal asset-path lookups (`DIR_MODULE`/`DIR_EXE`) with
  `app.getPath('assets')`.
- For macOS tray icons, add a stable `guid` for persistent positioning.
- Use `webFrameMain.fromFrameToken(processId, frameToken)` for cross-context
  frame lookups.
- Adopt `app.getRecentDocuments()` on Windows/macOS.

### Step 4 — 38.0.0 → 39.0.0

- Update `OffscreenSharedTexture` consumers to use the unified handle and
  read `colorSpace` from paint-event texture info.
- Audit any `window.open` consumers that depended on a non-resizable popup.
- Confirm tray icon GUIDs for persistent position on macOS.

### Step 5 — 39.0.0 → 40.0.0  ← **biggest jump**

- **Node 22 → 24.** Audit native modules and any code that uses
  OpenSSL-by-extension APIs that changed between Node majors.
- Move any clipboard operations out of the renderer and into the main
  process via IPC. Renderer-side clipboard is **removed** in 40.
- Update CI to handle the new `dsym.zip` tar.xz format.
- Use `app.isHardwareAccelerationEnabled()` instead of any custom detection.

### Step 6 — 40.0.0 → 41.0.0

- Re-verify cookie event handling — events that used to be silent now emit.
- Remove any reliance on DevTools errors being printed to console.
- If you build frameless Wayland windows, test the new shadow/border
  behavior.

### Step 7 — 41.0.0 → 42.0.0  ← **second-biggest jump**

- **macOS notifications now require code-signing.** Unsigned apps will
  receive a `'failed'` event on the `Notification` object. Handle it.
- Update install/CI scripts: the postinstall hook no longer downloads the
  binary. Pre-warm with `install-electron`.
- Stop using `ELECTRON_SKIP_BINARY_DOWNLOAD` — it's removed.
- Drop `quotas` from `Session.clearStorageData` calls.
- Explicitly set `webPreferences.offscreen.deviceScaleFactor` if you depend
  on prior Offscreen Rendering pixel dimensions.
- Adopt `Notification.handleActivation(callback)` for Windows click/reply/
  action button handling (including cold start).

---

## 4. Common pitfalls and gotchas

### 4.1 IPC: don't re-introduce the renderer-clipboard footgun

The single largest behavioral change in the 35 → 42 range is **renderer
clipboard removal in 40**. If your app reads from or writes to the clipboard
in the renderer, you have an immediate migration to plan.

```ts
// Renderer (do not do this in 40+)
import { clipboard } from 'electron'; // not available in renderer anymore
clipboard.writeText('hello');

// Correct: IPC to main
// preload
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clip', {
  write: (text: string) => ipcRenderer.invoke('clip:write', text),
});

// main
import { ipcMain, clipboard } from 'electron';

ipcMain.handle('clip:write', (_e, text: string) => {
  clipboard.writeText(text);
});
```

Trade-off: every clipboard call is now an IPC round-trip. For high-frequency
copy/paste (e.g., editor autosave-on-copy), batch.

### 4.2 Lazy binary download and supply chain

In 42, the Electron npm tarball no longer contains a pre-fetched binary, and
the `postinstall` step is gone. This is a security win: CI logs no longer run
undocumented install scripts. It is a build-system regression: you must
either run Electron at least once in your CI image, or call
`install-electron` explicitly.

```yaml
# .github/workflows/build-desktop.yml (excerpt)
- name: Pre-warm Electron binary
  run: npx install-electron
- name: Build
  run: pnpm --filter desktop build
```

### 4.3 macOS notifications and code-signing

If you ship an unsigned macOS build (dev, CI smoke tests), `new Notification()`
**will not display**, and a `'failed'` event fires. Test your notification
subscribers even in CI smoke runs.

```ts
import { Notification } from 'electron';

const n = new Notification({ title: 'Hi', body: 'world' });
n.on('failed', (_e, err) => console.error('notification failed:', err));
n.show();
```

### 4.4 Notification handleActivation on Windows

`Notification.handleActivation(callback)` (42) is the only reliable way to
handle clicks, replies, and action buttons across cold start and warm start
on Windows. Older "did the user click?" heuristics no longer cover cold start.

### 4.5 Node 24 native modules

The Node 22 → 24 jump in Electron 40 is the largest ABI risk in the 35 → 42
range. If you depend on any native module (better-sqlite3 in this template,
but also any image codec, keychain, etc.), rebuild against Electron's Node
24 headers.

```bash
pnpm rebuild --filter desktop
```

### 4.6 Offscreen Rendering deviceScaleFactor

In 42, the default OSR `deviceScaleFactor` changed from the primary display's
DSF to `1.0`. Any code that captured frames at "what the user sees" must now
explicitly set `webPreferences.offscreen.deviceScaleFactor` or accept a
change in pixel dimensions.

### 4.7 Service workers and the main process

The new `ServiceWorkerMain` class (36) is the right way to introspect
service workers from the main process. Do not try to scrape them via the
DevTools Protocol.

### 4.8 GTK 4 default

GNOME now uses GTK 4 by default. If your app embeds web content with custom
form controls, expect a visual shift. Custom themes may need updates.

### 4.9 `webRequest.filter.urls` → `excludeUrls`

Empty `urls` arrays in `webRequest` filters are deprecated; use
`excludeUrls` to carve out exemptions.

```ts
// Before (35.x)
session.defaultSession.webRequest.onBeforeRequest(
  { urls: [] },
  (_details, cb) => cb({ cancel: false }),
);

// After (36.0.0+)
session.defaultSession.webRequest.onBeforeRequest(
  { excludeUrls: ['*://*.example.com/*'] },
  (_details, cb) => cb({ cancel: false }),
);
```

### 4.10 Lifecycle: don't `app.quit()` from the renderer

A reminder that hasn't changed: `app` is main-process only. Reaching for
`ipcRenderer.send('app:quit')` is the standard pattern. The bigger lifecycle
risk in this range is the renderer-OOM stack capture in 42 — make sure your
crash reporter consumes it.

### 4.11 Packaging: `dsym.zip` is now `tar.xz` (40)

Update artifact-unpack steps in your release pipeline.

```yaml
- name: Extract symbols
  run: tar -xJf dsym.zip
```

---

## 5. References

Per-version release notes (the source of every fact above):

- [Electron 36.0.0 release notes](https://github.com/electron/electron/releases/tag/v36.0.0)
- [Electron 37.0.0 release notes](https://github.com/electron/electron/releases/tag/v37.0.0)
- [Electron 38.0.0 release notes](https://github.com/electron/electron/releases/tag/v38.0.0)
- [Electron 39.0.0 release notes](https://github.com/electron/electron/releases/tag/v39.0.0)
- [Electron 40.0.0 release notes](https://github.com/electron/electron/releases/tag/v40.0.0)
- [Electron 41.0.0 release notes](https://github.com/electron/electron/releases/tag/v41.0.0)
- [Electron 42.0.0 release notes](https://github.com/electron/electron/releases/tag/v42.0.0)
