# Vite 8.0.0 — CHANGELOG

> **Release date:** 2026-03-12
> **Package:** `vite`
> **From:** 7.3.3
> **Major jump:** 7 → 8
> **Headline:** Rolldown replaces esbuild (dev) + Rollup (prod) as the single
> unified Rust-based bundler.
> **Node engine:** 20.19+ or 22.12+ (unchanged from Vite 7). ESM only.

Source: https://github.com/vitejs/vite/releases/tag/v8.0.0

---

## Breaking changes

### 1. Unified bundler: Rolldown replaces esbuild + Rollup

The single most consequential change. Dev and production now share one
bundler. A built-in compatibility layer auto-converts legacy config keys
to their Rolldown/Oxc equivalents, but complex projects should expect
manual edits.

### 2. Default `build.target` updated

`build.target` now defaults to:

- Chrome 111
- Edge 111
- Firefox 114
- Safari 16.4

If you shipped to older browsers via this default, set an explicit target.

### 3. Config-key renames

All four renames below are auto-converted by the compatibility layer, but
writing the new keys directly future-proofs your config.

```ts
// Before — Vite 7
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  worker: {
    rollupOptions: {
      // ...
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020',
    },
  },
})
```

```ts
// After — Vite 8
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      // Use Rolldown's codeSplitting option instead of manualChunks.
      codeSplitting: {
        // ...
      },
    },
  },
  worker: {
    rolldownOptions: {
      // ...
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      target: 'es2020',
    },
  },
})
```

Note: `build.rollupOptions.output.manualChunks` (object form) is removed;
the function form is deprecated. Use Rolldown's `codeSplitting` option.

### 4. `esbuild` config option → `oxc`

```ts
// Before — Vite 7
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    target: 'es2020',
    jsxFactory: 'h',
  },
})
```

```ts
// After — Vite 8
import { defineConfig } from 'vite'

export default defineConfig({
  oxc: {
    target: 'es2020',
    // jsxFactory support is Oxc-specific; consult Rolldown/Oxc docs.
  },
})
```

`esbuild` itself is now an **optional dependency** and is no longer bundled
by default. Add it explicitly if your pipeline still depends on it.

### 5. `transformWithEsbuild` → `transformWithOxc`

Plugin authors:

```ts
// Before — Vite 7
import { transformWithEsbuild } from 'vite'

export function myPlugin() {
  return {
    name: 'my-plugin',
    async transform(code, id) {
      const out = await transformWithEsbuild(code, id)
      return out
    },
  }
}
```

```ts
// After — Vite 8
import { transformWithOxc } from 'vite'

export function myPlugin() {
  return {
    name: 'my-plugin',
    async transform(code, id) {
      const out = await transformWithOxc(code, id)
      return out
    },
  }
}
```

### 6. CJS interop behavior change

The default-import behavior from CJS modules changed. Under Vite 8, a
default import from CJS equals `module.exports` when **any** of the
following is true:

- The importer is `.mjs` or `.mts`
- The closest `package.json` has `"type": "module"`
- `module.exports.__esModule` is not set to `true`

