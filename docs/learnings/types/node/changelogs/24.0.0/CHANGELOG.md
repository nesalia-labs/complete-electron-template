# @types/node 24.0.0 — Changelog

**Release date:** 2025-05-06
**Source PR:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75038

> Major version of `@types/node` aligned with Node.js 24.x. Adds typed
> APIs for several Node 24 stabilized features (URLPattern as global,
> AsyncLocalStorage options, http2 settings), and tightens several older
> type surfaces.

---

## Breaking changes

### 1. `domain.Domain.members` retyped to `EventEmitter[]`

```ts
// Before (22.x / 23.x)
import domain from 'node:domain';

const d = domain.create();
d.add(emitter);
d.add(timer); // typed as NodeJS.Timer | EventEmitter (loose)
const members: Array<EventEmitter | NodeJS.Timer> = d.members;

// After (24.0.0)
const members: EventEmitter[] = d.members;
d.add(timer);
// TS2345: Argument of type 'Timeout' is not assignable to parameter of type 'EventEmitter'
```

`Domain#add` and `Domain#remove` no longer accept `NodeJS.Timer`. Timer
arguments were never valid at runtime; the type tightening aligns the
typings with reality.

### 2. `fs.Dirent#path` removed

```ts
// Before (22.x)
import { readdirSync } from 'node:fs';
const entries = readdirSync(dir, { withFileTypes: true });
entries.forEach((e) => console.log(e.path)); // typed string

// After (24.0.0)
entries.forEach((e) => {
  //          ^^^^^
  // Property 'path' does not exist on type 'Dirent'
  console.log(e.parentPath);
});
```

### 3. `tls.createSecurePair` removed

```ts
// Before (22.x)
import { createSecurePair } from 'node:tls';
const pair = createSecurePair(cleartextStream, /* ... */);

// After (24.0.0)
import { TLSSocket, connect } from 'node:tls';
const sock = connect({ host, port });
// or
const tls = new TLSSocket(cleartext, { /* ... */ });
```

### 4. `Cipher` export removal carried forward

`Cipher` is no longer exported from `node:crypto` (continued from v23).
Use `crypto.createCipheriv` return type or `Cipheriv`.

### 5. `net.Socket` constructor options reorganized

```ts
// Before (22.x / 23.x) — noDelay/keepAlive/keepAliveInitialDelay/blockList
// lived on SocketConnectOpts only.
import { Socket } from 'node:net';
new Socket({ noDelay: true, keepAlive: true, host, port }); // partial type

// After (24.0.0) — those options promoted to the general Socket options interface
new Socket({ noDelay: true, keepAlive: true, keepAliveInitialDelay: 1000 });
// All four now typed consistently across connect/cTor paths.
```

### 6. `stream/web` typing fixes

Several longstanding typing bugs were corrected:

```ts
// byobRequest type corrected
new ReadableStream({
  type: 'bytes',
  pull(controller) {
    const view = controller.byobRequest?.view; // typed as Uint8Array (correct shape)
  },
});

// ReadableStreamReadDoneResult.value optionality fixed
type Done = ReadableStreamReadDoneResult<number>;
//   .value: number | undefined  (was: number)

// TransformStream transformer.cancel callback restored
new TransformStream({
  transform(chunk, ctrl) {},
  flush() {},
  cancel(reason) { /* now typed */ },
});
```

### 7. `ProcessEnv.TZ` removed

```ts
// Before (22.x)
process.env.TZ; // string | undefined (named)

// After (24.0.0)
process.env.TZ; // string | undefined via the index signature
// No more explicit named property — falls through to the generic indexer.
```

### 8. `module`-level JSDoc headers dropped from published `.d.ts`

A pure build/meta change — module-level `@since` / `@deprecated` JSDoc
headers are no longer emitted. Internal-only consumers may notice.

---

## New features

### `async_hooks.AsyncLocalStorage` options

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<{ requestId: string }>({
  defaultValue: { requestId: 'unknown' }, // 24.0.0: typed
  name: 'request-context',                // 24.0.0: typed (shows in stack traces)
});
```

### `http2` enhancements

```ts
import { createSecureServer } from 'node:http2';

const server = createSecureServer(
  {
    cert,
    key,
    maxSessionRejectedStreams: 100,   // 24.0.0: typed
    maxSessionInvalidFrames: 100,     // 24.0.0: typed
  },
  (req) => {
    const proto = req.headers[':protocol']; // 24.0.0: typed (string | string[] | undefined)
  },
);

