# Vite 8 — A Senior Engineer's Guide

> Scope: migration from Vite **7.3.3** to Vite **8.0.16**, with the **8.0.0** major as the
> load-bearing release. This guide is grounded only in the research slice
> captured in `docs/learnings/_research.json`; no APIs are invented beyond what
> that data describes.

---

## 1. Overview

Vite is the de-facto frontend dev server + build tool for the modern web
ecosystem. It serves source modules over native ESM in development and bundles
them for production. Historically, Vite has been a **two-engine tool**:

- **Dev (dep pre-bundling + TS/JSX transforms):** `esbuild` (Go)
- **Build (production bundling):** `Rollup` (JavaScript, with `esbuild` for
  minification)

That split made Vite fast in dev, but meant dev and prod used different
plugin APIs, different minifiers, and different resolution semantics. The
**8.0.0** release collapses both engines into a **single Rust-based bundler:
Rolldown** (with Oxc handling the transform / minify / parse layer). The
research data describes this as delivering "approximately 10-30x faster
production builds while maintaining full plugin compatibility."

### Version context for this guide

| Field | Value |
| --- | --- |
| From version | 7.3.3 |
| To version | 8.0.16 |
| Headline release | 8.0.0 (released 2026-03-12) |
| Bundler (dev + build) | Rolldown (replaces esbuild + Rollup) |
| Minifier (JS) | Oxc Minifier (replaces esbuild) |
| Minifier (CSS) | Lightning CSS (replaces esbuild/PostCSS) |
| Transform engine | Oxc (replaces esbuild for TS/JSX) |
| Node engine | 20.19+ or 22.12+ (unchanged from Vite 7) |
| Module system | ESM only (unchanged) |

The release line **8.0.0 → 8.0.16** is a major bump followed by sixteen patch
releases. The breaking-change surface is concentrated in **8.0.0**; the
follow-up patches are bug fixes on top of the new Rolldown-based pipeline.

### The Rolldown migration story

Rolldown is a Rust port of Rollup, designed to be Rollup-API-compatible while
delivering much higher throughput. Vite 8 integrates Rolldown 1.0.0-rc.9.
Two things matter for senior engineers planning the upgrade:

1. **The compatibility layer.** A built-in shim auto-converts legacy
   `esbuild` / `rollupOptions` config to Rolldown/Oxc equivalents. For most
   projects, the upgrade is a package-version bump with no config edits.
2. **The intermediate package: `rolldown-vite`.** For complex projects
   (custom plugins, unusual output formats, deep Rollup-API usage), the
   recommended migration path is to first switch from `vite` to `rolldown-vite`
   on Vite 7.x. This isolates the bundler change from the other Vite 8
   changes, making any regressions trivial to bisect. Once the project is
   stable on `rolldown-vite`, upgrade to Vite 8 and swap the package name
   back to `vite`.

### Trade-offs you are signing up for

- **Speed up, plugin surface down.** 10-30x faster production builds, but
  the plugin surface narrows around the Oxc/Oxc-compatible subset. Several
  legacy hooks were removed (see §4).
- **esbuild becomes optional.** Anything that required esbuild-internal
  semantics (some minifier hacks, certain `optimizeDeps.esbuildOptions`
  tricks) needs porting to Rolldown/Oxc.
- **Two-engine drift is gone.** A single bundler means dev and prod resolve,
  transform, and bundle the same way. That kills a class of "works in dev,
  broken in build" bugs but also removes the escape hatch of "the dev
  bundler will paper over this."

---

## 2. Key new features since 7.3.3

The research data lists the following new capabilities as of 8.0.0. Each is
worth a senior-level discussion of what it actually buys you.

### 2.1 Rolldown as the unified bundler

The headline feature. Both `dev` and `build` now run on Rolldown, which means:

