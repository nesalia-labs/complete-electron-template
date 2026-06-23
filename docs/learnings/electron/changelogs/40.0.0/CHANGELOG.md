# Electron 40.0.0 — Changelog

**Release date:** 2026-01-16

40.0.0 is **the largest jump in the 35 → 42 range**. Two reasons:

1. **Node 22 → Node 24.** A major ABI change that breaks native modules and
   tightens OpenSSL behavior.
2. **Renderer clipboard removal.** The clipboard API is no longer reachable
   from renderer processes. This is a significant app-level migration for
   any product with rich text editing, image paste, or clipboard history.

The new features are good (hardware acceleration detection, RGBAF16 HDR,
WebSocket auth via `login`, MSIX auto-update, ESM imports in preloads), but
the breaking changes dominate the upgrade cost.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 144.0.7559.60     |
| Node.js   | **24.11.1** (major bump from 22) |
| V8        | 14.4              |

## Breaking changes

### 10.1 Renderer clipboard removed

The `clipboard` API is no longer accessible from renderer processes.
Operations must be moved to the main process via IPC.

```ts
// Before (39.x) — works in renderer
import { clipboard } from 'electron';
clipboard.writeText('hello');

// After (40.0.0) — not available in renderer
// Move to main process:
import { ipcMain, clipboard } from 'electron';

ipcMain.handle('clip:write', (_e, text: string) => {
  clipboard.writeText(text);
});
```

### 10.2 `dsym.zip` format change

`dsym.zip` artifacts are now compressed with `tar.xz`. CI/unpack steps must
be updated.

```yaml
# Before (39.x)
- run: unzip dsym.zip

# After (40.0.0)
- run: tar -xJf dsym.zip
```

### 10.3 Node 22 → 24 ABI

Native modules built against Node 22 headers need to be rebuilt against
Node 24. OpenSSL-by-extension APIs that changed between Node majors may
also break.

```bash
# Rebuild native modules in CI
pnpm rebuild --filter desktop
```

## New features

### `app.isHardwareAccelerationEnabled()`

```ts
import { app } from 'electron';

if (!app.isHardwareAccelerationEnabled()) {
  // user has disabled hardware acceleration via command line
}
```

### RGBAF16 / scRGB HDR (Offscreen Rendering)

```ts
new BrowserWindow({
  webPreferences: { offscreen: { useSharedTexture: true } },
});
```

### WebSocket authentication via `login` event

```ts
win.webContents.on('login', (event, _details, authInfo, callback) => {
  if (authInfo.isProxy) return; // use proxy auth
  event.preventDefault();
  callback('user', 'pass');
});
```

### `bypassCustomProtocolHandlers` for `net.request`

```ts
const req = net.request({ url: 'app://resource' });
req.bypassCustomProtocolHandlers = true;
```

### `systemPreferences.getAccentColor()` on Linux

```ts
import { systemPreferences } from 'electron';
const accent = systemPreferences.getAccentColor();
```

### Importing external shared textures as `VideoFrame`

```ts
// New path for GPU-driven video pipelines.
```

### `memory-eviction` exit reason for child processes

```ts
import { utilityProcess } from 'electron';
const child = utilityProcess.fork('worker.cjs');
child.on('exit', (code) => {
  if (code === 'memory-eviction') {
    // graceful restart logic
  }
});
```

### DevTools auto-focus on element inspection

### Dynamic ESM imports in non-context-isolated preloads (carried from 39.x)

### `nativeImage.createFromNamedImage` supports SF Symbol names

```ts
import { nativeImage } from 'electron';
const img = nativeImage.createFromNamedImage('sf:arrow.up.circle');
```

### `window.setAccentColor(null)` to follow system settings

```ts
win.setAccentColor(null); // reset to system accent
```

## Deprecations

- Renderer clipboard API access (effectively a removal in 40).

## Migration tips from 39.x

- Move any clipboard operations from renderer processes to the main process
  using IPC. Direct renderer access is **no longer functional**.
- Update build/CI pipelines that consume `dsym.zip` artifacts to handle the
  new `tar.xz` compression.
- Replace any custom hardware acceleration detection logic with
  `app.isHardwareAccelerationEnabled()`.
- Migrate custom WebSocket auth flows to use the standard `login` event on
  `webContents` instead of workaround implementations.
- **Major Node.js version bump from 22.x to 24.x.** Audit native modules and
  APIs for compatibility. Node 24 drops older OpenSSL APIs and changes
  several V8 flag behaviors.

## Source

[https://github.com/electron/electron/releases/tag/v40.0.0](https://github.com/electron/electron/releases/tag/v40.0.0)
