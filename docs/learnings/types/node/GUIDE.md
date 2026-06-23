# @types/node — Comprehensive Usage Guide

> Senior-level documentation for upgrading `@types/node` from `22.19.19` to `26.0.0`.

This guide covers the TypeScript type-level changes across four major versions
of `@types/node` published on DefinitelyTyped. It is targeted at maintainers
and senior engineers who need to plan an upgrade path, evaluate TypeScript
toolchain compatibility, and understand the trade-offs involved in adopting
newer Node.js typings before the underlying Node.js runtime stabilizes in
their environment.

---

## 1. Overview

`@types/node` is the canonical TypeScript type definition package for the
Node.js standard library, maintained on DefinitelyTyped. Each `@types/node`
major version is published shortly after a Node.js major release and mirrors
the API surface of the corresponding Node.js runtime, including newly stable
APIs, deprecations, and EOL removals.

### Current version context

| Field | Value |
|-------|-------|
| `from` version | `22.19.19` |
| `to` version | `26.0.0` |
| Versions covered | `23.0.0`, `24.0.0`, `25.0.0`, `26.0.0` |
| Earliest covered release | 2025-01-08 (v23.0.0) |
| Latest covered release | 2026-05-05 (v26.0.0) |
| Hard TypeScript requirement (v26) | `>= 5.6` |

### Node.js runtime alignment

Each `@types/node` major version is **loosely coupled** to a Node.js major:

| `@types/node` | Aligned Node.js | Notes |
|---------------|-----------------|-------|
| `23.x` | Node.js 23.x | Early-stage types for APIs that graduate to global in Node 24 |
| `24.x` | Node.js 24.x | URLPattern is global; AsyncLocalStorage gains `defaultValue` / `name` |
| `25.x` | Node.js 25.x | Web Storage and ErrorEvent exposed; corepack removed from dist |
| `26.x` | Node.js 26.x | Temporal API enabled by default; NODE_MODULE_VERSION = 147 |

Because `@types/node` is consumed at type-check time only, you may install a
newer major than your runtime Node.js. The trade-off is that the type
surface may reference runtime APIs you do not yet have — TypeScript will
not warn about missing runtime behavior, so rely on the runtime major, not
the typings major, when calling new APIs.

---

## 2. Key new features since `22.19.19`

Below are the top type-level additions that materially affect how senior
projects model Node.js APIs. Examples show the **type surface** (not
runtime behavior).

### 2.1 `AsyncLocalStorage` options (`v24`)

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
  userId?: string;
}

const als = new AsyncLocalStorage<RequestContext>({
  defaultValue: { requestId: 'unknown' },
  name: 'request-context',
});

// All async work below sees the same context
als.run({ requestId: 'abc-123', userId: 'u_42' }, async () => {
  await someAsyncWork();
  console.log(als.getStore()?.userId); // 'u_42'
});
```

The `name` option is useful for debugging in async stack traces; the
`defaultValue` option avoids `undefined` checks for cases where you want a
sentinel instead of `getStore() ?? FALLBACK`.

### 2.2 `sqlite` online backup and aggregate functions (`v23` / `v24`)

```ts
import { DatabaseSync, StatementSync } from 'node:sqlite';

// v23: StatementSync.prototype.columns()
const stmt = db.prepare('SELECT id, name FROM users');
const cols = stmt.columns(); // { name: string; column: string | null; table: string | null; database: string | null; type: string | null; }[]

// v23: backup API typed
const backup = db.backup('snapshot.db');

// v24: aggregate functions + transaction getter + timeout
const db2 = new DatabaseSync(':memory:', { timeout: 5_000 });
const tx = db2.transaction(() => { /* ... */ });
```

### 2.3 `http2` raw headers and settings (`v24`)

```ts
import { createSecureServer } from 'node:http2';

