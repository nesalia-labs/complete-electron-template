# Electron 42.0.0 — Changelog

**Release date:** 2026-05-06

42.0.0 is **the second-largest jump in the 35 → 42 range**. Three changes
dominate:

1. **macOS notifications now require code-signing.** Unsigned builds emit
   a `'failed'` event on the `Notification` object.
2. **Lazy binary download replaces `postinstall`.** The Electron npm
   package no longer downloads itself via a `postinstall` script. CI must
   pre-warm.
3. **Offscreen Rendering `deviceScaleFactor` default changes** from
   primary display DSF to a constant `1.0`.

The new features are also high-leverage: `Notification.handleActivation`
for Windows click/reply/action buttons, Touch ID WebAuthn, dynamic ESM
imports, and granular accessibility.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 148.0.7778.96     |
| Node.js   | 24.15.0           |
| V8        | 14.8              |

## Breaking changes

### 12.1 macOS notifications migrated to `UNNotification`

`NSUserNotification` is deprecated at the Apple level. Electron now uses
`UNNotification`. **Code-signing is required for notifications to display
on macOS.** Unsigned apps will receive a `'failed'` event.

```ts
// Before (41.x) — worked on unsigned builds
import { Notification } from 'electron';
new Notification({ title: 'Hi' }).show();

// After (42.0.0) — unsigned builds fail silently with a 'failed' event
import { Notification } from 'electron';

const n = new Notification({ title: 'Hi' });
n.on('failed', (_e, err) => {
  console.error('notification failed:', err);
});
n.show();
```

### 12.2 Lazy binary download replaces `postinstall`

The Electron npm package no longer downloads the binary in `postinstall`.
The binary is fetched the first time the main bin script runs. A new
`install-electron` script can trigger the download manually.

```bash
# Before (41.x) — postinstall auto-downloaded the binary
pnpm install
node_modules/.bin/electron .

# After (42.0.0) — first invocation triggers the download,
# or pre-warm with install-electron
npx install-electron
node_modules/.bin/electron .
```

This is a **supply-chain security win**: postinstall scripts are a known
attack surface, and Electron's install path is now auditable.

### 12.3 Offscreen Rendering default `deviceScaleFactor` is `1.0`

```ts
// Before (41.x) — default was primary display DSF
new BrowserWindow({ webPreferences: { offscreen: true } });

// After (42.0.0) — default is 1.0
new BrowserWindow({
  webPreferences: {
    offscreen: { deviceScaleFactor: 2 }, // explicit override
  },
});
```

### 12.4 `quotas` removed from `Session.clearStorageData`

`Session.clearStorageData({ quotas: ... })` is no longer valid (removed
upstream in Chromium).

```ts
// Before (41.x)
session.defaultSession.clearStorageData({ quotas: { ... } });

// After (42.0.0)
session.defaultSession.clearStorageData();
```

### 12.5 `ELECTRON_SKIP_BINARY_DOWNLOAD` removed

The variable is gone due to the new lazy download behavior. Use
`ELECTRON_INSTALL_PLATFORM` / `ELECTRON_INSTALL_ARCH` for cross-platform
builds.

```bash
# Before (41.x)
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install

# After (42.0.0)
ELECTRON_INSTALL_PLATFORM=linux ELECTRON_INSTALL_ARCH=x64 pnpm install
npx install-electron
```

## New features

### `Notification.getHistory()` (macOS)

```ts
import { Notification } from 'electron';
const history = Notification.getHistory();
```

### `Notification.handleActivation(callback)` on Windows

Handles clicks, replies, and action buttons across cold start and warm
start.

```ts
import { Notification } from 'electron';

const n = new Notification({
  title: 'New message',
  body: 'Click to reply',
  actions: [{ type: 'button', text: 'Reply' }],
});
n.handleActivation((event) => {
  if (event.type === 'button') {
    // user clicked the Reply button
  }
});
n.show();
```

