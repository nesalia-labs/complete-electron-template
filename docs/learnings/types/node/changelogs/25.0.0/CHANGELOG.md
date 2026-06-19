# @types/node 25.0.0 — Changelog

**Release date:** 2025-12-10
**Source PR:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/73924

> Major version of `@types/node` aligned with Node.js 25.x. The headline
> change is the consolidation of long-standing EOL deprecations into
> actual type removals and the addition of Web Storage / ErrorEvent
> globals.

---

## Breaking changes

### 1. `fs.F_OK`, `fs.R_OK`, `fs.W_OK`, `fs.X_OK` removed

```ts
// Before (24.x)
import { F_OK, R_OK, W_OK, X_OK } from 'node:fs';
// (these were removed from Node core years ago; typings lingered)

// After (25.0.0)
import { F_OK } from 'node:fs';
//         ^^^^
// TS2305: Module '"node:fs"' has no exported member 'F_OK'
```

Use `fs.constants.F_OK` etc. instead.

### 2. `FileHandle` close-on-GC and `rmdir` recursive options moved to EOL

```ts
// fs: FileHandle close on GC — typed as runtime EOL
// fs: rmdir recursive option — typed as runtime EOL
```

### 3. `crypto` EOLs reflected in typings

- `default shake128/256 outputLength` — typed EOL.
- `hash/mgf1Hash` options on sign/verify — typed EOL.
- `ECDH.setPublicKey()` — typed EOL.

```ts
// Before (24.x) — types permitted
crypto.createHash('shake128', { outputLength: 16 });

// After (25.0.0) — still callable at runtime; types reflect EOL
//                  (JSDoc deprecation marker)
```

### 4. `assert.fail` multi-arg, `CallTracker` moved to EOL

```ts
import { fail, CallTracker } from 'node:assert';
// 25.0.0: fail() with multiple arguments — typed EOL
// 25.0.0: CallTracker — typed EOL
```

### 5. `async_hooks.asyncResource` on bound functions moved to EOL

```ts
// Bound functions no longer expose asyncResource — typed EOL.
const bound = fn.bind(null);
bound.asyncResource; // typed EOL
```

### 6. `child_process._channel` moved to EOL

```ts
// 25.0.0: _channel property typed EOL
```

### 7. `dgram`, `dns`, `http`, `perf_hooks`, `process`, `repl`, `tls`,
`url`, `worker` EOLs consolidated

A wide list of legacy APIs are typed as runtime EOL or removed outright
in v25. Notable items:

- `http.ServerResponse.prototype.writeHeader` — typed deprecated,
  **scheduled for full removal in v26**.
- `perf_hooks` deprecated accessors — typed EOL.
- `process` `multipleResolves` event — typed EOL.
- `repl` without `new` — typed EOL.
- `tls` IP-address `servername` — typed EOL.
- `url` legacy bad-port behavior — typed EOL.
- `worker` `terminate` callback — typed EOL.

### 8. `_stream_*`, `_tls_common`, `_tls_wrap` modules typed deprecated

```ts
// 25.0.0: typed @deprecated, fully removed in v26
import { Writable } from 'node:_stream_writable';
// Use 'node:stream' instead.
```

### 9. `module._debug` moved to EOL

### 10. `fs.processReadResult`, `readSyncRecursive` made private

```ts
// 25.0.0: removed from public typings (internal helpers)
```

### 11. `fs` stream `open` method moved to EOL

### 12. `corepack` no longer distributed

```ts
// 25.0.0: typings reflect that 'node:corepack' is not distributed.
// Do not import 'node:corepack'.
```

### 13. `assert`/`util` deep equal semantics changed

```ts
// 25.0.0: deep equal of Promises now fails (was permissive)
// 25.0.0: invalid dates now considered equal in deep comparison
```

This is a semantic behavior change visible at the type-level through
narrower `expect()` signatures and at runtime through `assert.deepStrictEqual`.

---

## New features

### `process.workerMessage` event

```ts
// 25.0.0: typed
process.on('workerMessage', (msg) => { /* ... */ });
```

### `mock.module()` with URL argument

```ts
import { mock } from 'node:test';

// 25.0.0: URL overload typed
await mock.module(new URL('./fixtures/db.js', import.meta.url), {
  defaultExport: { query: () => [] },
});
```

### `v8` CPU profile support

```ts
import { startCpuProfile, stopCpuProfile } from 'node:v8';
// 25.0.0: typed
const profile = startCpuProfile('session-1');
const serialized = stopCpuProfile(profile);
```

### Portable compile cache option (typed)

```ts
// 25.0.0: portable compile cache options surfaced in typings
```

### `--allow-inspector` flag (typed)

```ts
// 25.0.0: --allow-inspector permission flag typed
```

### Web Storage + ErrorEvent globals

```ts
// 25.0.0: with Node 25+'s bundled DOM-like globals, the typings now
// expose localStorage/sessionStorage/ErrorEvent.
localStorage.setItem('lastView', '/dashboard');
window.addEventListener('error', (ev: ErrorEvent) => {
  console.error(ev.message, ev.error);
});
```

### `--allow-net` permission (typed)

```ts
// 25.0.0: --allow-net permission model option typed
```

### WebAssembly JSPI (typed)

```ts
// 25.0.0: WebAssembly JSPI (JavaScript Promise Integration) types surfaced
```

### `v8` Uint8Array base64/hex conversion (typed)

```ts
// 25.0.0: v8 built-in Uint8Array base64/hex conversion helpers typed
import { encodeBase64, decodeBase64 } from 'node:v8';
```

### V8 14.1 typings improvements

Typed updates for new RegExp and Array helpers in V8 14.1.

---

## Deprecations

The following carry JSDoc `@deprecated` markers in 25.0.0:

| API | Status |
|-----|--------|
| `SlowBuffer` | Typed EOL |
| `crypto.fips` | Typed runtime deprecation |
| `crypto.createHash('shake128/256', { outputLength })` | Typed runtime deprecation |
| `ECDH.setPublicKey()` | Typed EOL |
| `_stream_*`, `_tls_common`, `_tls_wrap` modules | Typed deprecated (full removal in v26) |
| `writeHeader` | Typed deprecated, full removal in v26 |
| `repl` without `new` | Typed EOL |
| `module.register()` | Typed runtime deprecation |

---

## Migration tips from 24.x

1. **`fs` constants**: switch any `import { F_OK } from 'node:fs'` to
   `fs.constants.F_OK`.
2. **`buffer`**: drop `SlowBuffer`. Use `Buffer.allocUnsafe(size)`.
3. **`crypto`**: pass an explicit `outputLength` to `shake128` / `shake256`;
   avoid the deprecated `hash` / `mgf1Hash` options.
4. **`REPL`** and other classes: instantiate with `new`.
5. **`url` legacy module**: move to `new URL()` (WHATWG).
6. **`http`**: switch `writeHeader` to `writeHead` now — `writeHeader` is
   **fully removed** in v26.
7. **`stream`**: stop importing `node:_stream_*`. Use `node:stream`.
8. **`assert`**: re-check deep-equal callsites that compare Promises or
   invalid `Date` objects — semantics changed.
9. **`corepack`**: remove all `import 'node:corepack'` references.
10. **TypeScript**: 5.5+ recommended; v26 will require 5.6+.

---

**Source:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/73924