To restore the prior behavior:

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  legacy: {
    inconsistentCjsInterop: true,
  },
})
```

### 7. Module resolution: no more format sniffing

Vite no longer uses format sniffing to choose between `browser` and
`module` fields. Make your choice explicit via `resolve.alias` or patches.

### 8. `require()` preserved in externalized modules

`require()` calls in externalized modules are preserved as `require()`
calls. To convert them to imports, use `esmExternalRequirePlugin`.

### 9. `import.meta.url` no longer polyfilled in UMD/IIFE

Replaced with `undefined` by default. Add an explicit plugin if your UMD
consumers introspect `import.meta.url`.

### 10. Plugin API: non-JS content must declare `moduleType`

When a plugin's `load` hook returns non-JS content, the plugin must also
return `moduleType: 'js'`.

```ts
// Before — Vite 7 (silently accepted)
export function myPlugin() {
  return {
    name: 'my-plugin',
    load(id) {
      return 'export default {}'
    },
  }
}
```

```ts
// After — Vite 8 (must declare moduleType)
export function myPlugin() {
  return {
    name: 'my-plugin',
    load(id) {
      return {
        code: 'export default {}',
        moduleType: 'js',
      }
    },
  }
}
```

### 11. Parallel hooks now sequential

`resolveId` and `load` now run sequentially instead of in parallel.
Plugins depending on race semantics will see deterministic ordering; heavy
I/O in `resolveId` will be slower.

### 12. `build.rollupOptions.watch.chokidar` removed

Migrate to `build.rolldownOptions.watch.watcher`.

### 13. `build.commonjsOptions` removed

No-op now; drop it from your config.

### 14. Output formats `system` and `amd` removed

Switch to `es` or `cjs` if you were targeting these.

### 15. Plugin hooks removed

The following hooks were removed in 8.0.0:

- `shouldTransformCachedModule`
- `resolveImportMeta`
- `renderDynamicImport`
- `resolveFileUrl`

Migrate custom plugins that use these to the Rolldown/Oxc native plugin
equivalents.

### 16. `URL` support in `import.meta.hot.accept` removed

Use string-based module IDs.

### 17. `@vitejs/plugin-legacy` ES5 transpilation removed

The legacy plugin was rebuilt for 8.x. Install
`@vitejs/plugin-legacy@8.x` to restore ES5 transpilation under the new
architecture.

### 18. `experimental.enableNativePlugin: 'resolver'` removed

Native plugins are now enabled by default.

### 19. Native wasm helper plugin removed

The built-in `.wasm?init` handling now covers this; remove the helper
plugin from your `plugins` array.

### 20. `vite-tsconfig-paths` plugin emits a warning

The built-in `resolve.tsconfigPaths: true` supersedes it. See the new
features section.

---

## New features

### Rolldown 1.0.0-rc.9 as unified bundler

Rust-based bundler for both dev and build, reported to deliver 10-30x
faster production builds while maintaining plugin compatibility.

### Vite Devtools (`devtools` option)

Debug directly from the dev server.

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  devtools: true,
})
```

### Built-in tsconfig paths (`resolve.tsconfigPaths`)

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
})
```

Replaces the `vite-tsconfig-paths` plugin. Off by default due to a small
perf cost.

### Built-in `emitDecoratorMetadata` support

No external plugin needed for decorator metadata. Caveat: native (TC39
stage 3) decorators are still not supported by Oxc; use Babel or SWC for
those (see migration tips).

### Wasm SSR support

`.wasm?init` imports work in SSR environments.

### Browser console forwarding

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    forwardConsole: true, // auto-activates when a coding agent is detected.
  },
})
```

### V2 native plugins enabled by default

Faster Rust-based plugin transforms.

### Lightning CSS for es2024 / es2025 targets

CSS minification is now Lightning CSS by default, which unlocks modern CSS
feature support that the old esbuild/PostCSS pipeline could not handle.

### Bundled-dev worker support in initial bundle

### Manifest `assets` field for standalone CSS entry points