### `id` and `groupId` options in `Notification` constructor (macOS)

```ts
new Notification({
  id: 'msg-42',
  groupId: 'thread-7',
  title: 'Reply',
});
```

### `urgency` option in `Notification` (Windows)

```ts
new Notification({ title: 'Critical', urgency: 'critical' });
```

### `app.configureWebAuthn({ touchID })` (macOS)

```ts
import { app } from 'electron';

app.configureWebAuthn({
  touchID: { keychainAccessGroup: 'com.example.app' },
});
```

### `select-webauthn-account` session event

```ts
session.defaultSession.on('select-webauthn-account', (event, accounts, cb) => {
  event.preventDefault();
  cb(accounts[0]); // pick an account
});
```

### `app.isActive()` (macOS)

```ts
import { app } from 'electron';
if (app.isActive()) {
  // foreground / active state
}
```

### `nativeTheme.shouldDifferentiateWithoutColor` (macOS)

```ts
import { nativeTheme } from 'electron';
if (nativeTheme.shouldDifferentiateWithoutColor) {
  // use shape, not just color, to convey state
}
```

### `globalShortcut.setSuspended()` / `isSuspended()`

```ts
import { globalShortcut } from 'electron';

globalShortcut.setSuspended(true); // temporarily ignore hotkeys
const suspended = globalShortcut.isSuspended();
```

### `webContents.getOrCreateDevToolsTargetId()` (carried from 41.x)

### `webContents.print()` `usePrinterDefaultPageSize` (carried from 41.x)

### `webPreferences.focusOnNavigation` (carried from 41.x)

### Renderer OOM stack capture

```ts
app.on('render-process-gone', (_e, _wc, details) => {
  if (details.reason === 'oom') {
    // details now includes a stack frame
  }
});
```

### `allowExtensions` privilege for `protocol.registerSchemesAsPrivileged()`

```ts
import { protocol } from 'electron';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { allowExtensions: true } },
]);
```

### `ELECTRON_INSTALL_PLATFORM` / `ELECTRON_INSTALL_ARCH` variables

### MSIX auto-updating (carried from 41.x)

### Heap profiling support in `contentTracing`

```ts
import { contentTracing } from 'electron';
await contentTracing.startRecording({ includedCategories: ['v8.gc'] });
```

### Shared texture pixel formats: `nv16` and `p010le` (10-bit YUV)

```ts
// New pixel format support for hardware video decoding.
```

### `view.setBounds` animation support + `view.setBackgroundBlur`

```ts
view.setBackgroundBlur({ radius: 10 });
```

### Wayland frameless window shadows (carried from 41.x)

### Wasm trap handlers (carried from 41.x)

### `--experimental-transform-types` (carried from 41.x)

### `long-animation-frame` script attribution (carried from 41.x)

## Deprecations

- `NSUserNotification` API on macOS — replaced by `UNNotification`.
- `ELECTRON_SKIP_BINARY_DOWNLOAD` — removed.
- `quotas` option on `Session.clearStorageData` — removed.

## Migration tips from 41.x

- **Code-sign your macOS app if you use notifications**, or handle the new
  `'failed'` event on unsigned builds.
- **Update install/CI scripts.** The postinstall hook no longer downloads
  the binary. Run the binary once (or invoke `install-electron`) to
  populate `node_modules` ahead of time.
- Stop using `ELECTRON_SKIP_BINARY_DOWNLOAD` — it has been removed. Use
  `ELECTRON_INSTALL_PLATFORM` / `ELECTRON_INSTALL_ARCH` instead for
  cross-platform installs.
- Audit `Session.clearStorageData` calls and remove any `quotas` option.
- Review OSR rendering output sizes — explicit `deviceScaleFactor` may now
  be required for pixel-perfect parity with previous versions.

## Source

[https://github.com/electron/electron/releases/tag/v42.0.0](https://github.com/electron/electron/releases/tag/v42.0.0)
