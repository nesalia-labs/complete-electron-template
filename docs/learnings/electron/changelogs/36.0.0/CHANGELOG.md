# Electron 36.0.0 — Changelog

**Release date:** 2025-04-28

36.0.0 is a moderately heavy major. The headline changes are the **preload script
API redesign**, the **`Session.extensions` namespace move**, the **macOS `roundedCorners`**
option, and a **GTK 4 default** on GNOME. None of these are catastrophic in isolation,
but they touch many code paths in a typical app.

## Stack upgrades

| Engine    | Version           |
|-----------|-------------------|
| Chromium  | 136.0.7103.48     |
| Node.js   | 22.14.0           |
| V8        | 13.6              |

## Breaking changes

### 6.1 Preload script API redesigned

The `Session.getPreloads` / `Session.setPreloads` API is replaced with a
register/unregister model that returns an id and is fully async.

```ts
// Before (35.x)
import { session } from 'electron';

session.defaultSession.setPreloads([path.join(__dirname, 'preload.cjs')]);
const preloads = session.defaultSession.getPreloads();

// After (36.0.0)
import { session } from 'electron';

const { id } = await session.defaultSession.registerPreloadScript({
  script: fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf-8'),
  type: 'frame',
});

const all = session.defaultSession.getPreloadScripts();
await session.defaultSession.unregisterPreloadScript(id);
```

### 6.2 Session extension APIs moved

`ses.extensions.*` is now under `Session.extensions`. The old surface is
removed.

```ts
// Before (35.x)
ses.extensions.on('extension-loaded', ...);

// After (36.0.0)
Session.extensions.on('extension-loaded', ...);
```

### 6.3 `systemPreferences.isAeroGlassEnabled()` removed

```ts
// Before (35.x)
if (systemPreferences.isAeroGlassEnabled()) { /* ... */ }

// After (36.0.0)
// Removed without replacement. Drop the call.
```

### 6.4 `PrinterInfo.status` and `PrinterInfo.isDefault` removed

These properties are gone; printer enumeration returns a leaner record.

### 6.5 `ses.clearDataStorage({ quota: 'syncable' })` removed

`quota: 'syncable'` is no longer a valid option. Strip it from any
`clearDataStorage` calls.

### 6.6 GTK 4 default on GNOME

Web content may render differently on GNOME distributions that ship GTK 4.
Custom form-control themes may need updates.

## New features

### Snap-arranged window detection (Windows)

```ts
import { BrowserWindow } from 'electron';

const win = new BrowserWindow({ width: 1200, height: 800 });
if (win.isSnapped()) {
  // adjust layout
}
```

### Rounded corners on Windows

```ts
new BrowserWindow({ roundedCorners: true });
```

### Cross-world code execution via contextBridge

```ts
import { contextBridge } from 'electron';

contextBridge.executeInMainWorld({
  key: '__appVersion',
  callback: () => '36.0.0',
});
```

### webContents.navigationHistory.restore

```ts
win.webContents.navigationHistory.restore(0, savedEntries);
```

### New ServiceWorkerMain class

```ts
import { ServiceWorkerMain } from 'electron';

const sw: ServiceWorkerMain; // inspect scriptURL, scope, etc.
```

### webRequest filter `excludeUrls`

```ts
session.defaultSession.webRequest.onBeforeRequest(
  { excludeUrls: ['*://*.example.com/*'] },
  (_d, cb) => cb({ cancel: false }),
);
```

### Portal globalShortcuts

```ts
// Portals (web-platform) can subscribe to global shortcuts via the new API.
```

## Deprecations

- `NativeImage.getBitmap()` — deprecated; will be removed in a future major.
- `Session.getPreloads` / `Session.setPreloads` — replaced by the new register API.
- Empty `urls` arrays in `webRequest` filters — use `excludeUrls`.

## Migration tips from 35.x

- Replace `ses.extensions` usage with the new `Session.extensions` namespace.
- Migrate `getPreloads` / `setPreloads` to the new register/unregister API.
- Strip `quota: 'syncable'` from any `clearDataStorage` calls.
- Audit code for GTK 3 assumptions; GTK 4 is now the default on GNOME.
- Replace empty `urls` arrays in `webRequest` filters with `excludeUrls`.
- Remove all `systemPreferences.isAeroGlassEnabled()` calls on Windows.

## Source

[https://github.com/electron/electron/releases/tag/v36.0.0](https://github.com/electron/electron/releases/tag/v36.0.0)
