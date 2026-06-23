# jsdom — Comprehensive Guide (v27.4.0 → v29.1.1)

> Senior-level migration and usage notes for `jsdom`, the JavaScript implementation
> of the DOM/HTML standards for Node.js. This guide targets test engineers and
> library authors who run jsdom under Vitest, Jest, or a custom harness.

---

## 1. Overview

`jsdom` is a server-side, headless DOM implemented in pure JavaScript. It emulates
a large enough slice of browser APIs — DOM tree, HTML parser, CSSOM, fetch,
`XMLHttpRequest`, `WebSocket`, timers, etc. — to let UI code (React, Vue, vanilla
DOM) run inside Node.js without launching a real browser. Its primary use case
is unit and integration testing in environments that already ship a real
JavaScript runtime (Node), where a full browser like Playwright or Puppeteer
would be too expensive or too slow.

### 1.1 Versions covered by this guide

| Version | Release date | Headline change |
| --- | --- | --- |
| 27.4.0 | (your current pin) | Baseline. Resource loader is still "legacy". |
| 28.0.0 | 2026-03-15 | Resource loader API rewritten; MIME sniffing; XHR/WebSocket interception. |
| 29.0.0 | 2026-03-15 | Node 22.13.0+ required. CSSOM dependency removal. Bad-port blocking. |

The two majors landed on the same day. They are independent but commonly adopted
together; many users will go 27.4.0 → 29.1.1 in a single bump.

### 1.2 Node.js version requirements

- **27.4.0**: Node 18+, broad envelope.
- **28.0.0**: Node 18+ (no bump, but a regression surfaces against `undici`).
- **29.0.0**: **Node 22.13.0 or later is required** as the minimum supported
  v22 line. Older v22 patch releases and v20 will not install.

If you are still on Node 20.x, upgrade your runtime before pulling jsdom 29.
This is the single most common reason CI fails after a naive `npm i jsdom@latest`.

---

## 2. Key new features since 27.4.0

### 2.1 Customizable resource loading (v28)

The old `resourceLoader` constructor option (a function with `(resource, callback)`)
was a leaky abstraction over Node's HTTP stack. v28 replaces it with a Promise-
returning API that gives jsdom a uniform request/response lifecycle.

Conceptual shape:

```js
import { JSDOM, ResourceLoader } from 'jsdom';

class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    // Intercept every non-document fetch (scripts, XHR, WebSocket upgrades).
    if (url.startsWith('https://api.local/')) {
      return Promise.resolve(Buffer.from('{"ok":true}'));
    }
    // Defer to the default network stack.
    return super.fetch(url, options);
  }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: new LocalLoader(),
});
```

`fetch(url, options)` returns `Promise<Buffer>`. Synchronous XHR is explicitly
out of scope (it cannot be intercepted). WebSocket upgrade requests and
`XMLHttpRequest` GET/POST bodies now flow through this hook.

### 2.2 CSSOM overhaul (v29)

jsdom used to depend on `@acemir/cssom` and `cssstyle`. Those packages were
replaced with fresh internal implementations built on `webidl2js` wrappers and
the `css-tree` parser. Net effect:

- `MediaList` parses media queries properly. Invalid queries fall back to
  `not all` instead of being naively comma-split.
- `CSSStyleRule.selectorText` setter rejects invalid selectors (throws).
- New rules on `Window`: `CSSCounterStyleRule`, `CSSNamespaceRule`.
- New getters: `CSSMediaRule.matches`, `CSSSupportsRule.matches`,
  `CSSKeyframeRule.keyText` (with validation), `StyleSheet.ownerNode`,
  `StyleSheet.href`, `StyleSheet.title`.

If your code passed arbitrary strings into `selectorText`, expect throws now.

### 2.3 Security: bad-port blocking (v29)

