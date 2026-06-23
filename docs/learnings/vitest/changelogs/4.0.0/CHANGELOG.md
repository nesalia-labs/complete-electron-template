# Vitest 4.0.0 CHANGELOG

**Release date:** October 22, 2025
**Source:** https://github.com/vitest-dev/vitest/releases/tag/v4.0.0

Vitest 4.0.0 is the largest internal rewrite since 1.0. The headline changes are
the replacement of `vite-node` with `vite/module-runner`, the rewrite of the
worker pool without `tinypool`, and the rewrite of the mocking engine. Browser
Mode graduates out of experimental and the monolithic `@vitest/browser` package
splits into provider-specific packages.

---

## Breaking changes

### 1. Platform requirements

- **Vite 5 support removed.** Vitest 4 requires Vite >= 6.0.0.
- **Node.js >= 20.0.0.** Node 18 is no longer supported.

### 2. Configuration key renames

```ts
// vitest.config.ts - before
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporter: 'basic',
    workspace: ['./apps/web', './apps/desktop'],
    environmentMatchGlobs: [['**/*.tsx', 'jsdom']],
    poolMatchGlobs: [['**/*.bench.ts', 'vmThreads']],
    deps: {
      external: ['lodash'],
      inline: [/\.tsx?$/],
      fallbackCJS: true,
    },
  },
})

// vitest.config.ts - after
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporter: ['default', { summary: false }],
    projects: [
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'desktop',
          include: ['apps/desktop/**/*.{test,spec}.ts'],
        },
      },
    ],
    server: {
      deps: {
        external: ['lodash'],
        inline: [/\.tsx?$/],
        fallbackCJS: true,
      },
    },
  },
})
```

Specific renames:

- `reporter: 'basic'` -> `reporter: ['default', { summary: false }]`
- `workspace` -> `test.projects` (array, only `vitest.config` / `vite.config`
  filenames accepted)
- `environmentMatchGlobs` / `poolMatchGlobs` -> per-project `test.environment`
  and `test.pool` inside `projects`
- `deps.external` / `deps.inline` / `deps.fallbackCJS` -> `server.deps.*`
- `browser.testerScripts` -> `browser.testerHtmlPath`

### 3. Pool rewrite (`tinypool` removed)

The worker pool was rewritten without `tinypool`. The `threads` / `vmThreads` /
`forks` / `vmForks` distinction is preserved via `test.pool`, but the worker-count
keys were renamed.

```ts
// before (3.x)
export default defineConfig({
  test: {
    pool: 'vmThreads',
    maxThreads: 4,
    minWorkers: 1,
    singleThread: false,
    poolOptions: {
      threads: { isolate: true },
    },
    vmThreads: {
      memoryLimit: '512MB',
      useAtomics: true,
    },
  },
})

// after (4.x)
export default defineConfig({
  test: {
    pool: 'vmThreads',
    maxWorkers: 4,
    isolate: true,
    vmMemoryLimit: '512MB',
  },
})
```

Specific renames:

- `maxThreads` / `maxForks` -> `maxWorkers`
- `minWorkers` -> removed (Vitest sets this automatically to `0` outside
  `--watch` mode)
- `singleThread: true` -> `maxWorkers: 1` + `isolate: false`
- `singleFork: true` -> `maxWorkers: 1` + `isolate: false`
- `poolOptions.threads` -> top-level `test.isolate`
- `poolOptions.*` -> top-level equivalents
- `vmThreads.memoryLimit` -> `vmMemoryLimit` (top-level)
- `threads.useAtomics` -> removed

Environment variables:

- `VITEST_MAX_THREADS` -> `VITEST_MAX_WORKERS`
- `VITEST_MAX_FORKS` -> `VITEST_MAX_WORKERS`

**Gotcha:** when collapsing to a single worker with `isolate: false`, modules
are cached across test files. Add `vi.resetModules()` in a top-level `beforeAll`
for any test that mutates module state or relies on `vi.mock`.

### 4. `vite-node` -> `vite/module-runner`

The internal executor was swapped for Vite's own `module-runner`. The user-facing
impact is limited to config keys, env vars, and a few entry points:

| Before (3.x) | After (4.x) |
| --- | --- |
| `VITE_NODE_DEPS_MODULE_DIRECTORIES` env | `VITEST_MODULE_DIRECTORIES` |
| `__vitest_executor` global | `moduleRunner` (Vite-provided) |
| `vitest/execute` entry | removed |
| `transformMode` config | `viteEnvironment` |
| `deps.optimizer.web` | `deps.optimizer.client` |

