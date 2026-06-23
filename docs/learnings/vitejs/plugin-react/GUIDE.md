# `@vitejs/plugin-react` — Senior-Level Usage Guide

> Track: `5.2.0` -> `6.0.2`
> Source release notes: https://github.com/vitejs/vite-plugin-react/releases/tag/v6.0.0

## 1. Overview

`@vitejs/plugin-react` is the official React Fast Refresh plugin for Vite. It wires
up React's HMR story and, historically, bundled a Babel pipeline for JSX/TS
transforms. As of **v6.0.0** (released `2026-03-12`), the plugin has been
fundamentally reshaped to fit the **Vite 8 + Rolldown/Oxc** era:

- **Babel is no longer a dependency of `@vitejs/plugin-react`.** React Refresh
  is now applied via **Oxc** inside Vite 8 itself, removing the previous
  double-transform cost (Vite -> Babel for JSX, Babel -> React Refresh).
- The plugin **requires Vite 8** as a peer dependency. Vite 7 and below are no
  longer supported.
- The previous `babel` option (`react({ babel: { plugins: [...] } })`) is gone.
  If you need Babel transforms, you now compose them via the sibling
  `@rolldown/plugin-babel` plugin in the `plugins` array.
- A new **`reactCompilerPreset`** named export ships with the plugin to make
  React Compiler wiring a one-liner.

The v6 line is intentionally lean. The trade-off is sharp: install footprint
shrinks dramatically and HMR is faster (Ox vs. JS), but **anything that needed
Babel has to be opted into explicitly** through `@rolldown/plugin-babel`.

## 2. Key new features since 5.2.0

### 2.1 Oxc-based React Refresh transform

In v5, `react()` would install a Babel pass that injected React Refresh runtime
calls and the necessary preamble. In v6, that transform is delegated to Oxc and
runs as part of Vite 8's transform pipeline. Net result:

- Faster HMR (no Babel parse -> generate step for the Refresh prelude).
- Smaller bundle of `@vitejs/plugin-react` itself.
- **No semantic change** for the consumer: HMR boundaries, error overlays, and
  Fast Refresh behavior are preserved.

### 2.2 `reactCompilerPreset` named export

This is the headline feature of v6. The plugin now exports a preconfigured Babel
preset that wraps `babel-plugin-react-compiler` with sensible defaults:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { reactCompilerPreset } from '@vitejs/plugin-react'
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

Before v6, the equivalent setup required hand-wiring `babel-plugin-react-compiler`
through the plugin's internal Babel options. Now it's a named export you can
compose with.

### 2.3 Smaller install size

By dropping `babel`, `@babel/plugin-transform-react-jsx`, and friends from the
dependency graph, v6 installs significantly less code. This matters in
constrained environments (CI cache layers, Docker base images, Electron's
`node_modules` shipped with the app).

### 2.4 Cleaner plugin composition

Babel transforms are no longer a special-cased sub-option of `react()`. They
live where they belong: in the `plugins` array, as a peer plugin. This is the
same composition model Vite has used for everything else (e.g. `vite:css-post`,
legacy plugins, etc.) and it removes the awkward `react({ babel: ... })`
double-bookkeeping.

## 3. Migration path: 5.2.0 -> 6.0.2

A 5.2.0 -> 6.0.2 migration is **not just a version bump**. It touches the
peer-dependency boundary (Vite), the plugin config surface (Babel), and the
React Compiler setup. Approach it in three steps.

### Step 1 — Upgrade Vite first

`@vitejs/plugin-react` v6 lists Vite 8 as a peer dependency. Trying to install
v6 against Vite 7 will fail (or, with permissive resolutions, silently break
the React Refresh transform).

```jsonc
// package.json
{
  "devDependencies": {
    "vite": "^8.0.0",
    "@vitejs/plugin-react": "^6.0.2"
  }
}
```

Read the Vite 8 migration notes separately; the bundler switch (Rolldown) and
the rename `build.rollupOptions` -> `build.rolldownOptions` are the most likely
landmines.

### Step 2 — Audit existing `babel` usage in `react({ babel: ... })`

In v5, you may have been doing any of:

