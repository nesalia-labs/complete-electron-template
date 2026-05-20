# GitHub Release Workflow — Windows-Only v1

## Scope

Single platform, no code signing, no auto-updates, manual versioning.

| Item | Decision |
|------|----------|
| Platforms | Windows only (NSIS installer) |
| Code signing | Skipped (SmartScreen warnings acceptable for v1) |
| Auto-updates | Deferred to v2 |
| Versioning | Manual git tags (`v*`) |
| macOS/Linux | Not shipped in v1 |

---

## Build Pipeline

```
1. npm run build:web          → apps/web/dist/
2. cp -r apps/web/dist/      → apps/desktop/out/renderer
3. electron-vite build        → apps/desktop/out/main/ + out/preload/
4. electron-builder           → apps/desktop/release/win-unpacked/
                               + apps/desktop/release/*.exe (NSIS)
```

---

## Production URL Fix

```typescript
// apps/desktop/src/main/index.ts
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

if (is.dev || !app.isPackaged) {
  await mainWindow.loadURL('http://127.0.0.1:5173')
} else {
  await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}
```

---

## Build Scripts

```json
// apps/desktop/package.json
{
  "scripts": {
    "build": "electron-vite build && node -e \"require('fs').cpSync('../web/dist', 'out/renderer', {recursive: true})\"",
    "release": "electron-vite build && node -e \"require('fs').cpSync('../web/dist', 'out/renderer', {recursive: true})\" && electron-builder --win"
  }
}
```

---

## Workflow

```yaml
# .github/workflows/release-desktop.yml
name: Release Desktop App
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build web app
        run: npm run build:web

      - name: Build desktop app
        run: npm run build:desktop

      - name: Build installer
        run: npm run release
        working-directory: apps/desktop

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-installers
          path: apps/desktop/release/**

  publish:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: windows-installers
          path: artifacts

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## To Ship a Release

```bash
# 1. Update version in apps/desktop/package.json + apps/web/package.json
# 2. Commit and push
git add . && git commit -m "Bump version to 1.0.0"
git push

# 3. Tag and push
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will automatically build and create the release.

---

## v2 Roadmap

| Item | Priority |
|------|----------|
| macOS support (signing + notarization) | High |
| Linux support (AppImage) | Medium |
| Auto-updates (electron-updater) | Medium |
| Azure Trusted Signing | Low |
| Changesets for monorepo versioning | Medium |