```ts
// before
export default defineConfig({
  test: {
    deps: {
      optimizer: {
        web: { enabled: true },
      },
    },
  },
})

// after
export default defineConfig({
  test: {
    deps: {
      optimizer: {
        client: { enabled: true },
      },
    },
  },
})
```

### 5. Mocking engine rewrite

The mocking engine was rewritten to fix long-standing issues with `new`, restore
semantics, and auto-mock state sharing. Several patterns that worked in 3.x are
now errors or silent footguns:

- Mocks called with `new` now construct an instance. **Arrow functions used as
  constructors will throw** - use `function` / `class` instead.
- `vi.fn().getMockName()` returns `'vi.fn()'` by default.
- `vi.restoreAllMocks` now only restores spies created by `vi.spyOn`.
- Calling `vi.spyOn` on a mock returns the same mock instance.
- `mock.settledResults` populates immediately with `'incomplete'` markers.
- Auto-mocked instance methods share state with their prototype - calling
  `obj.method()` across tests accumulates call history.
- Auto-mocked methods can no longer be restored.
- Auto-mocked getters return `undefined`.
- `mock.invocationCallOrder` starts at `1`.

```ts
// 3.x worked, 4.x throws
const Logger = vi.fn(() => ({ info: vi.fn() }))
const l = new Logger() // TypeError: Logger is not a constructor

// 4.x fix
const Logger = vi.fn(function () {
  this.info = vi.fn()
})
const l = new Logger() // OK
```

### 6. Coverage migration

Coverage moved to AST-based remapping. Several old options were removed and the
remaining options were normalised:

| Removed | Status in 4.x |
| --- | --- |
| `coverage.ignoreEmptyLines` | no longer needed (AST-based) |
| `coverage.experimentalAstAwareRemapping` | default, removed |
| `coverage.all` | define `coverage.include` explicitly |
| `coverage.extensions` | define `coverage.include` explicitly |
| V8 `ignoreClassMethods` | now supported on V8 provider |

```ts
// before
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      all: true,
      extensions: ['.ts', '.tsx'],
      ignoreEmptyLines: true,
      experimentalAstAwareRemapping: true,
    },
  },
})

// after
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
      ignoreClassMethods: ['render', 'componentDidMount'],
    },
  },
})
```

`autoUpdate` now supports percentage formatting in threshold comparisons.

### 7. Browser Mode package layout

The monolithic `@vitest/browser` package is gone. The provider is now a factory
from a separate package, and the experimental tag is removed.

```ts
// before
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'browser',
    browser: {
      provider: 'playwright',
    },
  },
})

// after
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      provider: playwright({ trace: 'on-first-retry' }),
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

`package.json` cleanup:

```diff
- "@vitest/browser": "...",
+ "@vitest/browser-playwright": "...",
```

Test-file imports:

```diff
- import { page } from '@vitest/browser/context'
- import { commands } from '@vitest/browser/utils'
+ import { page, commands } from 'vitest/browser'
```

Other rules:

- `environment: 'browser'` is now **forbidden**. Use the `browser` block.
- The `/// <reference types="@vitest/browser" />` triple-slash directive is no
  longer needed - remove it from `tsconfig.json`.
- Provider strings (`'playwright'`, `'webdriverio'`) are no longer accepted;
  pass the factory.
- `@vitest/browser/context` and `@vitest/browser/utils` imports still work in
  4.x but are deprecated; switch to `vitest/browser` before the next major.

### 8. `--standalone` behaviour

`vitest --standalone path/to/file.test.ts` now **runs matched files** when a CLI
filename filter is provided, instead of launching the watcher without running.
Adjust CI commands that relied on the old "watch but don't run" behavior.

### 9. Snapshot behaviour

- Custom-element shadow root contents are now included in snapshots by default.
  Set `printShadowRoot: false` to restore prior behavior:

```ts
export default defineConfig({
  test: {
    snapshotFormat: {
      printShadowRoot: false,
    },
  },
})
```

- On CI, obsolete snapshots (snapshots that no longer correspond to a test) now
  **fail the test run** instead of warning. Local `--update` runs still clean
  them up silently.

### 10. Test API - third-argument options removed