// 24.0.0: customSettings on http2.connect() / Settings
const session = http2.connect('https://example.com', {
  peerMaxConcurrentStreams: 100,
});
session.settings({ customSettings: { 0x10: 42 } }); // typed
```

### `sqlite` additions

```ts
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:', {
  timeout: 5_000, // 24.0.0: typed
});

// 24.0.0: aggregate function registration
db.aggregate('sumSquared', {
  start: 0,
  step(acc, n) { return acc + n * n; },
  result(acc) { return acc; },
});

// 24.0.0: transaction getter
const tx = db.transaction(() => { /* ... */ });

// 24.0.0: location method
console.log(db.location());
```

### `test_runner` expansion

```ts
import { test, suite, run } from 'node:test';

// 24.0.0: 'test:summary' event
run({ files: ['./tests/**'] })?.on('test:summary', (event) => {
  console.log(event);
});

// 24.0.0: automatic waiting for subtests

// 24.0.0: global setup/teardown
// --experimental-test-global-setup on the CLI; types reflect the option.

// 24.0.0: fullName on SuiteContext
suite('outer', (s) => {
  s.fullName; // typed
});
```

### `process` additions

```ts
// 24.0.0: process.features.typescript
if (process.features.typescript) {
  // typed boolean
}

// 24.0.0: process.traceProcessWarnings readonly boolean
process.traceProcessWarnings = true; // typed
```

### `url.URLPattern` as global

```ts
// 24.0.0: URLPattern is both a global and an import from 'node:url'.
const p = new URLPattern({ pathname: '/users/:id' });
```

### `util` additions

```ts
import { getCallSites, types } from 'node:util';

// 24.0.0: getCallSites
const stack = getCallSites();

// 24.0.0: types.isFloat16Array()
types.isFloat16Array(x);
```

### `vm` source-phase imports for WebAssembly

```ts
// 24.0.0: typed for source-phase module imports
const mod = new WebAssembly.Module(wasmBytes, {
  // typed import descriptor support
});
```

### `worker.getHeapStatistics()`

```ts
import { Worker } from 'node:worker_threads';
const w = new Worker('./worker.js');
// w.getHeapStatistics is now typed (request/response roundtrip).
```

### `v8` improvements

```ts
import { GCProfiler, queryObjects } from 'node:v8';

// 24.0.0: GCProfiler support for Explicit Resource Management
const p = new GCProfiler();
p.start();

// 24.0.0: v8.queryObjects() marked stable (no longer experimental in typings)
queryObjects(ctor);
```

### `tls` additions

```ts
import { connect } from 'node:tls';
const sock = connect({
  host: 'example.com',
  port: 443,
  requestOCSP: true, // 24.0.0: typed
});
sock.on('secure', () => { /* 24.0.0: 'secure' event typed */ });
```

### `undici-types` bumped

The bundled `undici-types` were bumped to `~7.18.0`, exposing newer
`fetch`/`Headers`/`Request`/`Response` shape tweaks.

---

## Deprecations

The following are now `@deprecated` in JSDoc:

| API | Reason |
|-----|--------|
| `url.parse()` | DEP to removal in the legacy `url` module. |
| `SlowBuffer` | Buffer module runtime deprecation. |
| REPL instantiation without `new` | Runtime deprecation. |
| `Zlib` classes without `new` | Runtime deprecation. |
| `child_process.spawn/execFile` positional args | Runtime deprecation. |
| `repl.builtinModules` | Replaced by `module.builtinModules`. |

None of these are removed from typings in 24.0.0; they only carry a JSDoc
warning. Strict lint configurations reading JSDoc will surface them.

---

## Migration tips from 23.x

1. **`domain`**: switch all `domain.add(timer)` / `domain.remove(timer)`
   callsites to operate on `EventEmitter` only. If you need to track
   timers, do it explicitly outside the domain API.
2. **`fs.Dirent`**: replace `dirent.path` with `dirent.parentPath`. The
   runtime API has not changed — only the type.
3. **`tls.createSecurePair`**: remove and use `TLSSocket` directly.
4. **`URLPattern`**: pick one import style. If you want it as a global,
   add `"DOM"` to your `lib` array; otherwise import from
   `node:url`.
5. **`url.parse`**: migrate to `new URL()` (WHATWG). Types now carry a
   deprecation hint.
6. **`REPL` / `Zlib` constructors**: prefix `new`.
7. **`spawn` / `execFile`**: switch from positional args to
   `{ args: string[] }`.
8. **`ProcessEnv.TZ`**: any code that destructured `process.env.TZ` and
   relied on it being a named property now gets the index-signature
   typing. Most code is unaffected.

---

**Source:** https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75038