```ts
// v5: inline Babel options via the React plugin
react({
  babel: {
    plugins: ['@babel/plugin-proposal-throw-expressions'],
    presets: ['@babel/preset-typescript'],
  },
})
```

In v6, that `babel` key is gone. Anything inside it has to be moved into a
peer `babel()` call from `@rolldown/plugin-babel`:

```ts
// v6: Babel is now a sibling plugin
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

If your v5 config had no `babel` key at all, this step is a no-op for you.

### Step 3 — Migrate React Compiler setup

If you were running `babel-plugin-react-compiler` through the inline `babel`
option, switch to the new preset:

```ts
// v5
react({
  babel: {
    plugins: [
      ['babel-plugin-react-compiler', { target: '19' }],
    ],
  },
})

// v6
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

react(),
babel({
  presets: [reactCompilerPreset()],
})
```

`reactCompilerPreset()` returns a Babel preset with the plugin already wired
in. If you need to override options (e.g. `target`, `runtime`), pass them as
arguments and they are forwarded to `babel-plugin-react-compiler`.

## 4. Common pitfalls and gotchas

### 4.1 Vite 8 is a hard requirement

`@vitejs/plugin-react` v6 will not function on Vite 7. If you are mid-migration
and not yet ready for Vite 8, **stay on v5 of `@vitejs/plugin-react`**. The v5
line still works with Vite 8 (the migration note in Vite 8's release notes
explicitly says so), so an interim upgrade of just `@vitejs/plugin-react` to
v6 without bumping Vite will fail.

### 4.2 Babel is now an opt-in via `@rolldown/plugin-babel`

The biggest behavioral trap is silent: if your v5 config had *any* Babel plugin
or preset under `react({ babel: ... })`, that transform will not run in v6
unless you also install `@rolldown/plugin-babel` and add a `babel()` plugin
entry. There is no runtime warning — the build will simply produce code that
does not have those transforms applied.

If you previously didn't need Babel at all (Vite's built-in TS/JSX handling was
sufficient), you don't need to install `@rolldown/plugin-babel`. The bare
`react()` call still works.

### 4.3 `react-dom` dedupe

In older versions of `@vitejs/plugin-react`, the plugin would automatically
dedupe `react` and `react-dom` in `resolve.dedupe` for you. That automatic
dedupe is no longer guaranteed; if your project relies on a single React copy
in the bundle (it should — duplicate React copies cause subtle hooks bugs),
add it explicitly:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
```

This is good hygiene regardless, but it's now strictly your responsibility.

### 4.4 `exclude` default change (carried over from v5)

This is not new in v6, but it's a frequent source of confusion. v5 changed the
default `exclude` from `[]` to `[/\\/node_modules\\//]`. If you had been
explicitly setting `exclude: []` in v4-era configs to opt node_modules back in,
that override still applies in v6 — but be deliberate about it. Most projects
do not want Babel running over `node_modules`.

### 4.5 React Compiler + `reactCompilerPreset`

A few sharp edges when adopting the React Compiler through v6:

- `reactCompilerPreset()` is a Babel preset; it must be paired with
  `@rolldown/plugin-babel`. It does not work standalone.
- The Compiler wants React 19. If you are still on React 18, do not enable it
  — you'll get confusing type errors at minimum, runtime breakage at worst.
- The Compiler emits a one-time "compile memoization" hint at build time. If
  HMR misbehaves after enabling, try a full dev-server restart; the fast
  refresh boundary needs to re-establish itself.

### 4.6 Node.js version

Carried over from v5: Node.js **20.19+** or **22.12+**. This is unchanged in
v6, but if you are migrating a project that's been on an older LTS, check
this first before debugging deeper plugin issues.

## 5. References

- v6.0.0 release notes: https://github.com/vitejs/vite-plugin-react/releases/tag/v6.0.0
- Vite 8 migration (peer dependency requirement): https://github.com/vitejs/vite/releases/tag/v8.0.0
- `@rolldown/plugin-babel` (the new sibling plugin for Babel transforms): https://github.com/rolldown/rolldown
- React Compiler: https://react.dev/learn/react-compiler