`test('name', fn, options)` no longer accepts a third argument. Move all options
into the second argument:

```ts
// before
test('flaky thing', () => { /* ... */ }, { retry: 2, timeout: 5000 })

// after
test('flaky thing', { retry: 2, timeout: 5000 }, () => { /* ... */ })
```

The numeric-last-argument shortcut (`test('name', fn, 5000)`) still works
because it is unambiguous.

### 11. Default exclude pattern simplified

Only `node_modules` and `.git` are excluded by default. `dist`, `cypress`,
`.idea`, `.cache`, `.output`, and `.temp` are no longer excluded. Configure
explicitly if any of these directories live inside the test root.

### 12. Removed exports

- `UserConfig` type removed -> use `ViteUserConfig`.
- `getSourceMap` helper removed.
- `ErrorWithDiff` removed -> use `TestError`.
- Node types no longer re-exported from `vitest` -> import from `vitest/node`.
- Deprecated coverage options removed -> use `vitest/node` exports.
- Deprecated internal helpers and environment exports removed.
- Deprecated typecheck and runner types removed.

### 13. Reporter lifecycle callbacks removed

Custom reporter code that subscribed to `onCollected`, `onSpecsCollected`,
`onPathsCollected`, `onTaskUpdate`, or `onFinished` will silently never be
called in 4.x. Replace these with the equivalent reporter API methods on the
reporter class itself.

### 14. `runner.mode` for empty test bodies

If `test()` or `describe()` is called with no function body, the test is now
marked as `todo` instead of being skipped or failing.

### 15. `--inspect` interaction

`trackUnhandledErrors` is automatically disabled when starting the test runner
with `--inspect`. Tests that rely on uncaught-exception assertions to fail will
pass under `--inspect` - do not use `--inspect` when debugging those.

### 16. Verbose reporter behavior

The `verbose` reporter now always prints tests one by one. The old behavior
(tree in single-file runs, flat in CI) is gone. Gate any local-only verbose
expectations on `!process.env.CI`.

### 17. CLI summary reporter behavior

The default reporter only prints the tree when a single file runs. Use the new
`'tree'` reporter for an always-on tree output:

```ts
export default defineConfig({
  test: {
    reporter: 'tree',
  },
})
```

---

## New features

### Browser Mode is stable

- `experimental` tag removed.
- Provider packages split: `@vitest/browser-playwright`, `@vitest/browser-webdriverio`,
  `@vitest/browser-preview`.
- Playwright Traces supported via `trace` config option or `--browser.trace`
  CLI flag.
- `page.frameLocator` API (Playwright).
- `length` property on every locator for `toHaveLength`.
- VS Code extension "Debug Test" button for browser tests.
- New `--inspect` flag for manual DevTools connection.
- `--inspect` flag for webdriverio.
- Custom screenshot comparison algorithms.

### Visual Regression Testing

```ts
test('header', async ({ page }) => {
  await page.goto('/')
  const header = page.getByRole('banner')
  await expect(header).toMatchScreenshot()
})
```

### `toBeInViewport` matcher

Backed by `IntersectionObserver`. Pair with a navigation precondition to avoid
indefinite waits:

```ts
await page.goto('/long-page')
await expect(page.getByTestId('footer')).resolves.toBeInViewport()
```

### `expect.schemaMatching`

Validates against any Standard Schema v1 implementation (Zod, Valibot, ArkType).
Composable with `expect.objectContaining` and other asymmetric matchers:

```ts
import * as s from 'zod'
import { expect, test } from 'vitest'

const User = s.object({ id: s.string(), email: s.string().email() })

test('createUser returns a valid user', () => {
  expect(createUser({ email: 'a@b.co' })).toMatchSchema(User)
})
```

### `expect.assert` for type narrowing

Use when `expect.to*` cannot be applied - for example inside generic factory
functions:

```ts
function ensureDefined<T>(value: T): asserts value is NonNullable<T> {
  expect.assert(value !== null && value !== undefined)
}
```

### `toBeNullable` matcher

```ts
expect(maybeUser).toBeNullable()
expect(user).not.toBeNullable()
```

### Type-aware hooks (`test.extend`)

Lifecycle hooks (`beforeEach`, `afterEach`) referenced on the object returned by
`test.extend` are now type-aware - the extended context flows through:

