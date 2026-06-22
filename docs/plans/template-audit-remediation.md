# Template Audit & Remediation Plan

**Date:** 2026-06-22
**Triggered by:** Senior architectural review of branch `refactor/shadcn-monorepo-migration`.
**Scope:** Close critical gaps surfaced by the audit; replace the `fix-imports.mjs` band-aid with declarative tsconfig paths; reduce the migration branch's blast radius via sub-PR sequencing.
**Status:** Awaiting Tech Lead approval, then delegated to specialist agents.

---

## 1. Context

A read-only architectural review was conducted on 2026-06-22 across the full monorepo. The review surfaced **3 critical**, **5 major**, and several minor issues. The current branch (`refactor/shadcn-monorepo-migration`) carries 64 changed files (2.5K insertions, 3K deletions) and includes a build-time script (`packages/ui/scripts/fix-imports.mjs`) that rewrites shadcn-generated imports post-build. The user has directed that this band-aid be **replaced with proper tsconfig path resolution**, not patched and documented.

The review's full evidence trail lives in this plan; the user-facing summary is in the conversation log of 2026-06-22.

---

## 2. Goals & non-goals

### Goals

- Close all critical (P0) security and correctness gaps.
- Eliminate `packages/ui/scripts/fix-imports.mjs` and its post-build rewriting.
- Make module resolution in the `packages/ui` workspace declarative (tsconfig-driven).
- Reduce the migration branch to <15 changed files per PR for reviewability.
- Populate `docs/internal/` with ADRs for load-bearing architectural choices.

### Non-goals (explicit deferrals)

- `docs/learnings/eve/` and `docs/reports/eve/` — separate workstream, out of scope for this audit.
- macOS / Linux desktop build targets — Windows x64 only for now; defer target matrix expansion.
- TanStack Query adoption — current oRPC + `useState` pattern stays until a real data-loading layer is needed; remove phantom dep instead.
- Full SSR migration of `apps/web` — only the half-wiring is resolved; full SSR is a separate decision (see C3 below).
- macOS code signing, notarization, auto-update — out of scope.

---

## 3. Critical fixes (P0 — block merge to `staging`)

### C1. Add Content-Security-Policy to BrowserWindow

**Where:** `apps/desktop/src/main/index.ts` (after `BrowserWindow` construction, app-level via `session.defaultSession.webRequest.onHeadersReceived`).

**Current state:** No CSP is set anywhere. The `electron-expert` agent contract claims to enforce CSP, but `BrowserWindow` has no header, no meta tag, no `onHeadersReceived` interceptor. `grep -r 'Content-Security-Policy'` across source returns zero matches.

**Proposed fix:** Install a CSP via `session.defaultSession.webRequest.onHeadersReceived` covering both dev (`http://127.0.0.1:5173`) and prod (`file://`) origins.

**Suggested policy (dev):**

```
default-src 'self' http://127.0.0.1:5173;
script-src 'self' http://127.0.0.1:5173 'unsafe-inline';
style-src 'self' http://127.0.0.1:5173 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173;
font-src 'self' data:;
```

**Suggested policy (prod):** Same, drop `'unsafe-inline'` for `script-src` and `style-src` once proven safe with the prod renderer build. Defer the tightening — get enforcement in first.

**Why this matters:** `sandbox: false` is documented as an intentional relaxation in `.claude/agent-memory/tech-lead/feedback/quality-bar.md`. CSP is the compensating control. Without it, `nodeIntegration: false` + `contextIsolation: true` are necessary but not sufficient.

**Acceptance criteria:**

- `pnpm dev:desktop` shows the `Content-Security-Policy` header in DevTools Network tab for the renderer document.
- No console CSP violations for the default route (`/`).
- `pnpm build:desktop` produces a packaged app where the same header is present on `file://` loads.
- ADR added at `docs/internal/security.md` documenting the policy, the dev/prod split, and the path to tightening `'unsafe-inline'`.

**Delegation:** `electron-expert`. Brief must include: the exact policy above, dev vs prod branching, the `onHeadersReceived` callback shape, and the requirement to verify in DevTools before reporting done.

---

### C2. Resolve the dead `ping` IPC channel

**Where:** `apps/desktop/src/preload/index.ts:18-30` and `apps/desktop/src/main/index.ts`.

**Current state:** Preload exposes `electron.ping` via `contextBridge.exposeInMainWorld('electron', { ping: () => ipcRenderer.invoke('ping') })`. No `ipcMain.handle('ping', ...)` exists in main. The channel is unreachable.