jsdom now blocks fetches to commonly-abused ports per the [fetch spec's bad
port list](https://fetch.spec.whatwg.org/#port-blocking). Local tests that hit
`localhost:25`, `:587`, or other restricted ports will fail where they used to
succeed. Configure your server port or refactor the endpoint.

### 2.4 MIME sniffing on iframe/frame (v28)

Iframe and frame loads now sniff MIME types. This fixes long-standing bugs
where a misconfigured `Content-Type` would silently degrade a subdocument into
an HTML view.

### 2.5 `load` vs `error` events for non-OK HTTP (v28)

`<iframe>`, `<frame>`, and `<img>` (with `canvas` installed) now fire `load`
events instead of `error` events when the underlying HTTP response is non-OK.
This aligns with browser behavior. If your test asserted that an image with a
404 fired `error`, flip the assertion.

### 2.6 Performance: lazy CSS engine init (v29)

The CSS selector engine is now lazily initialized, saving ~0.5 ms per
`Document`. Worth knowing if you have a benchmark or microbenchmark that
measured `JSDOM` startup time — it should now be slightly faster.

### 2.7 Referrer correctness (v28)

The document referrer is now the **initiating page**, not the last redirect
hop. If you asserted on a specific `document.referrer` after a redirect chain,
update the expectation.

---

## 3. Migration path: 27.4.0 → 29.1.1

### 3.1 The short version

1. Bump Node to ≥ 22.13.0.
2. Update `jsdom` in `package.json` to `^29.1.1`.
3. Rewrite any custom `resourceLoader` to extend `ResourceLoader` and return a
   Promise of `Buffer`.
4. Audit direct imports of `@acemir/cssom` / `cssstyle` — add them as explicit
   dependencies.
5. Run the suite. Expect any code that set `selectorText` to invalid values to
   throw, and any code that hit bad ports to be rejected.

### 3.2 The resource loader rewrite

Before (v27 legacy):

```js
// OLD: v27 callback-based resource loader
const dom = new JSDOM(html, {
  resources: (resource, callback) => {
    if (resource.url.href.endsWith('.json')) {
      callback(null, Buffer.from('{}'));
      return;
    }
    resource.defaultFetch(callback);
  },
});
```

After (v28+):

```js
// NEW: v28+ Promise-based ResourceLoader subclass
import { JSDOM, ResourceLoader } from 'jsdom';

class StubLoader extends ResourceLoader {
  fetch(url, options) {
    if (url.endsWith('.json')) {
      return Promise.resolve(Buffer.from('{}'));
    }
    return super.fetch(url, options);
  }
}

const dom = new JSDOM(html, { resources: new StubLoader() });
```

The new API is Promise-based, the option is an **instance** not a function, and
the `resource.defaultFetch` fallback is `super.fetch()`. Anything else is a
behavior change.

### 3.3 CSSOM dependency removal

If your code (or a transitive library) relied on `@acemir/cssom` or `cssstyle`
being installable through jsdom's dependency tree, you now need to declare them
yourself:

```jsonc
// package.json
{
  "dependencies": {
    "jsdom": "^29.1.1",
    "@acemir/cssom": "^1.2.0",
    "cssstyle": "^4.0.1"
  }
}
```

For most test setups this is a no-op — they never imported those packages
directly. If a third-party library did, the upgrade will surface a `MODULE_NOT_FOUND`
the first time it tries to `require('cssstyle')`.

### 3.4 Selector validation tightening

```js
// Before: silently accepted broken selectors
sheet.insertRule('..bad { color: red }', 0);

// After: throws on invalid selectors
//   DOMException: 'Failed to parse the rule'
```

Wrap any dynamic rule insertion in a try/catch if your test inserts user-style
strings.

### 3.5 Bad port blocking

```js
// This used to "work" in v27 (via fake server on a restricted port).
const dom = new JSDOM(`<a href="http://127.0.0.1:25/">x</a>`,
  { runScripts: 'dangerously' });

// In v29 this fetch is blocked at the resource loader layer.
// Use 127.0.0.1 on an allowed port (8080, 3000, etc.) for local stubs.
```

---

## 4. Common pitfalls and gotchas

### 4.1 Node version requirements

The single biggest upgrade blocker. Node 20.x and old 22.x patch releases
(< 22.13.0) cannot install jsdom 29. Symptom:

```
EBADENGINE  Unsupported engine { wanted: { node: '>=22.13.0' } }
```

Fix: bump Node in CI (`actions/setup-node` with `node-version: '22.13.0'` or
newer) and update `engines.node` in `package.json`.

### 4.2 `undici` regression: WebSocket per-origin throttling

v28 has a known regression: WebSocket connections are no longer limited to one
per origin due to an upstream `undici` bug
([nodejs/undici#4743](https://github.com/nodejs/undici/issues/4743)). If your
test suite asserts that a second concurrent connection to the same origin is
throttled or rejected, expect that to silently break. There is no jsdom-side
workaround; wait for the upstream fix or pin to v27 if your test depends on it.

### 4.3 Synchronous XHR is not interceptable

The new `ResourceLoader.fetch()` only sees asynchronous requests. Synchronous
`XMLHttpRequest` (`xhr.open(..., false)`) bypasses it. This matches browsers,
but tests that used the legacy loader to mock sync XHR must either switch to
async XHR or stub at a higher level (e.g., mock the module that performs the
request).

### 4.4 `Buffer` snapshot semantics

v28 fixes a class of bugs where `ArrayBuffer` and typed arrays passed to jsdom
APIs were aliased rather than copied. If your code relied on a single
`ArrayBuffer` being mutated by jsdom and read back, that no longer holds —
jsdom now snapshots. This is almost always the correct behavior, but exotic
tests that depended on aliasing will need adjustment.

### 4.5 `error` vs `load` event swap for failed subresources

`<iframe>`, `<frame>`, and `<img>` elements now fire `load` (not `error`) on
non-OK HTTP responses when `canvas` is installed. Audit assertions that expect
`error` after a 404 image, etc.

### 4.6 `url.parse()` deprecation silenced

v28 resolves a `require('url').parse()` deprecation warning that fired on
WebSocket usage. If you had `process.on('warning', ...)` handlers in test
setups that asserted on a clean warning list, those should now stay clean.

### 4.7 CSSOM migration can surface third-party issues

If you load a CSS-heavy library (some charting libs, some design systems) that
relied on the loose selector parser in v27, v29's strict `css-tree` parser may
reject rules the old code accepted. This will typically surface as console
warnings or thrown exceptions inside `runScripts: 'dangerously'` setups, not
as install errors. Inspect the DOM after script load.

### 4.8 No new APIs on the constructor surface

The 28.x and 29.x changes are about *internal* cleanup, not new public API on
`JSDOM` itself. If you are looking for "new top-level features" beyond the
items in §2, there aren't any. Most of the value is bug fixes, security, and
the resource loader rewrite.

---

## 5. References

- [jsdom v28.0.0 release notes](https://github.com/jsdom/jsdom/releases/tag/v28.0.0)
- [jsdom v29.0.0 release notes](https://github.com/jsdom/jsdom/releases/tag/v29.0.0)
- [WHATWG fetch — bad port list](https://fetch.spec.whatwg.org/#port-blocking)
- [undici issue #4743 — WebSocket throttling regression](https://github.com/nodejs/undici/issues/4743)