```ts
import { test } from 'vitest'

const api = test.extend<{ db: Db }>({
  db: async ({}, use) => {
    const conn = await openDb()
    await use(conn)
    await conn.close()
  },
})

api.beforeEach(async ({ db }) => {
  // db is typed as Db - no generics needed
  await db.migrate()
})
```

### `expect.extend` custom messages

Custom expect messages are now passed through the asymmetric matcher system:

```ts
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling
    return {
      pass,
      message: () => `${received} should be within [${floor}, ${ceiling}]`,
    }
  },
})
```

### `vi.mockObject` spy option

```ts
vi.mockObject(obj, { spy: true })
```

A new `automocker` entry is also exposed on the mocker for low-level control.

### New `onConsoleLog` / `onUnhandledError` callbacks

```ts
export default defineConfig({
  test: {
    onConsoleLog(log, entity) {
      if (log.level === 'error') {
        console.warn(`Console error from ${entity.name}: ${log.content}`)
      }
    },
    onUnhandledError(err) {
      // report to observability backend
      report(err)
    },
  },
})
```

### Dashboard / tooling improvements

- Clickable dashboard numbers.
- Test `path` display when filtering.
- `displayAnnotations` option added to `github-actions` reporter.
- Dump transformed content helper for debugging transformer issues.
- New programmatic API: `experimental_parseSpecifications`, `Vitest` watcher,
  `enableCoverage` / `disableCoverage`, `getGlobalTestNamePattern`,
  `relativeModuleId` on `TestModule`, `getSeed`, `waitForTestRunEnd`.

### Misc

- Qwik support in `vitest init`.
- `tree` reporter for always-on tree output.
- `default` reporter accepts `{ summary: false }` option.

---

## Deprecations

- Importing context from `@vitest/browser/context` still works but is
  deprecated - use `vitest/browser`.
- Importing utilities from `@vitest/browser/utils` still works but is
  deprecated - use `vitest/browser`.
- Passing a string to `browser.provider` still works but is deprecated - pass
  a factory from a provider package.

No other explicit deprecations. Most removals were outright; the migration window
is short.

---

## Migration tips

1. **Upgrade platform first.** Bump Vite to >= 6.0.0 and Node to >= 20.0.0.
   Verify the app still builds and runs before touching Vitest.

2. **Rewrite `vitest.config.ts` before any test file changes.** Search for the
   old keys (`maxThreads`, `maxForks`, `singleThread`, `singleFork`,
   `vmThreads`, `vmForks`, `poolOptions`, `minWorkers`, `workspace`,
   `environmentMatchGlobs`, `poolMatchGlobs`, `basic`, `transformMode`,
   `deps.optimizer.web`, `deps.external`, `deps.inline`, `deps.fallbackCJS`,
   `coverage.all`, `coverage.extensions`, `coverage.ignoreEmptyLines`,
   `coverage.experimentalAstAwareRemapping`). None will warn at startup.

3. **Fold workspace into projects.** Move `vitest.workspace.ts` (or the
   `workspace` array) into `test.projects` in `vitest.config.ts`. Only files
   named with `vitest.config` or `vite.config` are accepted as project entries.

4. **Adopt Browser Mode if it is on the roadmap.** The package layout changed;
   doing the import migration up-front saves a second pass later.

5. **Audit auto-mocked methods.** Any class with auto-mocked instance methods
   that asserts on call history across tests will leak state. Add
   `vi.resetAllMocks()` in `afterEach` or migrate to explicit `vi.spyOn` with
   `.mockClear()`.

6. **Audit constructor mocks.** Any `vi.fn(() => ...)` used with `new` will
   throw. Replace the arrow function with a regular `function` or `class`.

7. **Re-run snapshots deliberately.** With `printShadowRoot: true` (the new
   default), every test that renders custom elements will need its snapshot
   regenerated. Either accept the new default or set `printShadowRoot: false`.

8. **Gate verbose expectations on `!process.env.CI`.** The `verbose` reporter
   is now always flat; if any tooling assumes the tree output, gate it.

9. **Move test options to the second argument.** Run a `grep -E "test\\(.*,.*,.*\\)"` style
   search for the third-argument pattern.

10. **Do not run with `--inspect` for uncaught-exception tests.** The
    automatic `trackUnhandledErrors: false` will mask failures.

---

## Source

- Vitest 4.0.0 release notes:
  https://github.com/vitest-dev/vitest/releases/tag/v4.0.0
