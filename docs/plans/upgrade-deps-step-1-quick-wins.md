# Plan: Step 1 — Quick Wins (5 packages)

## Goal

Upgrade 5 low-risk packages with type-only or test-config changes, in a single PR. After this step, 5 of the 7 major-version gaps are closed.

## Scope

| Package | Current → Latest | Effort |
|---------|------------------|--------|
| `@types/node` | 22.19.19 → 26.0.0 | S |
| `@electron-toolkit/utils` | 3.0.0 → 4.0.0 | XS |
| `jsdom` | 27.4.0 → 29.1.1 | XS |
| `vitest` | 3.2.4 → 4.1.9 | S |

**Out of scope**: `vite`, `@vitejs/plugin-react` (Step 2), `electron` (Step 3).

## Approach

Each package is bumped in its own commit, in this order. This lets the team review each bump independently and bisect on failure.

### Commit 1: `@types/node` 22 → 26 (S, ~2h)

**Files**:
- `apps/desktop/package.json:21` (`@types/node: ^22.19.15`)
- `apps/web/package.json:50` (same)
- Any other workspace with `@types/node` in deps

**Change**:
```diff
- "@types/node": "^22.19.15"
+ "@types/node": "^26.0.0"
```

**Triage after bump** (per `docs/learnings/types/node/GUIDE.md` §4):
- `util.is*` → `typeof` / `instanceof` (grep confirms: zero usage)
- `fs.Dirent#path` → `fs.Dirent#parentPath` (requires `withFileTypes: true`)
- Drop `--experimental-transform-types` (not in use)
- `node:corepack` removal (not in use)

**Why safe**: TypeScript 6.0.3 (already installed) satisfies `>= 5.6` floor for `@types/node@26`. No runtime behavior change.

### Commit 2: `@electron-toolkit/utils` 3 → 4 (XS, ~15min)

**Files**:
- `apps/desktop/package.json:16` (`"@electron-toolkit/utils": "^3.0.0"`)

**Change**:
```diff
- "@electron-toolkit/utils": "^3.0.0"
+ "@electron-toolkit/utils": "^4.0.0"
```

**Code change**: **None**.
- `apps/desktop/src/main/index.ts:3` imports only `is` — unchanged.
- No IPC helper usage (we use raw `ipcMain`/`ipcRenderer` + `MessagePort`).
- No `watchWindowShortcuts` usage.

### Commit 3: `jsdom` 27 → 29 (XS, ~15min)

**Files**:
- `apps/web/package.json:63` (`"jsdom": "^27.4.0"`)
- `package.json` (root) — add `engines.node`

**Changes**:
```diff
# apps/web/package.json
- "jsdom": "^27.4.0"
+ "jsdom": "^29.0.0"

# package.json (root) — add at top level
+ "engines": {
+   "node": ">=22.13.0"
+ }
```

**Why safe**: jsdom is only consumed at test time. The only existing test (`apps/web/src/lib/example.test.ts`) does not exercise jsdom behavior. `engines.node: ">=22.13.0"` becomes a hard floor for the whole monorepo (also satisfies `@types/node@26`).

### Commit 4: `vitest` 3 → 4 (S, ~1h)

**Files**:
- `packages/db/vitest.config.ts`
- `packages/api/vitest.config.ts`
- `apps/web/package.json` (vitest bump)
- `packages/db/package.json` (vitest bump)
- `packages/api/package.json` (vitest bump)

**Changes** (in both `vitest.config.ts` files):
```diff
 test: {
   environment: 'node',
-  pool: 'forks',
-  poolOptions: {
-    forks: {
-      singleFork: true
-    }
-  },
+  maxWorkers: 1,
+  isolate: false,
   include: ['tests/**/*.test.ts']
 }
```

**Per `docs/learnings/vitest/GUIDE.md` §4.7**: Vitest 4 silently ignores `poolOptions` keys with no warning — this is a footgun. The rewrite must happen in the same commit as the version bump.

**Why safe**:
- No `vi.fn`/`vi.mock`/`vi.spyOn` usage in the repo (grep confirmed).
- The `createDBTestContext()` / `createTestContext()` helpers create fresh tmpdir per test, so module isolation between tests is not relied upon.
- `singleFork: true` → `maxWorkers: 1, isolate: false` preserves the "one test process at a time" behavior.

## Verification

After all 4 commits land:

```bash
# Type check across the monorepo
pnpm -r typecheck

# Run all tests
pnpm -r test

# Verify desktop still boots in dev
pnpm dev:desktop
```

**Expected**:
- Typecheck: ✅ all packages green
- Tests: 28 (db) + 24 (api) = **52 passing**
- Desktop dev: window opens, IPC round-trip works

## Risks

| Risk | Mitigation |
|------|------------|
| `@types/node` v26 surfaces latent type errors | Triage per `types/node/GUIDE.md` §4. Most are no-ops for this codebase. |
| `engines.node` blocks CI before Node is upgraded | Verify CI Node version is `>= 22.13.0` before merging commit 3. |
| Vitest 4 pool migration breaks test isolation | Each test creates a fresh tmpdir + SQLite handle — no shared state to leak. |

## Effort estimate

| Commit | Effort |
|--------|--------|
| @types/node 22→26 | 2h |
| @electron-toolkit/utils 3→4 | 15min |
| jsdom 27→29 + engines.node | 15min |
| vitest 3→4 | 1h |
| **Total** | **3-4h** |

## After this step

- 5 of 7 outdated majors are closed.
- Only `vite` + `electron` (and their clusters) remain.
- Proceed to [`upgrade-deps-step-2-vite-cluster.md`](upgrade-deps-step-2-vite-cluster.md).
