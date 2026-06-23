# @types/node 26.0.0 — Changelog

**Release date:** 2026-05-05
**Source PR:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75025

> Major version of `@types/node` aligned with Node.js 26.x. Headlines:
> TypeScript `>= 5.6` is now **required**, several long-deprecated APIs
> are removed from the typings, and the **Temporal** API plus V8 14.6
> proposals are exposed.

---

## Breaking changes

### 1. TypeScript `>= 5.6` required

Iterator helper compatibility definitions for TS `<= 5.5` were removed.
The package will install on older TS, but the Iterator shim will be
absent and code that uses the new `Iterator` types will fail to compile.

```jsonc
// tsconfig.json — minimum acceptable
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"]
  }
}
```

If your team is on TS 5.5, **bump TypeScript before bumping
`@types/node`**.

### 2. `http.Server.prototype.writeHeader` fully removed

```ts
// Before (24.x / 25.x with @deprecated)
res.writeHeader(200);
res.end('ok');

// After (26.0.0)
res.writeHeader(200);
// TS2339: Property 'writeHeader' does not exist on type 'ServerResponse'

res.writeHead(200);
res.end('ok');
```

### 3. Legacy `_stream_*` modules fully removed

```ts
// Before (25.x with @deprecated)
import { Writable } from 'node:_stream_writable';

// After (26.0.0)
import { Writable } from 'node:_stream_writable';
// TS2307: Cannot find module 'node:_stream_writable' or its corresponding type declarations

// Use:
import { Writable } from 'node:stream';
```

Removed modules: `_stream_wrap`, `_stream_readable`, `_stream_writable`,
`_stream_duplex`, `_stream_transform`, `_stream_passthrough`.

### 4. `--experimental-transform-types` flag removed from typings

```ts
// Before (25.x) — typings included the flag
// After (26.0.0)
node --experimental-transform-types app.ts
//                   ^^^^^^^^^^^^^^^^^^^^^^^
// TS5093: Unknown compiler option 'experimentalTransformTypes'.
// Use 'erasableSyntaxOnly' instead.
```

Drop the flag from build scripts and tsconfig.

### 5. Stricter `crypto` Buffer typing

```ts
// Before (25.x) — many methods accepted any Buffer-shaped input loosely
function sign(data: Buffer | string) {
  return crypto.sign('sha256', data, privateKey);
}

// After (26.0.0) — narrower canonical union
function sign(data: string | ArrayBufferLike | ArrayBufferView) {
  return crypto.sign('sha256', data, privateKey);
}
```

Widened legacy `crypto`-specific encoding unions were replaced with the
canonical `BufferEncoding`. The old unions remain as orphaned exports
scheduled for future removal.

### 6. `CipherKey` duplicate deprecated — prefer `KeyLike`

```ts
// Before (25.x)
import type { CipherKey } from 'node:crypto';
const key: CipherKey = process.env.SECRET;

// After (26.0.0) — CipherKey is deprecated; prefer KeyLike
import type { KeyLike } from 'node:crypto';
const key: KeyLike = process.env.SECRET;
```

### 7. `child_process.exec/execFile` error shape tightened

```ts
// Before (25.x)
catch (err) {
  const out: Buffer = err.stdout;
  const errBuf: Buffer = err.stderr;
}

// After (26.0.0)
catch (err) {
  // err.stdout: string | Buffer
  // err.stderr: string | Buffer
  const out: string | Buffer = err.stdout;
  const errBuf: string | Buffer = err.stderr;
}
```

### 8. `GlobOptions` internal base merged into public type

```ts
// Before (25.x)
import type { GlobOptions, _GlobOptions } from 'node:fs';
//                               ^^^^^^^^^^^
// _GlobOptions was the internal base interface

// After (26.0.0)
import type { GlobOptions } from 'node:fs';
// _GlobOptions removed; consolidated into GlobOptions.
```

### 9. Orphaned deprecated interfaces removed

The following interfaces were marked orphaned-deprecated in earlier
versions and are fully removed in 26.0.0:

- `buffer` (orphaned interfaces)
- `fs` (orphaned interfaces)
- `perf_hooks` (orphaned interfaces)
- `util` (orphaned interfaces)
- `worker_threads` (orphaned interfaces)

### 10. `DOMException`-derived interface added unconditionally

`QuotaExceededError` now implements a `DOMException`-derived interface
unconditionally; no longer gated on `lib.dom`.

### 11. `Readable` streams now read one buffer at a time

