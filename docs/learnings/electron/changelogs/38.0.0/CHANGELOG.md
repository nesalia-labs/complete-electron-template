# Electron 38.0.0 — Changelog

**Release date:** 2025-09-02

38.0.0 is a maintenance major with one notable internal change: the move from
`DIR_ASSETS` / `DIR_MODULE` / `DIR_EXE` to `app.getPath('assets')`. The new
features are high-leverage: stable `guid` tray icons on macOS,
`webFrameMain.fromFrameToken`, `app.getRecentDocuments()` on Windows/macOS,
and window accent color on Windows.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 140.0.7339.41     |
| Node.js   | 22.18.0           |
| V8        | 14.0              |

## Breaking changes

### 8.1 Internal switch from `DIR_ASSETS` / `DIR_MODULE` / `DIR_EXE`

Asset path queries that used `DIR_MODULE` / `DIR_EXE` should now go through
`app.getPath('assets')`.

```ts
// Before (37.x)
import { app } from 'electron';
const path = (app as any).getPath('module'); // internal

// After (38.0.0)
import { app } from 'electron';
const assetsPath = app.getPath('assets');
```

## New features

### `before-mouse-event` on `WebContents`

Carried over from 37.x; expanded in 38. Mouse handlers can intercept and
prevent default behavior at the Chromium layer.

```ts
win.webContents.on('before-mouse-event', (event, mouse) => {
  if (mouse.button === 'middle') event.preventDefault();
});
```

### `fileBacked` / `purgeable` in `process.getSystemMemoryInfo()` (macOS)

```ts
import { process } from 'electron';
const info = process.getSystemMemoryInfo();
console.log(info.fileBacked, info.purgeable);
```

### `innerWidth` / `innerHeight` options for `window.open`

```ts
window.open(url, '_blank', 'innerWidth=900,innerHeight=700');
```

### `guid` Tray option (macOS)

```ts
import { Tray, nativeImage } from 'electron';

new Tray(nativeImage.createFromPath('iconTemplate.png'), {
  guid: 'com.example.app.tray',
});
```

### `webFrameMain.fromFrameToken(processId, frameToken)`

```ts
import { webFrameMain } from 'electron';

const frame = webFrameMain.fromFrameToken(processId, frameToken);
await frame.executeJavaScript('document.title');
```

### `app.getRecentDocuments()` (Windows/macOS)

```ts
import { app } from 'electron';
const recent = app.getRecentDocuments();
```

### `HIDDevice.collections`

Carried from 37. Access the HID collection hierarchy for permissioned
devices.

### `screen.dipToScreenPoint` / `screenToDipPoint` (Linux X11)

```ts
import { screen } from 'electron';
const physical = screen.dipToScreenPoint({ x: 100, y: 100 });
```

### `palette` and `header` menu item roles (macOS)

```ts
import { Menu } from 'electron';
Menu.buildFromTemplate([{ role: 'palette' }, { role: 'header' }]);
```

### `getAccentColor` / `setAccentColor` on Windows

```ts
const win = new BrowserWindow();
win.setAccentColor('#ff0066');
```

### `win.isContentProtected()`

Exposed to check window protection status (carried from 37.x).

## Deprecations

None.

## Migration tips from 37.x

- Audit mouse handlers — if you relied on default bubbling, review the new
  `before-mouse-event` interception behavior.
- Assign a stable `guid` to Tray icons on macOS to preserve position across
  launches.
- Replace any custom recent-document implementations with
  `app.getRecentDocuments()` on Windows/macOS.
- On Windows, use `getAccentColor` / `setAccentColor` instead of recreating
  windows to change the accent color.
- Migrate to `webFrameMain.fromFrameToken(processId, frameToken)` for
  cross-context frame lookup.
- Replace any internal `DIR_MODULE` / `DIR_EXE` asset lookups with
  `app.getPath('assets')`.

## Source

[https://github.com/electron/electron/releases/tag/v38.0.0](https://github.com/electron/electron/releases/tag/v38.0.0)