### `optimizeDeps.ignoreOutdatedRequests` option

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    ignoreOutdatedRequests: true,
  },
})
```

### ESTree / Visitor exports from `rolldown/utils`

For plugin authors.

### `util.inspect` for CLI error display

Cleaner stack/error output in the CLI.

### `@vitejs/plugin-react` v6

- Uses Oxc for the React Refresh transform.
- Drops Babel as a dependency.
- Smaller install size.
- New `reactCompilerPreset` helper for React Compiler (opt-in via
  `@rolldown/plugin-babel`).

`@vitejs/plugin-react` v5 still works with Vite 8.

### `registry.vite.dev`

A searchable directory of Vite, Rolldown, and Rollup plugins, sourced
from npm daily. Directory site — verify Vite 8 compatibility on each
plugin's own docs before installing.

---

## Deprecations

| Item | Replacement |
| --- | --- |
| `optimizeDeps.esbuildOptions` | `optimizeDeps.rolldownOptions` |
| `build.rollupOptions` | `build.rolldownOptions` |
| `worker.rollupOptions` | `worker.rolldownOptions` |
| `esbuild` config option | `oxc` |
| `transformWithEsbuild` | `transformWithOxc` |
| `build.rollupOptions.output.manualChunks` (function form) | Rolldown `codeSplitting` |
| `resolve.alias` `customResolver` | new resolver API |
| `vite-tsconfig-paths` plugin | built-in `resolve.tsconfigPaths` |
| `esbuild` as a default dependency | now optional; will be removed in a future major |

---

## Migration tips

These are the recommendations sourced directly from the Vite 8.0.0
release notes, ordered by impact.

### Tip 1 — Use the two-phase migration for complex projects

First switch from `vite` to `rolldown-vite` on Vite 7.x, then upgrade to
Vite 8. This isolates bundler-change issues from other Vite 8 changes.

```jsonc
// package.json — Phase A: Rolldown preview on Vite 7
{
  "devDependencies": {
    "rolldown-vite": "^7.0.0"
  }
}
```

```jsonc
// package.json — Phase B: Vite 8 stable
{
  "devDependencies": {
    "vite": "^8.0.0"
  }
}
```

### Tip 2 — Most projects need no config changes

The built-in compatibility layer auto-converts `esbuild` / `rollupOptions`
to Rolldown/Oxc equivalents.

### Tip 3 — Rename `rollupOptions` and `esbuildOptions`

Even with the shim, write the new names directly so future majors do not
break you:

```ts
// vite.config.ts — Vite 8
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: { /* ... */ },
  },
  worker: {
    rolldownOptions: { /* ... */ },
  },
  optimizeDeps: {
    rolldownOptions: { /* ... */ },
  },
})
```

### Tip 4 — Drop `vite-tsconfig-paths` for the built-in

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
})
```

### Tip 5 — Drop `build.commonjsOptions`

It is a no-op now; remove it.

### Tip 6 — Switch `system` / `amd` formats

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        format: 'es', // was 'system' or 'amd'
      },
    },
  },
})
```

### Tip 7 — Migrate removed hooks

If a custom plugin uses `shouldTransformCachedModule`, `resolveImportMeta`,
`renderDynamicImport`, or `resolveFileUrl`, port it to the
Rolldown/Oxc native plugin equivalents.

### Tip 8 — ES5 / legacy browsers

Install `@vitejs/plugin-legacy@8.x`. Do not rely on a transitive v7
install.

### Tip 9 — Native decorators

Use Babel with `@babel/plugin-proposal-decorators` at `version: '2023-11'`,
or SWC at `'2022-03'`. Oxc does not support TC39 stage 3 native
decorators.

```ts
// vite.config.ts — native decorators via SWC
import { defineConfig } from 'vite'

export default defineConfig({
  // Configure SWC through @vitejs/plugin-react-swc or a custom plugin.
})
```

### Tip 10 — Restore old CJS interop behavior

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  legacy: {
    inconsistentCjsInterop: true,
  },
})
```

### Tip 11 — `require()` in externalized modules

Use `esmExternalRequirePlugin` to convert `require()` calls to imports.

### Tip 12 — Node engine

Vite 8 requires **Node.js 20.19+** or **22.12+**, and is **ESM only**.

### Tip 13 — `@vitejs/plugin-react`

V5 still works with Vite 8. To upgrade to v6 (Oxc-based React Refresh,
no Babel), install `@rolldown/plugin-babel` separately and compose it as
a sibling plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({
      // ...
    }),
  ],
})
```

### Tip 14 — `build.rollupOptions.watch.chokidar`

Replace with `build.rolldownOptions.watch.watcher`.

---

## Source

- Vite 8.0.0 release notes:
  https://github.com/vitejs/vite/releases/tag/v8.0.0
- Research data: `C:\Users\dpereira\Documents\github\complete-electron-template\docs\learnings\_research.json`
- Companion guide: `docs/learnings/vite/GUIDE.md`