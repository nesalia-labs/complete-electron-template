# Plan: Step 3 — Electron Cluster (35 → 42)

## Goal

Upgrade `electron` 35.7.5 → 42.4.1 (7 majors), one major per commit, with per-major smoke testing.

## Pre-flight gates (REQUIRED before starting)

```bash
# 1. TanStack Start compat with Electron 40 (Node 24)
pnpm view @tanstack/react-start@latest peerDependencies
# Expect: node >= 24 accepted (or compatible range)

# 2. better-sqlite3 ABI rebuild sanity
pnpm rebuild --filter desktop
# Expect: rebuilds against current Electron's Node ABI

# 3. macOS CI: dsym.zip consumers
# (only relevant if macOS CI ships symbols)
grep -rn "dsym.zip\|dsym\\.zip" .github/
# If found: note that tar.xz migration will be needed at Electron 40
```

## Scope

**In scope**: 7 majors, 7 commits.

| # | From → To | Key change | Effort |
|---|----------|-----------|--------|
| 1 | 35.7.5 → 36.0.0 | Session.extensions, GTK 4, preload API redesign | XS |
| 2 | 36.0.0 → 37.0.0 | Web Serial/USB blocklists, before-mouse-event | XS |
| 3 | 37.0.0 → 38.0.0 | app.getPath('assets'), tray guid, accent color | XS |
| 4 | 38.0.0 → 39.0.0 | OSR unified handle, window.open always resizable | XS |
| 5 | 39.0.0 → 40.0.0 | **Node 22 → 24, renderer clipboard removed** | M |
| 6 | 40.0.0 → 41.0.0 | Reliable cookie events, DevTools console changes, MSIX | S |
| 7 | 41.0.0 → 42.0.0 | **Lazy binary download, macOS UNNotification code-sign** | S |

**Out of scope**: New Electron APIs (`isSnapped`, `getRecentDocuments`, WebAuthn Touch ID, etc.) — adopt only when needed.

## Approach

### Per-major workflow (repeat 7 times)

```
1. Bump version in apps/desktop/package.json
2. pnpm install
3. pnpm --filter desktop typecheck
4. pnpm --filter desktop build
5. pnpm --filter desktop dev → manual smoke (window opens, ping works, createUser works)
6. git commit
```

### Why one major per commit

- **Bisectability**: any regression points to a single major.
- **Review**: each commit is small enough for code review.
- **Rollback**: if a major breaks, revert one commit, not seven.
- **CI feedback**: CI runs against each commit, catching issues per-step.

Per the official Electron upgrade guide (`docs/learnings/electron/GUIDE.md` §3), this cadence is the recommended pattern.

## Commit 5 (the big one) — Electron 39 → 40

**What changes**:
- Node 22.14 → 24.11 (stack upgrade)
- `dsym.zip` format → `tar.xz` (debug symbols; macOS CI only)
- Renderer clipboard access deprecated (no impact — we don't use clipboard in renderer)

**Required actions**:
1. Bump `electron: ^35.0.0` → `electron: ^40.0.0` in `apps/desktop/package.json:9`.
2. Run `pnpm rebuild --filter desktop` — rebuilds `better-sqlite3 ^12.10.0` against Node 24 headers. `@electron/rebuild ^4.0.4` is in root devDeps.
3. Update macOS CI symbol extraction (if applicable) to handle `.tar.xz`:
   ```bash
   # Old: dsym.zip
   # New: tar -xJf dsym.tar.xz
   ```
4. Verify desktop smoke test passes (window opens, IPC works, native sqlite3 still queries).

**Why M effort** (vs XS for others): the `better-sqlite3` rebuild is the only mechanical step. If it fails (rare), the desktop upgrade stalls here until upstream `better-sqlite3` catches up to Electron 40's Node ABI.

## Commit 7 — Electron 41 → 42 (supply-chain)

**What changes**:
- `electron` npm package no longer downloads the binary via postinstall — downloads on first run instead. (Supply-chain security improvement.)
- macOS `NSUserNotification` → `UNNotification` (code-signing required).
- `ELECTRON_SKIP_BINARY_DOWNLOAD` env var removed.

**Required actions**:
1. Bump `electron: ^41.0.0` → `electron: ^42.0.0` in `apps/desktop/package.json:9`.
2. **CI update**: add pre-step `npx install-electron` before `pnpm --filter desktop build` in `apps/desktop` release workflow. The postinstall hook no longer populates the binary.
3. If any developer uses `ELECTRON_SKIP_BINARY_DOWNLOAD` locally, replace with `ELECTRON_INSTALL_PLATFORM=...` / `ELECTRON_INSTALL_ARCH=...`.
4. (Only if Notifications added later) macOS apps using `Notification` must be code-signed.

**Notification code-signing**: **not applicable to current codebase** — we don't use `Notification`. Documented as a future risk if the feature is added.

## Per-major verification (template)

After each bump:

```bash
# 1. Typecheck
pnpm --filter desktop typecheck

# 2. Build
pnpm --filter desktop build

# 3. Dev smoke
pnpm --filter desktop dev
# Manually verify:
# - Window opens
# - Ping works (oRPC round-trip)
# - createUser persists to SQLite
# - getUsers returns the user
# - Close the window, reopen: data persists (WAL checkpoint works)

# 4. Native rebuild (only at Electron 40)
pnpm rebuild --filter desktop

# 5. (Only at Electron 42) Verify binary download
npx install-electron
```

## CI updates (consolidated)

These land as part of the Electron 42 commit (or split into smaller commits if preferred):

```yaml
# .github/workflows/build-desktop.yml (or equivalent)
- run: npx install-electron  # pre-warm for Electron 42+
- run: pnpm --filter desktop build

# New: Node version matrix update
- uses: actions/setup-node@v4
  with:
    node-version: '24'  # bumped from '22' at Electron 40
```

## Risks

| Risk | Mitigation |
|------|------------|
| `better-sqlite3` ABI rebuild fails at Electron 40 | `@electron/rebuild` is already a devDep. If upstream is slow, pin `better-sqlite3` until it catches up. Worst case: skip Electron 40, ship Electron 39 + later majors. |
| TanStack Start incompatible with Electron 40's Node 24 | Pre-flight gate above. |
| Lazy binary download breaks CI cache | Update CI workflow to pre-warm via `npx install-electron`. |
| macOS CI dsym format change missed | Audit CI logs at Electron 40 bump. |
| Cumulative drift across 7 majors (masked bugs) | One commit per major. CI runs against each. Smoke test after each. |

## Effort estimate

| Task | Effort |
|------|--------|
| Majors 36-39 (4 commits, mostly trivial) | 1 day |
| Major 40 (Node 22→24, rebuild) | 1 day |
| Majors 41-42 (2 commits, supply-chain + CI) | 1 day |
| Per-major smoke testing | 1 day (overlapped with above) |
| **Total** | **3-5 days** |

## After this step

- All 7 outdated majors closed.
- All 7 packages at their latest stable majors.
- Rolldown bundler in production.
- Electron on the latest stable.
- Node 24 in CI.
- 1-2 weeks of accumulated work landed across 3 PRs (one per step).
