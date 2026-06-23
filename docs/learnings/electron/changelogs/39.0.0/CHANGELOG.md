# Electron 39.0.0 — Changelog

**Release date:** 2025-10-27

39.0.0 is a **spec-compliance major**. The two most consequential changes are
the **`OffscreenSharedTexture` signature change** (a unified handle plus a
new `colorSpace` field) and **`window.open` always creating a resizable
popup**. The new features lean toward HDR and accessibility.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 142.0.7444.52     |
| Node.js   | 22.20.0           |
| V8        | 14.2              |

## Breaking changes

### 9.1 `OffscreenSharedTexture` unified handle + `colorSpace`

The shared texture info in the `webContents.on('paint')` event now exposes a
unified handle, and a `colorSpace` field is added to texture info.

```ts
// Before (38.x)
win.webContents.on('paint', (_e, _dirty, image) => {
  const handle = image.sharedTexture?.handle; // shape varied
});

// After (39.0.0)
win.webContents.on('paint', (_e, _dirty, image) => {
  const handle = image.sharedTexture?.handle; // unified native handle
  const cs = image.sharedTexture?.colorSpace; // ColorSpace object
});
```

### 9.2 `window.open` popups are always resizable

```ts
// Before (38.x) — a popup could be opened non-resizable via window features
window.open(url, '_blank', 'resizable=no');

// After (39.0.0) — the popup is always resizable per the HTML spec
window.open(url, '_blank', 'resizable=no'); // ignored, popup is resizable
```

This is a spec-compliance change. Any UX that depended on a locked-down
popup size will need to be re-thought.

## New features

### RGBAF16 / scRGB HDR in Offscreen Rendering

```ts
new BrowserWindow({
  webPreferences: { offscreen: { useSharedTexture: true } },
});
// Frames now arrive in RGBAF16 / scRGB HDR.
```

### `fileBacked` / `purgeable` in `process.getSystemMemoryInfo()` (macOS)

Carried from 38.x.

```ts
import { process } from 'electron';
const info = process.getSystemMemoryInfo();
```

### `guid` Tray option (macOS)

Carried from 38.x; required for persistent icon position.

### `webFrameMain.fromFrameToken(processId, frameToken)`

Carried from 38.x.

### Granular accessibility support management

```ts
import { app } from 'electron';
// New helper methods for finer accessibility control surface area.
```

### `app.getRecentDocuments()` (Windows/macOS)

Carried from 38.x.

### `USBDevice.configurations`

```ts
for (const cfg of device.configurations) {
  // iterate USB configuration descriptors
}
```

### `systemPreferences.getAccentColor()` on Linux

```ts
import { systemPreferences } from 'electron';
const accent = systemPreferences.getAccentColor();
```

### Window accent color on Windows (getAccentColor / setAccentColor)

Carried from 38.x.

### File System API grant status persists within a session

### `app.getPath('assets')` (DIR_ASSETS internally)

Carried from 38.x; replaces prior `DIR_MODULE` / `DIR_EXE` asset lookups.

### Dynamic ESM imports in non-context-isolated preloads

```ts
// preload (non-isolated)
const mod = await import('./heavy.cjs');
```

## Deprecations

None.

## Migration tips from 38.x

- Update code that consumes `OffscreenSharedTexture` to use the new unified
  handle property and read `colorSpace` from paint-event texture info.
- Audit any `window.open` consumers that depended on a non-resizable popup.
- Replace internal asset path queries using `DIR_MODULE` / `DIR_EXE` with
  `app.getPath('assets')`.
- Verify tray initialization on macOS — pass a stable `guid` to preserve
  position across launches.

## Source

[https://github.com/electron/electron/releases/tag/v39.0.0](https://github.com/electron/electron/releases/tag/v39.0.0)