- A single plugin contract (Rolldown's) governs dev and production.
- Resolution, transform, and bundling no longer drift between environments.
- Production builds are reportedly 10-30x faster on representative
  workloads.

Senior caveat: "10-30x" is a research-data claim and almost certainly
worst-case-best-case. Expect **substantial** speedups on cold prod builds
where most of the time is bundling, and **smaller** speedups when your
project is dominated by transforms or by downstream tooling (sourcemap
uploads, asset fingerprinting, S3 upload, etc.).

### 2.2 Vite Devtools (`devtools` option)

Vite 8 ships a `devtools` option that gives you a debugging UI from the dev
server itself. This is positioned as a first-class replacement for several
"why is my plugin doing X" workflows that previously required external
tools. It is the natural companion to Rolldown because dev and prod now share
a bundler — debugging inside Vite's devtools reflects what production will
do.

### 2.3 Built-in tsconfig paths (`resolve.tsconfigPaths`)

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
})
```

This **replaces** the `vite-tsconfig-paths` plugin. Vite 8 will warn when it
detects the legacy plugin is installed. Trade-off: the research data flags
that built-in `tsconfigPaths` has "a small perf cost" and is **off by
default**, so enabling it is opt-in.

If your project already uses the `vite-tsconfig-paths` plugin and you are
not hitting the perf cost, you can leave it on Vite 7 and migrate later.
On Vite 8, you should remove the plugin and enable the built-in.

### 2.4 Built-in `emitDecoratorMetadata` support

Decorator metadata (needed by TypeORM, NestJS, class-validator, etc.) used to
require a Babel/SWC detour. Vite 8 handles it natively. Combined with the
Oxc transform pipeline, this removes a class of "my decorators disappear in
prod" bugs.

Caveat from the research data: native decorators themselves are not
supported by Oxc. If you need native (TC39 stage 3) decorator semantics, the
recommended path is Babel with `@babel/plugin-proposal-decorators` at
`version: '2023-11'`, or SWC at `'2022-03'`.

### 2.5 Lightning CSS

Vite 8 defaults CSS minification to Lightning CSS. Per the research data,
this unlocks **CSS support for `es2024` and `es2025` build targets**, which
esbuild's CSS pipeline did not handle. The new default `build.target` is
Chrome 111 / Edge 111 / Firefox 114 / Safari 16.4, which lines up with
Lightning CSS's target baseline.

### 2.6 Browser console forwarding (`server.forwardConsole`)

A new `server.forwardConsole` option forwards browser console output to the
dev server terminal. Per the research data, this "auto-activates when a
coding agent is detected." For senior engineers, this is a small but real
win for AI-assisted workflows: a coding agent reading the dev server log
sees what the browser sees without you copy-pasting between DevTools and
the terminal.

### 2.7 V2 native plugins enabled by default

Native (Rust-implemented) Rolldown plugins are now on by default. This is
the mechanism behind the Oxc-based React Refresh transform in
`@vitejs/plugin-react` v6 and similar perf wins for other transforms.

### 2.8 Wasm SSR support

`.wasm?init` imports now work in SSR environments. This is a quiet but
important fix for any project that bundles wasm modules for both client and
server runtimes (e.g., server-side image processing, server-side ML
inference).

### 2.9 `optimizeDeps.ignoreOutdatedRequests`

A new optimization knob. Useful when you ship a CDN-served dependency that
Vite's dep optimizer insists is stale and re-pre-bundles on every cold
start.

### 2.10 Manifest `assets` for standalone CSS entry points

The build manifest gains an `assets` field for standalone CSS entry points.
Relevant if you ship CSS as a separate artifact from JS (e.g., a
"critical CSS" extraction pipeline).

### 2.11 `registry.vite.dev`

The research data notes the launch of `registry.vite.dev`, a searchable
directory of Vite/Rolldown/Rollup plugins sourced from npm daily. Treat
this as a directory site, not an authoritative compatibility list — check
the plugin's own docs for Vite 8 support before installing.

---

## 3. Migration path: 7.3.3 → 8.0.16

The research data explicitly recommends a **two-phase migration** for
non-trivial projects. The trade-off is that the simpler path (one jump) is
fine for small apps, but couples bundler changes with other Vite 8 changes,
making rollbacks expensive.

### Phase A — the easy path (small / vanilla projects)

1. Bump `vite` in `package.json` to `^8.0.0`.
2. Run the dev server and a production build.
3. For 80%+ of projects, the built-in compatibility layer covers the
   renames in §3.3.
4. Patch any warnings emitted on startup (`vite-tsconfig-paths` detected,
   `esbuildOptions` detected, etc.).
5. Run your test suite.

### Phase B — the recommended path (complex / custom-plugin projects)

1. On **Vite 7.x**, swap `vite` → `rolldown-vite` in `package.json`.
2. Run dev + build + tests. Fix any bundler regressions **while still on
   Vite 7**, so the diff is purely about Rolldown.
3. Bump to **Vite 8.0.0**. Swap `rolldown-vite` back to `vite` in
   `package.json`. The Rolldown engine is already in production; the only
   Vite 8 deltas you are now absorbing are the config renames and the
   removed hooks.
4. Incrementally patch to the latest 8.0.x patch (`8.0.16` in this guide).

The Phase B approach is what the research data calls out specifically:

> Recommended path for complex projects: first switch from `vite` to
> `rolldown-vite` on Vite 7.x, then upgrade to Vite 8. This isolates
> bundler-change issues from other Vite 8 changes.

### 3.1 Node engine and ESM

Vite 8 keeps the Vite 7 minimums:

- Node.js **20.19+** or **22.12+**
- ESM only

If your CI matrix pins Node 20.18 or 22.11, bump it before the Vite upgrade.

### 3.2 The two renames that matter most

```ts
// vite.config.ts — before (Vite 7)
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      // ...
    },
  },
  worker: {
    rollupOptions: {
      // ...
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // ...
    },
  },
})
```

```ts
// vite.config.ts — after (Vite 8)
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      // ...
    },
  },
  worker: {
    rolldownOptions: {
      // ...
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      // ...
    },
  },
})
```

The compatibility layer will auto-rename, but writing the new keys directly
future-proofs your config against the removal of the shim in a later
release.

### 3.3 Full rename table (from the research data)

| Vite 7 key | Vite 8 key | Notes |
| --- | --- | --- |
| `build.rollupOptions` | `build.rolldownOptions` | Renamed. Auto-converted. |
| `worker.rollupOptions` | `worker.rolldownOptions` | Renamed. Auto-converted. |
| `optimizeDeps.esbuildOptions` | `optimizeDeps.rolldownOptions` | Renamed. Auto-converted. |
| `esbuild` (top-level config option) | `oxc` | Renamed. esbuild is now optional. |
| `transformWithEsbuild` (plugin API) | `transformWithOxc` | Renamed. |
| `build.rollupOptions.watch.chokidar` | `build.rolldownOptions.watch.watcher` | Renamed and re-architected. |
| `build.rollupOptions.output.manualChunks` (object form) | (removed) | Use Rolldown `codeSplitting` option. |
| `build.rollupOptions.output.manualChunks` (function form) | (deprecated) | Use Rolldown `codeSplitting` option. |
| `build.commonjsOptions` | (removed) | No-op, dropped. |
| `resolve.alias[].customResolver` | (deprecated) | Use new resolver API. |
| `experimental.enableNativePlugin: 'resolver'` | (removed) | Native plugins are on by default. |

### 3.4 React plugin specifics

The React story has two tracks:

- **`@vitejs/plugin-react` v5** still works with Vite 8. Keep it if you
  are mid-refactor.
- **`@vitejs/plugin-react` v6** uses **Oxc** for the React Refresh
  transform, **drops Babel** as a dependency, and exposes a new
  `reactCompilerPreset` named export for use with `@rolldown/plugin-babel`.
  Smaller install, faster HMR, but a breaking config change (the inline
  `babel` option on `react({...})` is gone — Babel must be composed as a
  sibling plugin in the `plugins` array).

If you previously passed `react({ babel: { plugins: [...] } })`, your v6
equivalent is:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({
      plugins: ['@babel/plugin-proposal-throw-expressions'],
    }),
  ],
})
```