const server = createSecureServer(
  {
    cert,
    key,
    maxSessionRejectedStreams: 100,
    maxSessionInvalidFrames: 100,
  },
  (req) => {
    // v24: :protocol pseudo-header typed in IncomingHttpHeaders
    const proto = req.headers[':protocol']; // string | string[] | undefined
  },
);
```

### 2.4 `test_runner` expansion (`v24`)

```ts
import { test, run } from 'node:test';

run({
  cwd: '/path/to/project', // v23+
  concurrency: 4,
})
  .compose?.on('test:summary', (event) => { // v24+
    console.log(event);
  });
```

### 2.5 `process.features.typescript` and `traceProcessWarnings` (`v24`)

```ts
if (process.features.typescript) {
  // Node has built-in TypeScript stripping
}

process.traceProcessWarnings = true; // v24: now strictly typed readonly
```

### 2.6 `URLPattern` global (`v24`)

```ts
// After v24, with lib: ["ES2022", "DOM"] you can use URLPattern directly
const pattern = new URLPattern({ pathname: '/users/:id' });
console.log(pattern.exec('https://example.com/users/42')?.pathname.groups.id);
```

### 2.7 `v8` GC profiler for ERM (`v24`)

```ts
import { GCProfiler } from 'node:v8';

const profiler = new GCProfiler();
profiler.start();
setTimeout(() => {
  const stats = profiler.stop();
  console.log(stats);
}, 60_000);
```

### 2.8 `worker.getHeapStatistics()` (`v24`)

```ts
import { Worker } from 'node:worker_threads';

const w = new Worker('./worker.js');
w.on('online', () => {
  // v24+
  // Note: invoked via message roundtrip; the typed helper exposes the same
  // shape as the main-thread v8.getHeapStatistics().
});
```

### 2.9 `tls.Secure` event and `requestOCSP` (`v24`)

```ts
import { connect } from 'node:tls';

const sock = connect({
  host: 'example.com',
  port: 443,
  requestOCSP: true, // v24+
});

sock.on('secure', () => {
  // v24+: 'secure' event typed
});
```

### 2.10 Web Storage + ErrorEvent globals (`v25`)

```ts
// In Node 25+, localStorage and sessionStorage are typed as globals
// (mirroring browser lib.dom defaults).
localStorage.setItem('lastView', '/dashboard');

// ErrorEvent is also exposed
window.addEventListener('error', (ev: ErrorEvent) => {
  console.error(ev.message, ev.error);
});
```

### 2.11 `v8` CPU profile support (`v25`)

```ts
import { startCpuProfile, stopCpuProfile } from 'node:v8';

const profile = startCpuProfile('session-1');
// ... do work ...
const serialized = stopCpuProfile(profile);
```

### 2.12 `mock.module()` with URL (`v25`)

```ts
import { mock } from 'node:test';

await mock.module(new URL('./fixtures/db.js', import.meta.url), {
  defaultExport: { query: () => [] },
});
```

### 2.13 `Temporal` API (`v26`)

```ts
// v26: Temporal types are exposed via the bundled typings.
// Opt in via `lib` in tsconfig or rely on the global types.
const now = Temporal.Now.instant();
const zoned = now.toZonedDateTimeISO('America/New_York');
```

### 2.14 V8 14.6 typed proposals (`v26`)

```ts
const m = new Map<string, number>();
// Map.prototype.getOrInsert / getOrInsertComputed typed
const v = m.getOrInsert('key', 0);
const v2 = m.getOrInsertComputed('key', (k) => k.length);
```

### 2.15 Stricter `crypto` typing (`v26`)

```ts
import { createHash } from 'node:crypto';