**Proposed fix (option chosen):** Wire the channel — it's the only contextBridge-exposed surface and a renderer smoke test is valuable.

```ts
// main/index.ts
ipcMain.handle('ping', () => 'pong')

// preload/index.ts (unchanged shape)
ping: () => ipcRenderer.invoke('ping')
```

Renderer usage at `apps/web/src/routes/index.tsx` already calls `client.ping(...)` via oRPC, not `window.electron.ping(...)`. The `electron.ping` surface is therefore reserved for non-oRPC use cases (e.g., renderer-side liveness check before oRPC upgrade). Document this in the preload comment.

**Alternative considered:** Delete the entire `electron.*` contextBridge surface. Rejected for now — having a known-good `ping` channel is a useful fallback and proves the contextBridge wiring works.

**Acceptance criteria:**

- `await window.electron.ping()` in the renderer resolves with `'pong'`.
- `apps/desktop/src/main/index.ts` has matching `ipcMain.handle('ping', ...)`.
- Preload comment explains when to use this vs the oRPC path.

**Delegation:** `electron-expert`. Brief is one screen — main handler + preload comment.

---

### C3. Resolve SSR half-wiring in `apps/web`

**Where:** `apps/web/src/main.tsx`, `apps/web/package.json`, `apps/web/src/routeTree.gen.ts` (generated), `apps/web/index.html`.

**Current state:** Three signals say "SSR is on", one signal says "CSR is on":

| Signal | Location | Says |
|---|---|---|
| `ssr: true` in route tree Register | `apps/web/src/routeTree.gen.ts` | SSR |
| `nitro` + `@tanstack/react-start` in deps | `apps/web/package.json` | SSR |
| `index.html` → `/src/main.tsx`, no server entry | `apps/web/index.html` | CSR |
| `createRoot(...).render(...)` | `apps/web/src/main.tsx:7` | CSR |

**Proposed fix:** Lean toward removing SSR — half-on is misleading. TanStack Start can be re-adopted later when the template actually needs SSR (e.g., for SEO, faster first paint, server-side auth gates).

**Concretely:**

1. Remove `nitro` and `@tanstack/react-start` from `apps/web/package.json` deps.
2. Run the route generator without SSR; verify `routeTree.gen.ts` no longer carries `ssr: true`.
3. Keep TanStack Router itself — file-based routing, loader/beforeLoad, and code-splitting are valuable client-side.
4. Leave `@tanstack/react-router` and devtools; document in `docs/internal/ssr-decision.md` why SSR was deferred.

**Alternative considered:** Complete the SSR story — add `app.config.ts`, server entry, server routes. Rejected: scope creep. A template should pick a lane.

**Acceptance criteria:**

- `pnpm install --frozen-lockfile` is clean after dep removal.
- `pnpm --filter web typecheck` and `pnpm --filter web build` pass.
- `pnpm dev:web` serves the app via Vite without Nitro involvement.
- `routeTree.gen.ts` has no `ssr` augmentation.
- ADR at `docs/internal/ssr-decision.md` records the deferral and re-adoption triggers.

**Delegation:** `tanstack-router-expert` (owns this package). Brief must include: the exact deps to remove, the expected generator output, the ADR outline, and a smoke-test command for `pnpm dev:web`.

---

## 4. Major fixes (P1 — ship before next release)

### M1. Remove the phantom `@tanstack/react-router-ssr-query` dependency

**Where:** `apps/web/package.json`.

**Current state:** Listed in deps. No `QueryClient`, `useQuery`, or `useMutation` anywhere in `apps/web/src`. The TanStack Query agent doc was correctly deleted in this branch; the dep was missed.

**Proposed fix:** Remove from `package.json` and lockfile. Re-introduce when (and only when) a real data-loading layer is added.

**Acceptance criteria:**

- `pnpm install --frozen-lockfile` clean.
- `pnpm typecheck` green.
- No dead imports anywhere.

**Delegation:** `tanstack-router-expert`. One-line change + lockfile churn.

---

### M2. Sync Node version between CI and declared engine

**Where:** All 16 `.github/workflows/*.yml` files; root `package.json`.

**Current state:** Root `engines.node: ">=22.13.0"`. CI uses `node-version: 20`. CI is silently violating the engine constraint.

**Proposed fix:** Bump all workflows from `20` to `22.13` (the floor declared in `engines.node`).

