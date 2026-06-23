# @types/node 23.0.0 — Changelog

**Release date:** 2025-01-08
**Source PR:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72589

> Major version of `@types/node` aligned with Node.js 23.x. Focuses on
> removing long-deprecated runtime APIs from the typings and adding types
> for early-stage features that graduate to global in Node 24.

---

## Breaking changes

### 1. `util.is*` methods and `util.log` removed

The full family of `util.is*` type guards was removed from
`@types/node/util.d.ts`. These methods were deleted from Node.js core
years ago, but the type stubs persisted and are now gone.

```ts
// Before (22.x)
import { isBuffer, isString } from 'node:util';

if (isBuffer(x)) { /* ... */ } // type-checks
if (isString(y)) { /* ... */ } // type-checks

// After (23.0.0)
import { isBuffer, isString } from 'node:util';
//                ^^^^^^^^
// TS2305: Module '"node:util"' has no exported member 'isBuffer'
```

**Removed members:** `isBoolean`, `isBuffer`, `isDate`, `isError`,
`isFunction`, `isNull`, `isNullOrUndefined`, `isNumber`, `isString`,
`isSymbol`, `isUndefined`, `isRegExp`, `isObject`, `isPrimitive`,
`util.log`.

### 2. `zlib.bytesRead` removed

```ts
// Before (22.x)
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

createReadStream('data.gz')
  .pipe(createGunzip())
  .on('data', function (this: import('node:zlib').Gunzip) {
    console.log(this.bytesRead); // typed
  });

// After (23.0.0)
  .on('data', function (this: import('node:zlib').Gunzip) {
    //              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // Property 'bytesRead' does not exist on type 'Gunzip'
    console.log(this.bytesWritten);
  });
```

### 3. Obsolete `Cipher` export from `crypto.d.ts`

```ts
// Before (22.x)
import { Cipher } from 'node:crypto';
const c: Cipher = createCipheriv('aes-256-cbc', key, iv);

// After (23.0.0)
import { Cipher } from 'node:crypto';
//                  ^^^^^^
// Cipher is not exported. Use createCipheriv's return type.
const c = createCipheriv('aes-256-cbc', key, iv);
```

### 4. `process.arch` narrowed

`loong64`, `mips`, `mipsel`, and `ppc` were removed from the `process.arch`
union. These architectures are no longer supported by Node.js core.

```ts
// Before (22.x)
switch (process.arch) {
  case 'loong64': /* ... */ // typed
  case 'ppc':     /* ... */ // typed
}

// After (23.0.0)
switch (process.arch) {
  case 'loong64':
    // TS2367: Type '"loong64"' is not comparable to type
    //         "arm" | "arm64" | "ia32" | "mips" | "mipsel" | ...
  // ...
}
```

### 5. `Array.prototype.at` polyfills removed

In `@types/node` <= 22, the package shipped polyfills for `.at()` so that
projects using older `lib` settings still type-checked. In 23.0.0 these
polyfills were removed.

```ts
// Before (22.x on TS < 4.6)
const arr: number[] = [1, 2, 3];
arr.at(-1); // typed via @types/node polyfill

// After (23.0.0)
// TS requires TypeScript 5.x with the ES2022 lib for native `.at()` typing.
```

### 6. Iterator return types normalized

Node API iterator return types were changed from
`IteratorResult<T>` (with implicit `undefined`) to a uniform
`IteratorResult<T, undefined>` shape. Most code is unaffected, but any
userland type guards that matched `done: false, value: T` explicitly may
fail under strict equality.

### 7. ERM (`lib.esnext.disposable`) required

`Disposable` / `AsyncDisposable` types in Node typings now require
`lib.esnext.disposable` (shipped in TS 5.2+). Projects on older TS will
see errors.

### 8. `Float16Array` polyfill interface removed

In 23.0.0 the local `Float16Array` interface (used to back-fill TS <= 5.7)
was removed. On TS >= 5.8 the standard `Float16Array` from
`lib.esnext.float16` is used.

---

## New features

### `crypto.diffieHellman` callback parameter

```ts
import { diffieHellman } from 'node:crypto';

// 23.0.0: optional callback parameter added to the overloads
diffieHellman({ privateKey: a }, { publicKey: b }, (err, secret) => {
  if (err) throw err;
  // secret: Buffer
});
```

### `fetch` global — `CloseEvent` exposed

```ts
// With Node 18+ undici fetch, CloseEvent is now typed as a global
addEventListener('close', (ev: CloseEvent) => {
  console.log(ev.reason);
});
```

### `process.threadCpuUsage()`

```ts
// 23.0.0: typed
const cpu = process.threadCpuUsage();
const diff = process.threadCpuUsage(cpu);
```

### `sqlite` additions

```ts
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
const stmt = db.prepare('SELECT id, name FROM users');

// 23.0.0: StatementSync.prototype.columns()
const cols = stmt.columns();
// cols: Array<{ name: string; column: string | null; table: string | null;
//               database: string | null; type: string | null; }>

// 23.0.0: online backup API typed
const backup = db.backup('snapshot.db');
```

### `test_runner` additions

```ts
import { run } from 'node:test';

// 23.0.0: cwd option
run({ cwd: '/path/to/project' })
  // 23.0.0: lcov reporter exposed as newable function
  .compose?.on('test:coverage', (event) => { /* ... */ });
```

### `url.URLPattern` implementation

```ts
// 23.0.0: URLPattern is typed in node:url (graduates to global in Node 24)
import { URLPattern } from 'node:url';
const p = new URLPattern({ pathname: '/users/:id' });
```

### `util.types.isFloat16Array()`

```ts
import { types } from 'node:util';
types.isFloat16Array(x); // typed in 23.0.0
```

### `v8` source map support

```ts
import { setSourceMapsSupport } from 'node:v8';
setSourceMapsSupport(true); // 23.0.0: typed
```

### `dns` TLSA record

```ts
import { Resolver } from 'node:dns';
const r = new Resolver();
r.resolve('_dmarc.example.com', 'TLSA', (err, records) => {
  // records typed as TLSA[]
});
```

---

## Deprecations

The following typings carry a JSDoc `@deprecated` tag pointing at the
upstream Node.js DEP IDs:

| API | DEP | Note |
|-----|-----|------|
| `util.is*` family | DEP00xx | Already removed from core; types now removed. |
| `zlib.bytesRead` | — | Removed. Use `bytesWritten` or `read()` length. |
| `process.arch ∈ {loong64, mips, mipsel, ppc}` | — | Architectures dropped from core. |

---

## Migration tips from 22.x

1. **Bump TypeScript to 5.2+** before installing 23.x if you rely on
   `Disposable` / `AsyncDisposable` typings.
2. **Replace `util.is*`** with explicit `typeof` / `instanceof` checks.
   The type-level removal is the only break — runtime was already gone.
3. **Remove `zlib.bytesRead`** references; switch to `bytesWritten` or
   `.read()` return length.
4. **Audit `process.arch` switches**: the four dropped architectures will
   now produce a `TS2367` error. Drop the cases entirely.
5. **Update `lib` config** to `"ES2022"` (or later) so that `.at()` typing
   is consistent without the local polyfill.
6. **Float16Array**: if you targeted TS <= 5.7, provide a local `.d.ts`
   shim or bump TypeScript.
7. **Pin to the exact patch** (e.g. `23.0.x`) — the v23 line iterated
   quickly in early 2025.

---

**Source:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72589