// v26: Buffer input typing is stricter — accepts string | ArrayBufferLike | ArrayBufferView
const hash = createHash('sha256');
hash.update('payload'); // OK
hash.update(new Uint8Array([1, 2, 3])); // OK
// hash.update({} as any); // would be flagged under strict settings
```

---

## 3. Migration path: `22.19.19` → `26.0.0`

### Step 1 — Audit your TypeScript toolchain

The most load-bearing change in this upgrade is the **TypeScript version
floor**:

| `@types/node` | Minimum TS | Recommended TS |
|---------------|------------|----------------|
| `23.x` | `5.2+` (for ERM types), `5.8+` (for Float16Array) | `5.6+` |
| `24.x` | `5.x` | `5.6+` |
| `25.x` | `5.5+` (recommended) | `5.6+` |
| `26.x` | `5.6+` (required) | `5.7+` |

Run `pnpm dlx typescript@latest -v` and confirm `>= 5.6` before installing
`@types/node@26`. If you are on `5.5`, plan a TypeScript upgrade first.

### Step 2 — Bump `@types/node` in lockstep

```jsonc
// package.json
{
  "devDependencies": {
    "@types/node": "26.0.0"
  }
}
```

Then `pnpm install`. Resolve peer-dep warnings if any — they signal a
TypeScript version mismatch.

### Step 3 — Type-check and triage errors

```bash
pnpm tsc --noEmit
```

Most errors will fall into these buckets:

1. **Removed APIs** (e.g. `server.writeHeader(...)`, `_stream_*` imports).
2. **Stricter crypto typing** (cast `Buffer` to the canonical union or
   change argument types).
3. **`util.is*` calls** (already removed in v23 — see §4).
4. **`fs.Dirent#path`** (removed in v24 — use `parentPath` or join manually).
5. **`url.parse()` deprecation** (still callable but `@types/node` adds a
   JSDoc warning from v24 onward).

### Step 4 — Migrate from removed/renamed APIs

For each breaking change:

```ts
// http.Server.prototype.writeHeader → writeHead
// Before (22.x):
res.writeHeader(200);
res.end('ok');

// After (26.0.0):
res.writeHead(200);
res.end('ok');
```

```ts
// _stream_* imports are gone
// Before:
import { Writable } from 'node:_stream_writable';

// After:
import { Writable } from 'node:stream';
```

```ts
// domain.Domain#members re-typed
// Before (22.x):
domain.add(timer as unknown as EventEmitter); // worked, but loose typing
// After (24.0.0):
domain.add(emitter); // NodeJS.Timer no longer accepted
```

### Step 5 — Optional: enable new globals explicitly

Some additions (URLPattern, Web Storage, ErrorEvent, Temporal) are only
visible if your `tsconfig.json` includes the right `lib` entries or if
your runtime Node.js major matches the typings major.

```jsonc
// tsconfig.json — recommended
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"], // DOM for URLPattern, Web Storage, ErrorEvent
    "types": ["node"]         // pulls in @types/node
  }
}
```

For Temporal specifically, the typings are exposed unconditionally in v26,
but you may still want a `lib` entry that matches your runtime to silence
cross-major noise.

### Step 6 — Update CI and build matrices

- Document Node.js minimum (now `>= 24` for many features) and TypeScript
  minimum (`>= 5.6`).
- Pin `@types/node` to an exact version to avoid surprise drift from
  DefinitelyTyped nightly.
- Audit `engines.node` in `package.json`.

---

## 4. Common pitfalls and gotchas

### 4.1 TypeScript version compatibility

The single biggest source of upgrade friction. v26 requires TypeScript
`>= 5.6`. If you stay on TS 5.5, the package will install but Iterator
helper compatibility definitions will be missing — you'll see errors like
`Type 'Iterator<T>' is not assignable to type 'Iterable<T>'`.

**Fix**: bump TypeScript first, then `@types/node`. Do not bump in the
opposite order.

### 4.2 Removed `util.is*` methods

In v23 the following typings were removed:

- `util.isBoolean`
- `util.isBuffer`
- `util.isDate`
- `util.isError`
- `util.isFunction`
- `util.isNull`
- `util.isNullOrUndefined`
- `util.isNumber`
- `util.isString`
- `util.isSymbol`
- `util.isUndefined`
- `util.isRegExp`
- `util.isObject`
- `util.isPrimitive`
- `util.log`

These had already been removed from Node.js core years earlier, but the
type stubs lingered. If your codebase imported them only for types (no
runtime call), you will see `TS2305: Module '"node:util"' has no exported
member 'isBoolean'` immediately after bumping.

