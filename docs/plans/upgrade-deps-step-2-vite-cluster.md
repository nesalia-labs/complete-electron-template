# Plan: Step 2 — Vite Cluster (vite + plugin-react)

## Goal

Upgrade `vite` 7.3.3 → 8.0.16 and `@vitejs/plugin-react` 5.2.0 → 6.0.2. Switch bundler from esbuild+Rollup to Rolldown.

## Pre-flight gate (REQUIRED before starting)

Run these 2 commands and confirm before doing anything:

```bash
pnpm view electron-vite@latest peerDependencies
pnpm view @tanstack/react-start@latest peerDependencies
```

**Pass conditions**:
- `electron-vite@^6` exists with `vite: ^8` in peerDependencies.
- `@tanstack/react-start@^1.x` accepts `vite: ^8` in peerDependencies.

**If either fails**:
- **electron-vite lag** → Pin `vite: ^7` in `apps/desktop/electron.vite.config.ts`. Bump only `apps/web` to Vite 8. This keeps the desktop app on the older toolchain until the ecosystem catches up.
- **TanStack lag** → Defer Vite 8 entirely. Stay on Step 1's wins only.

## Scope

| Package | Current → Latest | Effort |
|---------|------------------|--------|
| `vite` | 7.3.3 → 8.0.16 | M |
| `@vitejs/plugin-react` | 5.2.0 → 6.0.2 | XS (peer-tied to vite) |

**Out of scope**: `electron-vite` itself (only checked at runtime), `vitest` (already bumped in Step 1).

## Approach

Single commit covering both packages, since `@vitejs/plugin-react@6` peer-depends on `vite@^8`.

### File changes

#### `apps/web/package.json`
```diff
- "@vitejs/plugin-react": "^5.2.0"
- "vite": "^7.3.1"
+ "@vitejs/plugin-react": "^6.0.0"
+ "vite": "^8.0.0"
```

#### `apps/desktop/package.json`
```diff
- "vite": "^7.3.1"
+ "vite": "^8.0.0"
```
(electron-vite peer-dep is satisfied if pre-flight passes)

#### `apps/web/vite.config.ts`
- Remove `vite-tsconfig-paths` from imports and `plugins[]`.
- Add `resolve: { tsconfigPaths: true }` to enable built-in tsconfig paths (replaces the plugin).
- Add `resolve.dedupe: ['react', 'react-dom']` (defensive — `apps/web/package.json` already pins both to `^19.2.4` but ensure single React copy).
- See `docs/learnings/vite/GUIDE.md` §3.3 for the full rename table.

#### `apps/desktop/electron.vite.config.ts`
- Same `vite-tsconfig-paths` → `resolve.tsconfigPaths: true` migration.
- Three occurrences of `build.rollupOptions` → `build.rolldownOptions` (lines 12, 22, 42 — under `main`, `preload`, `renderer`).
- See `docs/learnings/vite/GUIDE.md` §3.2.

### Why a single commit

The plugin-react v6 has `vite: ^8` as a peer. Splitting the bump into 2 commits would leave the repo in a state where `plugin-react@6` cannot resolve its peer. A single commit keeps `pnpm install` consistent at every commit.

## Verification

```bash
# 1. Install
pnpm install

# 2. Web build
pnpm --filter web build
# Expected: builds cleanly. Record cold-build time (Vite 8 / Rolldown should be 10-30x faster).

# 3. Desktop build (validates electron-vite compatibility)
pnpm --filter desktop build
# Expected: produces out/main/index.js, out/preload/index.js, out/renderer/index.html

# 4. Smoke test web dev
pnpm --filter web dev &
# Visit http://127.0.0.1:5173 in a browser
# Verify: page loads, no console errors, HMR works
kill %1

# 5. Smoke test desktop
pnpm --filter desktop dev
# Verify: window opens, IPC round-trip works (ping, createUser)

# 6. Typecheck
pnpm -r typecheck
```

**Expected**:
- Web build: ✅ succeeds, noticeably faster
- Desktop build: ✅ succeeds (proves electron-vite compat)
- All 52 tests: ✅ still passing
- Typecheck: ✅ green

## Risks

| Risk | Mitigation |
|------|------------|
| `electron-vite` not yet compatible with Vite 8 | Pre-flight gate above. If fails, scope down to `apps/web` only. |
| CJS interop regression (`zod`, `i18next`, `recharts`, `sonner`) | Run an integration build. If a dep breaks, set `legacy.inconsistentCjsInterop: true` in the vite config. |
| `@tanstack/react-start` incompatible with Vite 8 plugin hooks | Pre-flight gate above. |
| `manualChunks` config key removed | Audit `apps/web/vite.config.ts` and `apps/desktop/electron.vite.config.ts` for any `build.rollupOptions.output.manualChunks` usage. (Grep expected to find none — confirm.) |
| `vite-tsconfig-paths` removal breaks path resolution | The built-in `resolve.tsconfigPaths: true` is a drop-in replacement. Verify by running dev mode and checking `@/` imports resolve. |

## Effort estimate

| Task | Effort |
|------|--------|
| Pre-flight checks | 30 min |
| File edits (4 files) | 1h |
| Build verification + smoke test | 2h |
| Fix any issues found | 1-2h |
| **Total** | **~1 day** |

## After this step

- 6 of 7 outdated majors closed.
- Only `electron` 35→42 remains. Proceed to [`upgrade-deps-step-3-electron-cluster.md`](upgrade-deps-step-3-electron-cluster.md).
- Web and desktop build pipelines now use Rolldown.