**Acceptance criteria:**

- All 16 workflows reference the same Node version.
- CI green on the bumped version.
- A test build of `apps/desktop` succeeds under Node 22.13.

**Delegation:** `github-expert`. Brief must enumerate the workflows; suggest a follow-up commit if any workflow legitimately needs Node 20.

---

### M3. Replace `fix-imports.mjs` with proper tsconfig paths (user-mandated)

**Where:**

- `packages/ui/tsconfig.json` — add `compilerOptions.paths`.
- `packages/ui/scripts/fix-imports.mjs` — **delete**.
- `packages/ui/package.json` — remove `node scripts/fix-imports.mjs` from `scripts.build`.
- `packages/ui/src/components/*.tsx` — verify imports resolve through tsconfig; revert any forced rewrites.
- `apps/web/vite.config.ts`, `apps/desktop/electron.vite.config.ts` — already alias `@/* → packages/ui/src/*`; verify they resolve correctly without the post-build script.

**Current state:** Post-build script rewrites `@/lib/utils`, `@/components/*`, `@/hooks/*` to package-qualified specifiers in both `src/` (for editor benefit) and `dist/` (for runtime). Drift between the two is real. This papers over what should be a tsconfig `paths` setup inside the package itself.

**Proposed fix:** Configure `packages/ui/tsconfig.json` with:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/lib/*": ["src/lib/*"],
      "@/hooks/*": ["src/hooks/*"]
    }
  }
}
```

The component files import `@/lib/utils`; tsconfig resolves it to `src/lib/utils` natively. Vite picks up the same paths via `viteTsConfigPaths` (already in use at the workspace level — extend to also consume `packages/ui/tsconfig.json`). Delete the script. Re-run the shadcn generator (`pnpm ui:add`) on one component to verify the generated imports resolve cleanly.

**Why this matters:** Declarative > scripted. Tsconfig is the canonical source of truth for module resolution. A post-build script that touches every file in `src/` and `dist/` is a footgun — editor tooling and runtime resolution can drift, and the script becomes load-bearing for every contributor's workflow.

**Acceptance criteria:**

- `pnpm --filter @electron-template/ui build` runs without `fix-imports.mjs` and produces a working `dist/`.
- `pnpm --filter web build` and `pnpm build:desktop` succeed.
- A spot-check of 3-5 component files shows `@/lib/utils` (or whatever shadcn emits) resolves at edit time, not build time.
- No reference to `fix-imports.mjs` in any package script.
- The shadcn add workflow (`pnpm ui:add`) still works for new components — verify by adding one new component.

**Delegation:** `general-purpose` with a clear brief. This touches the package config and consumer configs but is mechanical once the tsconfig is right.

---

### M4. Unify Vite aliases via tsconfig paths

**Where:** `apps/web/vite.config.ts`, `apps/desktop/electron.vite.config.ts`.

**Current state:** Both configs maintain a 6-entry alias array pointing at `packages/ui/src/...`. Same list, duplicated. When `packages/ui` adds a new subpath, both configs need editing — and nothing prevents one from going stale.

**Proposed fix:** Create `packages/ui/tsconfig.paths.json` (or extend `packages/ui/tsconfig.json` with the paths block from M3). Use `viteTsConfigPaths({ projects: ['packages/ui/tsconfig.paths.json'] })` in both Vite configs. The alias array becomes empty or is removed entirely.

**Acceptance criteria:**

- Both Vite configs reference the tsconfig path project, not the inline alias array.
- New subpaths under `packages/ui/src/` resolve automatically in both web and desktop.
- `pnpm dev:web` and `pnpm dev:desktop` boot without resolution errors.

**Delegation:** Bundled with M3 — same agent, same brief.

---

### M5. Populate `docs/internal/`

**Where:** `docs/internal/` (currently empty).

**Current state:** Zero ADRs, zero architecture notes, zero runbooks. CLAUDE.md at root + `packages/{db,api}` are excellent, but the rest of the architecture (IPC bridge, schema-first contract, MessagePort trade-off, no-SSR decision) lives only in agent contracts — operational docs, not durable decision records.

**Proposed fix:** Seed three ADRs:

1. **`docs/internal/security.md`** — Electron security posture: `contextIsolation`, `nodeIntegration`, `sandbox`, CSP, 127.0.0.1 rule, origin allowlist. Each control documented with: what it defends against, why it's set this way, when to revisit.
2. **`docs/internal/ipc-contract.md`** — MessagePort bridge architecture: why MessagePort over plain `ipcRenderer.invoke`, the origin allowlist, the oRPC upgrade flow, the role of preload as the only contextBridge surface.
3. **`docs/internal/ssr-decision.md`** — Why SSR is deferred (per C3), what triggers re-adoption (SEO needs, server auth, perf budget for first paint), and the path back to TanStack Start.

**ADR template (light):** Context → Decision → Consequences → Alternatives considered.

**Acceptance criteria:**

- Each ADR has the four sections above.
- Each ADR links back to the relevant source file(s) with `file:line` references.
- The empty `docs/internal/` is no longer empty.

**Delegation:** `tech-lead` writes these directly (orchestrator judgment, not implementation work). Or delegate to a `general-purpose` agent with the template + the relevant source excerpts.

---

## 5. Minor (P2 — backlog, not blocking)

- `packages/sdk` has redundant `AppRouter` export — both `src/router.ts` and `src/index.ts` re-export the same type. Trivial cleanup; land when next touching the package.
- Consider reintroducing `packages/db/src/queries.ts` when a procedure needs a join or transaction.
- Consider documenting TanStack Router, oRPC, Drizzle, shadcn in `docs/learnings/` — coverage is currently inverted (third-party libs over-documented, actual stack under-documented).

## 5b. Landed since the audit (2026-06-22)

### M6. shadcn monorepo theme not loading — **FIXED**

**Symptom:** `pnpm run dev:desktop` launches the app but the UI is entirely white. The HTML structure renders, but Tailwind utilities are not generated and the theme variables never reach the renderer.

**Root cause (two converging issues):**

1. **Tailwind v4 content auto-detection doesn't cross workspace boundaries.** The Vite root is `apps/web/`, so Tailwind scans `apps/web/src/**` but misses `packages/ui/src/components/**/*.tsx`. The shadcn components there use `bg-background`, `text-foreground`, `border-border`, etc. — Tailwind never sees those files, so it never generates the utilities.
2. **CSS export in `packages/ui/package.json` pointed to `dist/`, not `src/`.** In dev, `dist/` doesn't exist. The Vite alias rescued JS imports but the CSS `@import` resolution was fragile and the build-time copy of `globals.css` to `dist/` was load-bearing for any consumer that respected the `exports` field.

**Fix (3 files, landed 2026-06-22):**

| File | Change |
|---|---|
| `packages/ui/src/styles/globals.css` | Added `@source "../**/*.{ts,tsx,js,jsx}";` so Tailwind scans the package's components. |
| `packages/ui/package.json` | Changed `"./styles/globals.css": "./dist/styles/globals.css"` → `"./styles/globals.css": "./src/styles/globals.css"` (the shadcn monorepo pattern: CSS is a source-level concern, processed by Tailwind at the consumer). Simplified `build` script by removing the `cpSync` step that copied `globals.css` into `dist/`. |
| `apps/web/src/styles.css` | Added `@source "../**/*.{ts,tsx}";` so Tailwind also scans the web app's own components (e.g. `LanguageSwitcher`). |

**Pattern to preserve (ADR candidate for `docs/internal/`):** when extracting shadcn into a workspace package, always (a) point the CSS export to `src/`, (b) add `@source` directives in both the package's `globals.css` and the consumer's entry stylesheet, (c) do not couple package exports to `dist/` for CSS.

**Reference:** [shadcn monorepo docs](https://ui.shadcn.com/docs/monorepo) confirm this is the recommended pattern.

### M7. Electron preload bundle misconfigured — **FIXED**

**Symptoms (cascading, hit one at a time as the user retried):**

1. `Cannot find module 'apps/desktop/out/preload/index.js'` — main process referenced `.js` but `electron-vite` outputs `.mjs`.
2. `Error: Electron failed to install correctly` after the `.mjs` fix — `node_modules/electron/path.txt` was missing in the hoisted location; pnpm had not run `install.js` against the hoist.
3. Same `Electron failed to install correctly` after the reinstall — root cause: `electron-vite` was **inlining** the `electron` module into the preload bundle. The inlined `getElectronPath()` ran with `__dirname = out/preload/`, looked for `path.txt` there, didn't find it, threw.

**Fixes (3 files, landed 2026-06-22):**

| File | Change |
|---|---|
| `apps/desktop/src/main/index.ts:28` | `'../preload/index.js'` → `'../preload/index.mjs'` (match `electron-vite` output). |
| `node_modules/electron/path.txt` (regenerated) | Reinstalled via `pnpm install --filter desktop...`; the `postinstall: node node_modules/electron/install.js` script wrote the correct `path.txt` (= `electron.exe`; `getElectronPath` prepends `dist/`). |
| `apps/desktop/electron.vite.config.ts` (preload block) | Added `external: ['electron']` to `preload.build.rollupOptions` so the preload imports `electron` at runtime via Node resolution instead of inlining it. Without this, the bundled preload breaks `__dirname`-based path resolution inside the inlined `electron` package code. |

**Pattern to preserve (mandatory for any future preload/main work):** the preload's `rollupOptions.external` must include `electron` (and any other Electron-runtime-only modules like `better-sqlite3` if they're ever used in preload). The main process config already had this; the preload config was missing it.

**Why this happened:** the migration branch touched `electron.vite.config.ts` (added `electron` to the main `external` list, replaced the alias array) but did not add `external` to the preload block. Likely an oversight during the alias refactor.

**Lesson for the audit:** this confirms the audit's M3 finding — the migration branch is too wide (64 files) and includes bundler-config changes that were not end-to-end tested. Splitting the migration into smaller PRs (per the audit's sequencing) would have caught this in CI rather than at the user's desk.

### M8. Dead `ping` IPC channel in preload — **FIXED (deleted)**

**Symptom:** `apps/desktop/src/preload/index.ts` exposed `window.electron.ping` via `contextBridge.exposeInMainWorld('electron', { ping: () => ipcRenderer.invoke('ping') })`. No `ipcMain.handle('ping', ...)` existed in `apps/desktop/src/main/index.ts`. The channel was unreachable.

**Why this was a P0 despite being invisible:** the contextBridge surface is the documented contract between main and renderer. Advertising an API that doesn't work misleads future contributors. The ping button in the demo works via oRPC (`client.ping(...)` over the MessagePort bridge), not via `window.electron.ping` — so the dead channel had no observable effect, but it was a future incident waiting to happen.

**Fix (1 file, landed 2026-06-22):** deleted the entire `electron` contextBridge surface from the preload. The oRPC ping path is the canonical liveness check; a redundant IPC ping is not needed.

| File | Change |
|---|---|
| `apps/desktop/src/preload/index.ts` | Removed `import { contextBridge, ipcRenderer }` → `import { ipcRenderer }` (contextBridge no longer needed). Removed the `api = { ping: ... }` object, the `contextBridge.exposeInMainWorld('electron', api)` call, and the non-isolated fallback. Preload now contains only the postMessage → IPC forwarder for the oRPC MessagePort bridge. |

**Pattern to preserve:** if you add a contextBridge surface, there must be a matching handler in main. Either wire both ends or expose neither. Don't advertise APIs that don't work.

**Verification:** `grep -r 'window\.electron' apps/` returns zero matches in app code. `pnpm run dev:desktop` still works (oRPC ping via MessagePort is unaffected).

### C3 + M4. SSR half-wiring + Vite alias path bug — **FIXED**

**Combined root cause discovered during C3 implementation:**

The half-wired SSR (`ssr: true` augmentation in `routeTree.gen.ts` with no runtime to consume it) was the visible symptom. The deep-dive revealed two underlying bugs:

1. **TanStack Router Vite plugin was missing from both Vite configs** (`apps/web/vite.config.ts` and `apps/desktop/electron.vite.config.ts` renderer block). The `routeTree.gen.ts` file was stale — generated at some point in the past but no longer being regenerated. Adding a new route file would have been silently broken.

2. **The 5 Vite aliases in `apps/web/vite.config.ts` pointing to `packages/ui` were off by one `../`** — they used `../packages/ui/src` (resolving to `apps/packages/ui/src/...`, which does not exist) instead of `../../packages/ui/src` (resolving to the real `packages/ui/src/`). The desktop config (`apps/desktop/electron.vite.config.ts`) had the correct `../../packages/ui/src` paths, so `pnpm dev:desktop` worked by accident — the standalone web app was never tested.

**Fixes (3 files, landed 2026-06-22):**

| File | Change |
|---|---|
| `apps/web/package.json` | Removed `nitro` and `@tanstack/react-start` dependencies. |
| `apps/web/vite.config.ts` | Added `import { tanstackRouter } from "@tanstack/router-plugin/vite"` and `tanstackRouter({ target: "react", autoCodeSplitting: true })` to the plugins array. Fixed 5 alias paths from `../packages/ui/src` → `../../packages/ui/src`. |
| `apps/desktop/electron.vite.config.ts` | Added `tanstackRouter({ target: 'react', autoCodeSplitting: true })` to the renderer plugins array. |

**Side effect of the plugin addition:** running `pnpm dev:web` regenerates `routeTree.gen.ts` cleanly. The `ssr: true` augmentation (auto-generated when the Start plugin was present) is gone — the new file only contains the `@tanstack/react-router` `FileRoutesByPath` augmentation.

**Verification:**

- `pnpm --filter web typecheck` → green
- `pnpm --filter web build` → green (261 modules transformed, dist/ produced, all assets emitted)
- `pnpm --filter web dev` → regenerates `routeTree.gen.ts` with no `ssr` augmentation
- `grep -E 'ssr|react-start|StartClient' apps/web/src/routeTree.gen.ts` → zero matches

**Note for the audit (M3 — `fix-imports.mjs` band-aid):** this fix supersedes part of M3. The Vite aliases are now correct, but the `packages/ui/scripts/fix-imports.mjs` script that rewrites shadcn-generated imports post-build is still present and still load-bearing. M3 cleanup is the next item.

**ADR to write:** `docs/internal/ssr-decision.md` documenting the deferral and the re-adoption triggers.

---

## 6. Migration branch sequencing

The current branch has 64 files changed, 2.5K insertions, 3K deletions, and includes a build-script band-aid. Split into **6 PRs**, each ≤15 files, each independently mergeable:

| # | PR | Files (est.) | Items | Risk |
|---|---|---|---|---|
| 1 | `chore: drop @electron-toolkit/utils + pin Electron 35` | 3 | (already partially landed in this branch) | Low |
| 2 | `feat(ui): extract shadcn into packages/ui with tsconfig paths` | 12-15 | M3, M4 | Medium |
| 3 | `fix(security): add CSP and remove dead ping channel` | 2 | C1, C2 | Low |
| 4 | `chore(web): resolve SSR half-wiring + drop phantom TanStack Query dep` | 4 | C3, M1 | Low |
| 5 | `ci: bump Node to 22.13 across workflows` | 16 | M2 | Low |
| 6 | `docs(internal): seed ADRs for security, IPC contract, SSR decision` | 3 | M5 | Trivial |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6. Each PR is reviewable in <30 min. PR #2 carries the highest risk because it touches the most components — but it's the one that retires the band-aid, so it's worth doing carefully rather than papering over.

**Rollback strategy:** Each PR is independent. If #2 reveals deeper issues with the shadcn extraction, the band-aid can be temporarily reintroduced on that PR alone. The other PRs don't depend on #2.

---

## 7. Acceptance criteria for the audit as a whole

- All P0 items (C1, C2, C3) shipped to `staging`.
- Migration branch either fully merged or rebased onto these 6 PRs.
- `pnpm install --frozen-lockfile` clean.
- `pnpm typecheck` green across all packages.
- `pnpm test` green across `db` and `api`.
- `apps/desktop` launches with CSP enforced (manual smoke test on Windows x64).
- `packages/ui/scripts/fix-imports.mjs` deleted; no consumer references it.
- `docs/internal/` is no longer empty.

---

## 8. Out of scope (explicit)

- `docs/learnings/eve/`, `docs/reports/eve/` — separate workstream.
- macOS / Linux desktop build targets.
- TanStack Query adoption.
- Full SSR migration of `apps/web` (only the half-wiring is resolved here).
- macOS code signing, notarization, auto-update.
- Logging strategy (no log library in use; 3 console.* calls exist in main — junior-grade, flagged separately).
- The `eve` agent dev-agent workflow and its supporting docs.

---

## 9. References

- Conversation log of 2026-06-22 (audit evidence).
- `.claude/agent-memory/tech-lead/feedback/quality-bar.md` — security-first principle.
- `.claude/agent-memory/tech-lead/project/project-db-refactor-state.md` — DI factory precedent for `packages/db`.
- `.claude/agent-memory/tech-lead/learnings/ci-cd-patterns.md` — one-action-per-workflow rule.
- `.claude/agents/electron-expert/README.md` — agent contract that already declares CSP as a requirement (currently unmet).
- `.claude/agents/orpc-expert/README.md` — schema-first contract ownership.
