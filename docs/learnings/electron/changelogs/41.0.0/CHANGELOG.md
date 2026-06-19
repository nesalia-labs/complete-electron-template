# Electron 41.0.0 — Changelog

**Release date:** 2026-03-11

41.0.0 is a moderate major. The notable change is **reliable cookie event
emission** — events that used to be silently dropped are now emitted, which
can surface latent code paths. DevTools errors are no longer printed to the
console, which is a small but real observability regression.

The new features lean toward Windows packaging (MSIX auto-updating),
macOS privacy (TCC disclaim, geolocation flag), and WebAuthn
(`webContents.print` options, `focusOnNavigation`).

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 146.0.7680.65     |
| Node.js   | 24.14.0           |
| V8        | 14.6              |

## Breaking changes

### 11.1 Cookie events now always emit

Cookie changed events are now properly emitted in all cases. Code that
relied on events being silently dropped in some scenarios will start
receiving them.

```ts
// Before (40.x) — events could be silently dropped in some cases
session.defaultSession.cookies.on('changed', (_e, cookie, cause) => {
  // sometimes not called
});

// After (41.0.0) — events are reliably emitted
session.defaultSession.cookies.on('changed', (_e, cookie, cause) => {
  // called in all expected cases
});
```

### 11.2 DevTools errors are no longer printed to console

The console surface no longer includes DevTools-emitted errors. Capture
them explicitly if you need them.

## New features

### `webContents.getOrCreateDevToolsTargetId()`

```ts
const targetId = win.webContents.getOrCreateDevToolsTargetId();
```

### `--disable-geolocation` command-line flag for macOS

### NV12 support for imported shared textures

```ts
// New pixel format path for hardware video decoding.
```

### `disclaim` option for `UtilityProcess` (macOS TCC)

```ts
import { utilityProcess } from 'electron';

const child = utilityProcess.fork('worker.cjs', [], {
  disclaim: true, // skip TCC prompt for child process
});
```

### `reason` property on `Notification` 'closed' event (Windows)

```ts
new Notification({ title: 'Hi' }).on('closed', (event) => {
  console.log(event.reason); // 'dismissed' | 'expired' | ...
});
```

### External shared texture as `VideoFrame`

### `usePrinterDefaultPageSize` for `webContents.print()`

```ts
win.webContents.print({ usePrinterDefaultPageSize: true });
```

### `webPreferences.focusOnNavigation`

```ts
new BrowserWindow({
  webPreferences: { focusOnNavigation: false },
});
```

### `bypassCustomProtocolHandlers` for `net.request` (carried from 40.x)

### MSIX auto-updating support

```ts
// app.getAutoUpdater() / app.setAutoUpdater(...) integrate with the new
// MSIX background task.
```

### WebSocket authentication via `login` (carried from 40.x)

### `--experimental-transform-types` support

### `long-animation-frame` script attribution

```ts
// PerformanceObserver in the renderer can attribute long animation frames
// to specific script sources.
```

### `nativeImage.createFromNamedImage` SF Symbol support (carried from 40.x)

### Wasm trap handlers (WasmTrapHandlers fuse)

```ts
// Behind a fuse flag.
```

### Wayland frameless windows — GTK drop shadows and extended resize

```ts
new BrowserWindow({ frame: false }); // on Wayland, gets drop shadow + extended resize
```

## Deprecations

- DevTools errors no longer printed to console (also a behavior change).

## Migration tips from 40.x

- Review cookie event handling code — previously events may have been
  silently dropped; now they emit reliably.
- Remove any reliance on DevTools errors being printed to console;
  implement explicit error capture if needed.
- macOS apps can opt into the new `--disable-geolocation` flag for privacy.
- macOS utility processes can use the new `disclaim` option for TCC
  permissions.
- Linux/Wayland users with frameless windows should test `hasShadow: false`
  for fully decoration-free windows.

## Source

[https://github.com/electron/electron/releases/tag/v41.0.0](https://github.com/electron/electron/releases/tag/v41.0.0)
