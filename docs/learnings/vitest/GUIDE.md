# Vitest Guide

> Senior-level reference for upgrading from Vitest 3.2.4 to 4.1.9.
> All information is sourced from the official Vitest 4.0.0 release notes:
> https://github.com/vitest-dev/vitest/releases/tag/v4.0.0

## 1. Overview

Vitest is Vite-native test framework built around the same dev pipeline that powers
your application. It co-locates tests with code, transpiles through Vite, and ships
ESM-first. The 4.x line is a substantial internal rewrite of two of the more
fragile subsystems - the worker pool and the mocking engine - while also graduating
Browser Mode out of experimental.

### Version context for this codebase

The current workspace runs on:

| Tool | Version |
| --- | --- |
| Vitest | 3.2.4 (current) -> 4.1.9 (target) |
| Vite | 7.3.1 (already satisfies the >= 6.0.0 requirement) |
| Node.js | LTS line (>= 20.0.0 required by Vitest 4) |

Vitest 4.0.0 dropped support for Vite 5. Because this repo is already on Vite 7.3.1,
the Vite version is not a blocker, but it confirms the upgrade is feasible without
touching the bundler. Node 20+ is a hard requirement.

### Headline engineering changes

1. **module-runner replaces vite-node.** The same ESM loader that powers Vite 8 is
   now the test executor. Config keys, env vars, and entry points changed names.
2. **Pools rewritten without tinypool.** The `threads` / `vmThreads` / `forks` / `vmForks`
   distinction collapsed into a single `pool` knob with new worker-limit keys.
3. **Mocking engine rewritten.** `vi.spyOn`, auto-mocking, and `restoreAllMocks` all
   have new semantics. Several previously valid patterns (arrow functions as
   constructors, restoring auto-mocked methods) are now errors or silent footguns.
4. **Browser Mode is stable.** The provider is now a factory from a separate package;
   the monolithic `@vitest/browser` package is gone.

The rest of this guide walks through what to use, what to remove, and where the
trapdoors are.

---

## 2. Key new features since 3.2.4

### 2.1 Browser Mode is stable

The `experimental` tag is gone. Browser Mode still runs real browser engines, but the
package layout changed:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

Notes:

- `provider` is now a **factory**; passing the string `'playwright'` is no longer
  accepted.
- The provider packages (`@vitest/browser-playwright`, `@vitest/browser-webdriverio`,
  `@vitest/browser-preview`) replace the old monolithic `@vitest/browser`. You can
  remove `@vitest/browser` from your devDependencies.
- Imports from `@vitest/browser/context` and `@vitest/browser/utils` collapse into
  `vitest/browser`.
- `environment: 'browser'` is **forbidden**; Browser Mode is configured via the
  `browser` block, not the environment key.

### 2.2 Visual Regression Testing

In Browser Mode, the new `toMatchScreenshot` assertion compares a DOM region against a
stored baseline image. Custom comparison algorithms can be plugged in, but the
defaults (pixel-diff with threshold) are sufficient for most layout regressions.

```ts
import { expect, test } from 'vitest'

test('header renders correctly', async ({ page }) => {
  await page.goto('/')
  const header = page.getByRole('banner')
  await expect(header).toMatchScreenshot()
})
```

This sits alongside, not on top of, DOM matchers. Use `toMatchScreenshot` only when
the rendered pixels are the contract; use `toHaveText` / `toHaveRole` when the
semantic structure is the contract.

### 2.3 `toBeInViewport`

A new matcher backed by `IntersectionObserver`:

```ts
await expect(page.getByTestId('sidebar')).resolves.toBeInViewport()
```

Trade-off: it requires the element to actually intersect in the rendered page state.
If you fire the assertion before the element has been scrolled into view, the test
will hang waiting for the observer to fire. Always pair with a navigation /
visibility precondition.

### 2.4 `expect.schemaMatching`

Validates a value against any Standard Schema v1 implementation (Zod, Valibot,
ArkType). This is the cleanest way to assert that a side effect produced a value
that conforms to a domain shape without manually writing out a `.parse()` and an
`.toStrictEqual` round-trip:

```ts
import * as s from 'zod'
import { expect, test } from 'vitest'

const User = s.object({
  id: s.string(),
  email: s.string().email(),
})

test('createUser returns a valid user', () => {
  const result = createUser({ email: 'a@b.co' })
  expect(result).toMatchSchema(User)
})
```

It is also exposed as an asymmetric matcher, so it composes with `expect.objectContaining`,
`expect.any`, and friends.

### 2.5 Type-aware hooks (`test.extend`)