This is a runtime change reflected in typings: callbacks expecting
multi-buffer batches may need to loop.

---

## New features

### 1. Temporal API types

```ts
// 26.0.0: Temporal types are exposed via the bundled typings.
// With Node 26 enabling Temporal by default at runtime, the typings
// mirror that surface.
const now = Temporal.Now.instant();
const zoned = now.toZonedDateTimeISO('America/New_York');
```

### 2. V8 14.6 typed proposals

```ts
// Map.prototype.getOrInsert / getOrInsertComputed typed
const m = new Map<string, number>();
m.getOrInsert('k', 0);
m.getOrInsertComputed('k', (k) => k.length);

// WeakMap variants typed as well
const wm = new WeakMap<object, number>();

// Iterator.concat typed
const merged = Iterator.concat(a, b, c);
```

### 3. `undici` 8.0.2 typings surface

```ts
// 26.0.0: undici-types bumped to v8.3 — fetch/Headers/Request/Response
// shapes updated to match undici 8.0.2.
```

### 4. `crypto` raw key formats on `KeyObject`

```ts
import { createPrivateKey } from 'node:crypto';

// 26.0.0: raw key formats added to KeyObject APIs
const key = createPrivateKey(rawBytes);
```

### 5. Ed25519 context parameter

```ts
import { sign } from 'node:crypto';
// 26.0.0: Ed25519 context parameter typed
sign(null, data, { key, context: Buffer.from('app-context') });
```

### 6. `diagnostics_channel` promise consistency

```ts
import { channel } from 'node:diagnostics_channel';
const ch = channel('app:request');
// 26.0.0: ensure tracePromise consistency with non-Promises
```

### 7. HTTP/3 (`quic`) updates

```ts
// 26.0.0: HTTP/3 implementation updates typed
```

### 8. `sqlite` Percentile extension

```ts
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
// 26.0.0: Percentile extension typed (db.percentile(...))
```

### 9. ML-KEM / ML-DSA pkcs8 seed-only defaults

```ts
// 26.0.0: ML-KEM and ML-DSA pkcs8 export defaults to seed-only format (typed)
```

### 10. `NODE_MODULE_VERSION` = 147 (typed)

```ts
// 26.0.0: NODE_MODULE_VERSION constant reflects v147.
process.versions.modules; // '147'
```

### 11. libuv 1.52.1, ICU 78.3 dependency updates

```ts
// 26.0.0: version constants typed to match the bundled runtime versions.
process.versions.uv;     // '1.52.1'
process.versions.icu;    // '78.3'
```

---

## Deprecations

| API | Status |
|-----|--------|
| `crypto` DEP0182 / DEP0203 / DEP0204 | Typed EOL / runtime-deprecated |
| `stream` DEP0201 | Promoted to runtime deprecation |
| `module.register()` | Typed runtime-deprecated (full removal planned) |
| `crypto.CipherKey` | Duplicate export deprecated — prefer `KeyLike` |
| `crypto`-specific encoding unions | Retained as orphaned exports for future removal |
| Older TS compatibility shims (TS `<= 5.5`) | Removed |

---

## Migration tips from 25.x

1. **Bump TypeScript to `>= 5.6` first.** If you cannot, pin to
   `@types/node@25` until you can.
2. **`writeHeader` → `writeHead`**: the type is now gone. A simple
   search-and-replace.
3. **Stream imports**: switch every `node:_stream_*` import to
   `node:stream`.
4. **`--experimental-transform-types`**: drop the flag from `tsconfig`
   and CI scripts.
5. **`crypto` types**: tighten callsites that pass `Buffer`. The
   canonical union is `string | ArrayBufferLike | ArrayBufferView`.
6. **`CipherKey` → `KeyLike`**: rename import.
7. **`child_process` errors**: catch blocks for `exec`/`execFile` must
   accept `stdout` / `stderr` as `string | Buffer`.
8. **`fs` / `buffer` / `perf_hooks` / `util` / `worker_threads`**:
   remove any imports of interfaces that were orphaned-deprecated.
9. **`module.register()`**: review for the upcoming full removal. Migrate
   to `import.meta` hooks or a `require`-based loader.
10. **Temporal**: opt in via the bundled typings or extend `lib` in your
    `tsconfig`. Most projects don't need explicit config — the types are
    present.
11. **Build matrices**: update CI to require **GCC 13.2**, **Python
    `>= 3.10`**, and **ClangCL on Windows** (MSVC support removed in the
    underlying toolchain).

---

**Source:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75025