**Fix**: replace with explicit checks:

```ts
// Before
if (util.isBuffer(x)) { /* ... */ }

// After
if (Buffer.isBuffer(x)) { /* ... */ }
// or
if (x instanceof Buffer) { /* ... */ }
```

### 4.3 `domain.Domain.members` is now `EventEmitter[]`

In v24 the type was narrowed from `Array<EventEmitter | NodeJS.Timer>` to
`EventEmitter[]`. If you iterated members and called timer-only methods
on them, the compiler will catch it. Runtime behavior was always
event-emitter-only; this is purely a tightening.

### 4.4 `fs.Dirent#path` removed

Replaced by `Dirent#parentPath`. If you used `dirent.path` directly:

```ts
// Before
fs.readdirSync(dir).forEach((d) => console.log(d.path));

// After
fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
  console.log(d.parentPath);
});
```

### 4.5 Stricter `crypto` typing (v26)

Many `Buffer` parameters in `crypto` are now typed against the canonical
`BinaryLike` / `BufferEncoding` unions. If you wrap them in a custom type,
the compiler will reject the call.

```ts
// Before — loose Buffer accepted
function hash(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

// After — match the canonical union
function hash(input: string | ArrayBufferLike | ArrayBufferView): string {
  return createHash('sha256').update(input).digest('hex');
}
```

### 4.6 `child_process.exec/execFile` exception types

In v26 the `stdout` / `stderr` properties on the error may be
`string | Buffer`. Old code that assumed `Buffer` will fail to compile
when assigned to a `Buffer`-typed variable.

**Fix**: cast or widen.

### 4.7 `--experimental-transform-types` flag

In v26 the typings no longer include the `--experimental-transform-types`
flag — it has been replaced by `erasableSyntaxOnly`. Drop it from your
build scripts and tsconfig.

### 4.8 `module.register()` runtime deprecation

`module.register()` is now typed as runtime-deprecated, with full removal
planned. Migrate to `import.meta` hooks or a `require`-based loader.

### 4.9 EOL handling

Many runtime deprecations are reflected as **typed** JSDoc warnings from
v24 onward (e.g. `url.parse()`, `SlowBuffer`, REPL without `new`, `_stream_*`
modules). If your project enforces `noErrorTruncation` or strict lint rules
that read JSDoc, you may see new warnings after the bump. Treat them as
informational until the runtime actually removes the API.

### 4.10 `corepack` no longer distributed

In v25 the typings reflect that the global `corepack` is no longer
present. Code that called `require('node:corepack')` will type-check, but
TypeScript will no longer expose `corepack` as a typed global. Remove
imports of `node:corepack` entirely.

### 4.11 Orphaned deprecated interfaces

v26 removed orphaned deprecated interfaces from `buffer`, `fs`,
`perf_hooks`, `util`, and `worker_threads` typings. If your code imported
them by name, expect compile errors.

### 4.12 `Readable` streams read one buffer at a time

v26 introduced a runtime change (Readable streams now read one buffer at
a time). The typings reflect the new behavior, so code that relied on
multi-buffer reads in `.push()` callbacks may need to loop.

---

## 5. References

All source URLs are the upstream PRs on DefinitelyTyped where these type
changes landed:

- `@types/node` **v23.0.0** (2025-01-08) — https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72589
- `@types/node` **v24.0.0** (2025-05-06) — https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75038
- `@types/node` **v25.0.0** (2025-12-10) — https://github.com/DefinitelyTyped/DefinitelyTyped/pull/73924
- `@types/node` **v26.0.0** (2026-05-05) — https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75025

---

### Document conventions

- All code samples are **type-level** illustrations. They compile but do
  not necessarily run on every Node.js major — match your runtime to your
  typings when calling new APIs.
- When this guide says "typed" it means: a TypeScript-visible addition
  to the surface area of `@types/node`. It does not imply that the
  underlying runtime API is available in your installed Node.js.