When you extend the test context with `test.extend`, the lifecycle hooks
(`beforeEach`, `afterEach`) referenced on the returned object now flow types through
correctly. This was an ergonomic wart in 3.x where the hooks on an extended test
context were typed as `(fn: () => any) => void`, forcing redundant generics.

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
  await db.migrate() // db is typed as Db
})
```

### 2.6 Playwright Traces

Browser Mode can record Playwright traces for every test run:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    browser: {
      provider: playwright({ trace: 'on-first-retry' }),
    },
  },
})
```

Or via the CLI: `vitest --browser.trace`. Traces are invaluable when a Browser Mode
test fails in CI and you need to step through what the page actually did.

### 2.7 Other additions worth knowing

- `expect.assert` - type-narrowing helper when `expect.to*` cannot be used (e.g.
  narrowing inside a generic factory).
- `toBeNullable` matcher.
- `vi.mockObject` accepts a `spy: true` option; a new `automocker` entry is exposed
  on the mocker for low-level control.
- `onConsoleLog` callback now receives the entity that emitted the log; a new
  `onUnhandledError` callback fires for uncaught exceptions.
- `enableCoverage` / `disableCoverage` programmatic API.
- `experimental_parseSpecifications` - parse CLI filters without running.
- `getSeed`, `waitForTestRunEnd`, `relativeModuleId` on `TestModule` for tooling.
- Qwik support in `vitest init`.

---

## 3. Migration path from 3.2.4 to 4.1.9

Vitest 4 ships a number of rewrites that touch almost every test file in a typical
codebase. The migration is best done in layers: configuration first, then runner
plumbing (pool + module-runner), then mocking semantics, then per-file cleanup.

### 3.1 Configuration entry points

The deprecated `workspace` option is gone. If you previously split tests across
multiple `vite.config.ts` files via `workspace`, fold them into a `projects` array
in the root `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      './apps/web',
      './apps/desktop',
      './packages/api',
    ],
  },
})
```

Project entries must be files whose names contain `vitest.config` or `vite.config`.
A plain `tsconfig.json` reference or a directory containing a `package.json` only
will be rejected.

### 3.2 `workspace` -> `projects` (and `environmentMatchGlobs` / `poolMatchGlobs`)

The `workspace` top-level key is replaced by the `projects` array under `test`. The
`environmentMatchGlobs` and `poolMatchGlobs` overrides are also gone; per-project
overrides go inside the project entry:

```ts
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.{test,spec}.ts'],
        },
      },
      {
        test: {
          name: 'desktop',
          environment: 'node',
          include: ['apps/desktop/**/*.{test,spec}.ts'],
        },
      },
    ],
  },
})
```

### 3.3 Pool rewrite - the big one

Vitest 4 no longer uses tinypool. The `threads` / `vmThreads` / `forks` / `vmForks`
distinction was collapsed into a single `pool` key (`threads`, `forks`, `vmThreads`,
`vmForks`), but the worker-count keys were renamed:

| Old (3.x) | New (4.x) |
| --- | --- |
| `maxThreads` | `maxWorkers` |
| `maxForks` | `maxWorkers` |
| `singleThread: true` | `maxWorkers: 1` + `isolate: false` |
| `singleFork: true` | `maxWorkers: 1` + `isolate: false` |
| `minWorkers` | (removed; auto-set to 0 outside `--watch`) |
| `poolOptions` | top-level only |
| `vmThreads.memoryLimit` | `vmMemoryLimit` (top-level) |
| `threads.useAtomics` | (removed) |

Example - before:

```ts
export default defineConfig({
  test: {
    maxThreads: 4,
    singleThread: false,
    vmThreads: { memoryLimit: '512MB' },
  },
})
```

After:

```ts
export default defineConfig({
  test: {
    maxWorkers: 4,
    isolate: true,
    vmMemoryLimit: '512MB',
  },
})
```

When collapsing to a single-worker (`maxWorkers: 1 + isolate: false`), module state
leaks between test files. If a test relies on a clean module graph (most
auto-mocking or `vi.mock` patterns do), call `vi.resetModules()` in a top-level
`beforeAll`.

The matching environment variables also changed:

- `VITEST_MAX_THREADS` -> `VITEST_MAX_WORKERS`
- `VITEST_MAX_FORKS` -> `VITEST_MAX_WORKERS`

### 3.4 `vite-node` -> `module-runner`

The internal executor was swapped for `vite/module-runner`. This is mostly a
build-tooling change, but a few names leak into user-facing config and env vars:

| Old | New |
| --- | --- |
| `VITE_NODE_DEPS_MODULE_DIRECTORIES` env var | `VITEST_MODULE_DIRECTORIES` |
| `__vitest_executor` global | `moduleRunner` (via Vite) |
| `vitest/execute` entry point | removed |
| `transformMode` config | `viteEnvironment` |

