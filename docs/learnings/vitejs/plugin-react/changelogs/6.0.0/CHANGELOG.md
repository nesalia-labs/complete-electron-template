# `@vitejs/plugin-react` 6.0.0 — CHANGELOG

- **Version**: `6.0.0`
- **Release date**: `2026-03-12`
- **Track**: `5.2.0` -> `6.0.0`
- **Source**: https://github.com/vitejs/vite-plugin-react/releases/tag/v6.0.0

## Summary

`6.0.0` is a major release that aligns `@vitejs/plugin-react` with the Vite 8
+ Rolldown/Oxc architecture. The headline changes are the **removal of Babel
as an internal dependency** and the **inversion of the React Compiler setup**
from a plugin-internal option into a named export you compose with
`@rolldown/plugin-babel`.

## Breaking changes

### 1. Babel removed as a dependency

React Refresh is now applied by Oxc inside Vite 8. `@vitejs/plugin-react` no
longer ships Babel, `@babel/preset-env`, `@babel/plugin-transform-react-jsx`,
or the surrounding plumbing. Install footprint drops significantly.

### 2. Vite 7 and below are no longer supported

Vite 8 is now a hard peer dependency. Installations against Vite 7 will fail
to resolve the peer, and an attempted runtime use will not produce a working
React Refresh transform.

### 3. `react({ babel: { ... } })` option removed

The inline `babel` option on the React plugin is gone. Babel transforms are
now a separate concern and must be wired through `@rolldown/plugin-babel` as
a sibling plugin.

**Before (5.x):**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['@babel/plugin-proposal-throw-expressions'],
        presets: ['@babel/preset-typescript'],
      },
    }),
  ],
})
```

**After (6.x):**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({
      plugins: ['@babel/plugin-proposal-throw-expressions'],
      presets: ['@babel/preset-typescript'],
    }),
  ],
})
```

This requires installing `@rolldown/plugin-babel` as a dev dependency.

## New features

### 1. `reactCompilerPreset` named export

A preconfigured Babel preset that wires `babel-plugin-react-compiler` with
sensible defaults. Use it with `@rolldown/plugin-babel`:

```ts
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
})
```

To pass options through to `babel-plugin-react-compiler` (for example
`target`, `runtime`):

```ts
babel({
  presets: [
    reactCompilerPreset({
      target: '19',
      runtime: 'automatic',
    }),
  ],
})
```

### 2. First-class React Compiler integration

Previously, enabling the React Compiler required manually listing
`babel-plugin-react-compiler` under `react({ babel: { plugins: [...] } })`.
The new `reactCompilerPreset` makes the Compiler a documented, supported path
on the v6 line rather than a workaround.

### 3. Oxc-based React Refresh transform

React Fast Refresh now runs through Oxc (Rust-based) as part of Vite 8's
transform pipeline, replacing the previous Babel pass. The semantic behavior
of HMR / Fast Refresh is unchanged; performance and bundle size improve.

### 4. Reduced installation size

By removing Babel and the React-specific Babel plugins from the dependency
graph, the plugin's `node_modules` footprint shrinks significantly. Concrete
savings depend on whether the host project pulls in Babel through other
plugins; in a typical app that used Babel only via `@vitejs/plugin-react`, the
saving is substantial.

### 5. Cleaner plugin composition

Babel transforms are no longer a special-cased nested option of the React
plugin. They live where other transforms live — in the `plugins` array,
alongside everything else — which removes a layer of double-bookkeeping.

## Deprecations

- The inline `babel` option on `react()` is effectively removed without an
  explicit deprecation period. Code that still passes it will silently drop
  those transforms in v6; you must migrate to `@rolldown/plugin-babel`.
- No other explicit deprecations are documented in the v6.0.0 release notes.

## Migration tips

1. **Upgrade Vite first.** `6.x` of `@vitejs/plugin-react` requires Vite 8.
   Update `vite` in `devDependencies` and resolve any Vite 8 migration
   issues (e.g. `build.rollupOptions` -> `build.rolldownOptions`) before
   bumping the React plugin.

2. **Install `@rolldown/plugin-babel`** if you were using the `babel` option:

   ```bash
   npm install -D @rolldown/plugin-babel
   ```

3. **Move Babel config out of `react(...)`**. Replace:

   ```ts
   react({ babel: { plugins: ['@babel/plugin-x'] } })
   ```

   with:

   ```ts
   react()
   babel({ plugins: ['@babel/plugin-x'] })
   ```

4. **Migrate the React Compiler**. Replace:

   ```ts
   react({
     babel: {
       plugins: [['babel-plugin-react-compiler', { target: '19' }]],
     },
   })
   ```

   with:

   ```ts
   import react, { reactCompilerPreset } from '@vitejs/plugin-react'

   react()
   babel({ presets: [reactCompilerPreset({ target: '19' })] })
   ```

5. **Verify your Node.js version.** Node.js `20.19+` or `22.12+` is
   required (carried over from v5; unchanged in v6).

6. **Audit `resolve.dedupe`.** Automatic `react` / `react-dom` dedupe is no
   longer guaranteed. If your bundle previously relied on the plugin
   silently collapsing duplicate React copies, add them explicitly:

   ```ts
   export default defineConfig({
     plugins: [react()],
     resolve: { dedupe: ['react', 'react-dom'] },
   })
   ```

7. **Check `exclude` semantics.** The default `exclude` was already
   `[/\\/node_modules\\//]` in v5; if you were carrying a v4-era
   `exclude: []` override, verify your build still behaves as expected.

## Source

- Release notes: https://github.com/vitejs/vite-plugin-react/releases/tag/v6.0.0