### 3.5 Module resolution

Vite 8 no longer uses format sniffing to choose between browser and module
fields. If you were relying on Vite picking `module` over `browser` for a
package, lock the choice explicitly via `resolve.alias` or patches.

### 3.6 `legacy.inconsistentCjsInterop`

The default CJS default-import behavior changed. The new rule, per the
research data, is:

> Default import from CJS now equals `module.exports` when the importer is
> `.mjs`/`.mts`, the closest `package.json` has `"type": "module"`, or
> `module.exports.__esModule` is not set to `true`.

This is a real footgun for libraries that interop with both CJS and ESM
consumers. To restore the prior behavior:

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  legacy: {
    inconsistentCjsInterop: true,
  },
})
```

This is the type of change that is invisible until a downstream package
breaks. Audit your CJS dependencies before upgrading.

### 3.7 Removed output formats

`system` and `amd` output formats are gone. If you ship UMD/AMD bundles for
legacy loaders, switch to `es` or `cjs`. The research data does not promise
a deprecation period — these were removed outright in 8.0.0.

---

## 4. Common pitfalls and gotchas

These are the migration hazards the research data calls out, plus a few
worth flagging for senior engineers.

### 4.1 CJS interop changes (§3.6 above)

Single biggest source of "tests pass, prod is broken" surprises in the 8.x
line. Read the rule carefully and run an integration build against your
heaviest CJS dependency.

### 4.2 Removed hooks

The following plugin hooks were removed in 8.0.0:

- `shouldTransformCachedModule`
- `resolveImportMeta`
- `renderDynamicImport`
- `resolveFileUrl`

If your plugin code (or a third-party plugin you depend on) uses any of
these, it needs to be ported to the Rolldown/Oxc native plugin equivalents.
The migration tip in the research data is explicit: "migrate to the
Rolldown/Oxc native plugin equivalents." There is no shim for these.

For `@vitejs/plugin-legacy` users: the plugin was rebuilt for the 8.x
architecture. ES5 transpilation no longer works through the legacy Vite
internals — install `@vitejs/plugin-legacy@8.x` and follow its
Vite-8-specific docs.

### 4.3 Parallel hooks now run sequentially

`resolveId` and `load` were parallel under esbuild+Rollup. Under Rolldown
they run sequentially. Two consequences:

- Plugins that **depended on** parallelism (e.g., expecting two `resolveId`
  implementations to race) will now behave deterministically.
- Plugins that **relied on** concurrency for throughput (heavy I/O in
  `resolveId`) will be slower. Audit any plugin that does network or disk
  work in `resolveId`/`load`.

### 4.4 `output.manualChunks` semantics changed

The **object form** of `manualChunks` is removed. The **function form** is
deprecated. Use Rolldown's `codeSplitting` option instead. This is a real
config rewrites if you were using `manualChunks` to keep vendor chunks
stable.

### 4.5 `import.meta.url` in UMD/IIFE

Polyfilling is no longer the default; `import.meta.url` is replaced with
`undefined` in UMD/IIFE output. If you ship a UMD library that consumers
load via `<script>` and introspect `import.meta.url`, you need an explicit
plugin to restore it.

### 4.6 `require()` in externalized modules

`require()` calls in externalized modules are now **preserved as
`require()` calls** instead of being converted to imports. This is more
correct but will break consumers that previously relied on Vite rewriting
their `require()` calls. Use `esmExternalRequirePlugin` to restore the old
behavior of converting to imports.

### 4.7 `vite-tsconfig-paths` plugin is now noise

The plugin still works but Vite 8 emits a warning. Switch to
`resolve.tsconfigPaths: true` in your config to silence the warning and
drop a dependency.

### 4.8 esbuild is optional

If you have a build pipeline that depended on esbuild being present (e.g.,
a postinstall script that calls `esbuild` directly), it is no longer
guaranteed to be installed. Add it as an explicit dependency.

### 4.9 `build()` throws `BundleError`

`build()` now throws a `BundleError` with an `errors` array instead of a
flat error. Any try/catch that pattern-matches on the thrown error needs
updating.

### 4.10 Plugins must return `moduleType: 'js'` for non-JS

When loading non-JS content, plugins must return `moduleType: 'js'`. This
is a sharper contract than the old behavior. Plugin authors should grep
their code for `load` hooks that return raw strings without a
`moduleType`.

### 4.11 Native wasm helper plugin is gone

The native wasm helper plugin was removed because the built-in `.wasm?init`
handling now does the work. Remove it from your `plugins` array — it will
throw or no-op, depending on the version.

### 4.12 Decorator semantics caveat

Native (TC39 stage 3) decorators are **not** supported by Oxc. The
research data is explicit: use Babel with
`@babel/plugin-proposal-decorators` at `version: '2023-11'`, or SWC at
`'2022-03'`. This is a quiet pitfall for NestJS / TypeORM / class-validator
projects.

### 4.13 Patch versions matter

The guide covers up to **8.0.16**. Several patch releases will have landed
fixes for the obvious migration issues (chokidar rename, esbuild shim
deprecation noise, etc.). Pin to the latest 8.0.x and read the changelog
before deploying.

---

## 5. Verification checklist (post-upgrade)

A senior engineer's migration is not done when `pnpm install` returns 0.
Use this checklist against a real build:

1. **Cold production build time** — capture before/after. Expect a large
   delta on Rolldown's strong workloads (large dependency graphs, deep
   treeshaking).
2. **Bundle sizes** — Oxc minifier is not byte-identical to esbuild. Diff
   your critical CSS and JS artifacts.
3. **CJS consumer matrix** — for every CJS dependency you ship or import,
   verify default-import behavior against your `legacy.inconsistentCjsInterop`
   setting.
4. **Custom plugins** — verify `resolveId`/`load` ordering and any
   parallelism-dependent behavior.
5. **`@vitejs/plugin-legacy`** — if you use it, install `@vitejs/plugin-legacy@8.x`
   explicitly. Don't rely on a transitive v7 install.
6. **`@vitejs/plugin-react`** — decide v5-still-on-v8 vs. v6-with-Oxc
   track. Don't mix.
7. **Dev console forwarding** — confirm `server.forwardConsole` does or
   does not fire based on your CI environment (it auto-activates on
   coding agents).
8. **Bundle manifest** — if you use the `assets` field for standalone CSS,
   verify the new shape matches your downstream pipeline.

---

## 6. References

All claims in this guide are sourced from `docs/learnings/_research.json`,
slice `research[3]` (package: `vite`, from 7.3.3 to 8.0.16). The primary
upstream reference is the Vite 8.0.0 release notes:

- Vite 8.0.0 release notes: https://github.com/vitejs/vite/releases/tag/v8.0.0
- Research data: `C:\Users\dpereira\Documents\github\complete-electron-template\docs\learnings\_research.json`

Companion CHANGELOG for the 8.0.0 major:
`docs/learnings/vite/changelogs/8.0.0/CHANGELOG.md`.