```ts
// 3.x
export default defineConfig({
  test: {
    deps: {
      optimizer: {
        web: { enabled: true },
      },
    },
  },
})

// 4.x
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

`deps.external` / `deps.inline` / `deps.fallbackCJS` all moved under
`server.deps.*` to align with Vite's own naming.

### 3.5 Browser Mode - the migration we will feel the most

This template's `apps/web` runs through TanStack Start with Vite. If we adopt
Browser Mode, the configuration changes substantially:

```ts
// before (3.x with monolithic package)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'browser',
    browser: {
      provider: 'playwright',
    },
  },
})

// after (4.x)
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

And in `package.json`:

```diff
- "@vitest/browser": "...",
+ "@vitest/browser-playwright": "...",
```

Context imports in test files:

```diff
- import { page } from '@vitest/browser/context'
+ import { page } from 'vitest/browser'
```

The `/// <reference types="@vitest/browser" />` triple-slash directive in
`tsconfig.json` is no longer needed and should be removed.

### 3.6 Coverage migration

Coverage moved to AST-based remapping; several old options were removed:

| Removed | Replacement |
| --- | --- |
| `coverage.ignoreEmptyLines` | (no longer needed; AST-based) |
| `coverage.experimentalAstAwareRemapping` | now default, removed |
| `coverage.all` | define `coverage.include` explicitly |
| `coverage.extensions` | define `coverage.include` explicitly |
| V8 `ignoreClassMethods` unsupported | now supported on V8 provider |

```ts
// after
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      ignoreClassMethods: ['render'],
    },
  },
})
```

### 3.7 Test API - third-argument options

`test('name', fn, { retry: 2 })` no longer accepts a third argument. Move all options
into the second argument:

```ts
// before
test('flaky thing', () => { /* ... */ }, { retry: 2, timeout: 5000 })

// after
test('flaky thing', { retry: 2, timeout: 5000 }, () => { /* ... */ })
```

The numeric-last-argument shortcut (`test('name', fn, 5000)`) still works because it
is unambiguous.

### 3.8 Reporter changes

- `'basic'` reporter is gone. Use `['default', { summary: false }]` for the closest
  equivalent, or `'tree'` for a tree output that always shows structure (the old
  default only printed the tree for single-file runs).
- The `verbose` reporter now always prints tests one by one. Gate local-only
  behavior on `!process.env.CI` if you relied on the old "verbose in watch, flat in
  CI" behaviour.
- `onCollected`, `onSpecsCollected`, `onPathsCollected`, `onTaskUpdate`, and
  `onFinished` reporter callbacks were removed from the public surface.

### 3.9 Snapshot behaviour

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

- On CI, obsolete snapshots cause the test to fail (previously they were reported
  as a warning). This is good - it forces the snapshot to be regenerated
  deliberately.

### 3.10 Removed entry-point items

- `UserConfig` -> `ViteUserConfig`.
- `getSourceMap` helper -> removed.
- `ErrorWithDiff` -> `TestError`.
- Node types are no longer re-exported from `vitest`; import from `vitest/node`
  instead. This matters if any test files import `vitest` purely for a Node type.
- Several deprecated internal helpers and environment exports were removed; if
  your `tsc --noEmit` was previously failing only on those, it should now pass
  without the noise.

---

## 4. Common pitfalls and gotchas

These are the issues that will silently break a test suite during the upgrade if
they are not handled up-front.

### 4.1 Arrow functions as constructors in mocks

The new mocking engine treats `new` correctly: calling a mock with `new` actually
constructs an instance and returns it. This requires the mock to be backed by a
function or class - **arrow functions do not have a `[[Construct]]` slot**.

```ts
// This worked in 3.x by accident; in 4.x it throws.
const Logger = vi.fn(() => ({ info: () => {} }))
const l = new Logger() // TypeError: Logger is not a constructor
```

Fix:

```ts
const Logger = vi.fn(function () {
  return { info: () => {} }
})
const l = new Logger() // OK
```

Or, if you genuinely don't need `new`, drop it from your test code.

### 4.2 Auto-mocked method state

Auto-mocked instance methods share state with their prototype in 4.x. If two tests
both call `obj.method()` where `obj` is a class instance and `method` is auto-mocked,
the second test sees the call history of the first.

This is by design (it matches how spies behave on prototypes), but it breaks any
test that relied on each instance having isolated mock state. Use explicit
`vi.spyOn(instance, 'method').mockClear()` between tests, or reach for
`vi.resetAllMocks()` in `afterEach`.

