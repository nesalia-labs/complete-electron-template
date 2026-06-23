# Electron 37.0.0 — Changelog

**Release date:** 2025-06-24

37.0.0 is a smaller major. The big story is the **Web Serial / WebUSB blocklist
support** (which means apps now opt in to those origins explicitly) and a
**utility process crash fix**. The new features skew toward input/menu polish
and an `innerWidth` / `innerHeight` option for `window.open`.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 138.0.7204.35     |
| Node.js   | 22.16.0           |
| V8        | 13.8              |

## Breaking changes

### 7.1 `ProtocolResponse.session = null` is removed

Passing `null` to create a random session is no longer supported.

```ts
// Before (36.x)
protocol.registerStreamProtocol('app', (req, cb) => {
  cb({
    statusCode: 200,
    session: null, // implicit random session
  });
});

// After (37.0.0)
protocol.registerStreamProtocol('app', (req, cb) => {
  const session = sessionFromMainProcess();
  cb({ statusCode: 200, session });
});
```

### 7.2 Web Serial / WebUSB blocklists supported

The platform now respects Chromium's blocklist for Web Serial and WebUSB
origins. Test your hardware integrations.

### 7.3 Utility process crash fixes

- Utility processes no longer crash on unhandled rejections.
- A utility process no longer runs user scripts after `process.exit`.

## New features

### `before-mouse-event` on `WebContents`

```ts
win.webContents.on('before-mouse-event', (event, mouse, keyboard) => {
  if (mouse.button === 'middle') {
    event.preventDefault(); // block middle-click
  }
});
```

### `innerWidth` / `innerHeight` for `window.open`

```ts
window.open('https://example.com', '_blank', 'innerWidth=800,innerHeight=600');
```

### `nativeTheme.shouldUseDarkColorsForSystemIntegratedUI`

Distinguishes system vs app theme on macOS, useful for tray icon inversion.

```ts
import { nativeTheme } from 'electron';

if (nativeTheme.shouldUseDarkColorsForSystemIntegratedUI) {
  // use a dark tray icon
}
```

### `scriptURL` on `ServiceWorkerMain`

```ts
const sw: ServiceWorkerMain;
console.log(sw.scriptURL);
```

### Sublabel support for menus (macOS >= 14.4)

```ts
import { Menu } from 'electron';

Menu.buildFromTemplate([
  { label: 'File', sublabel: '⌘F' },
]);
```

### `HIDDevice.collections`

```ts
const collections = device.collections; // HID collections hierarchy
```

### `screen.dipToScreenPoint` / `screenToDipPoint` (Linux X11)

```ts
import { screen } from 'electron';

const physical = screen.dipToScreenPoint({ x: 100, y: 100 });
```

### `net.request` priority options

```ts
const req = net.request({ url: 'https://example.com' });
req.priorityIncremental = true; // 37.0.0+
```

### `win.isContentProtected()` (Windows)

```ts
const protected = win.isContentProtected();
```

## Deprecations

- `NativeImage.getBitmap()` — documentation fixed; deprecation still active.

## Migration tips from 36.x

- Replace `ProtocolResponse.session = null` with an explicit session reference.
- Stop using `NativeImage.getBitmap()`; it will be removed in the next major.
- Verify ESM/CJS interop in packaged apps.
- Test disabled menu items on macOS — a reverted change affects grey-out
  behavior in 37.
- Review new web platform changes in Chromium 138 affecting Web Serial,
  WebUSB, and autofill.

## Source

[https://github.com/electron/electron/releases/tag/v37.0.0](https://github.com/electron/electron/releases/tag/v37.0.0)