You can no longer restore auto-mocked methods. Once Vitest has replaced a method
on a prototype, that replacement persists for the lifetime of the test file.
Attempting `vi.restoreAllMocks()` on an auto-mocked method is a no-op.

### 4.3 `vi.fn().getMockName()` default

The default name is now `'vi.fn()'` instead of `'vi.fn %n'` or similar. Any test
that asserted on the mock name (for example in a snapshot) needs to be updated or
the name must be set explicitly:

```ts
const handler = vi.fn().named('onMessage')
expect(handler.getMockName()).toBe('onMessage')
```

### 4.4 `vi.restoreAllMocks` scope

`vi.restoreAllMocks` now only restores spies created by `vi.spyOn`. Mocks created
by `vi.fn` or `vi.mock` are unaffected. If your `afterEach` relied on a single
`vi.restoreAllMocks()` to reset everything, add explicit `vi.resetAllMocks()` or
`vi.unmock(...)` calls.

Calling `vi.spyOn(obj, 'method')` on a mock now returns the **same mock**; the old
behavior of creating a new spy each call is gone. This is mostly a non-issue, but
it matters if you depended on the returned value being a fresh spy for assertion.

### 4.5 `mock.invocationCallOrder` is 1-indexed

`mock.invocationCallOrder` now starts at `1` for the first invocation. Any test
that compared call orders against literal `0` will silently match the wrong call.

### 4.6 `mock.settledResults` semantics

`mock.settledResults` populates immediately with `'incomplete'` markers. Tests that
inspected `settledResults` synchronously to assert on resolution timing will need
to use `waitFor` or `vi.waitFor` instead.

### 4.7 Pool config renames - the easy mistake

A configuration like this compiles and runs in 3.x but is silently ignored in 4.x:

```ts
export default defineConfig({
  test: {
    // 3.x keys - all ignored in 4.x
    maxThreads: 4,
    singleThread: false,
    vmThreads: { memoryLimit: '512MB' },
  },
})
```

Vitest will start with a default of `maxWorkers = os.cpus().length - 1` and no VM
memory cap. CPU-bound test suites that were tuned for 4 threads will suddenly
fight for cores and slow down. There is no startup warning for the old keys.

Mitigation: search the repo for `maxThreads`, `maxForks`, `singleThread`,
`singleFork`, `vmThreads`, `vmForks`, and `poolOptions` before upgrading and
rewrite each occurrence.

### 4.8 Default exclude pattern

Vitest 4 only excludes `node_modules` and `.git` by default. `dist`, `cypress`,
`.idea`, `.cache`, `.output`, and `.temp` are no longer excluded automatically.
This is rarely a problem in CI but causes IDE test runners (and Vitest's own
watcher) to recurse into build output, slowing down file resolution.

Add an explicit exclude if any of those directories live inside the test root:

```ts
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.idea/**',
      '**/.cache/**',
      '**/.output/**',
      '**/.temp/**',
      '**/cypress/**',
    ],
  },
})
```

### 4.9 `trackUnhandledErrors` and `--inspect`

Vitest automatically disables `trackUnhandledErrors` when the test runner is started
with `--inspect`. If you have tests that depend on uncaught-exception assertions to
fail, do not run them with `--inspect` during debugging - you will get false
positives.

### 4.10 Reporter lifecycle callbacks removed

Custom reporter code that subscribed to `onCollected`, `onSpecsCollected`,
`onPathsCollected`, `onTaskUpdate`, or `onFinished` will silently never be called
in 4.x. Replace these with the equivalent reporter API methods on the reporter
class itself.

### 4.11 Default `runner.mode` for empty test bodies

If `test()` or `describe()` is called with no function body, the test is now
marked as a `todo` test rather than being skipped or failing. This is a quiet
behavior change: a forgotten test body becomes a `todo` instead of a failure,
which can mask accidental omissions.

### 4.12 Snapshot CI failure on obsolete snapshots

In CI, obsolete snapshots (snapshots that no longer correspond to a test) now
fail the run. Local `--update` runs still clean them up silently. Make sure CI
does not run with `--update` if you want the failing behavior to catch drift.

---

## 5. References

- Vitest 4.0.0 release notes:
  https://github.com/vitest-dev/vitest/releases/tag/v4.0.0
- Companion CHANGELOG for 4.0.0 in this repository:
  `docs/learnings/vitest/changelogs/4.0.0/CHANGELOG.md`

When bumping beyond 4.0.0 (the workspace is currently targeting 4.1.9), review the
patch and minor release notes between 4.0.0 and the target version for any
follow-up deprecations. None of the changes listed above were reversed in 4.1.x,
but the reporter and Browser APIs have continued to evolve.
