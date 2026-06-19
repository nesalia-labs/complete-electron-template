# jsdom 28.0.0 — Changelog

> **Release date:** 2026-03-15
> **Source:** <https://github.com/jsdom/jsdom/releases/tag/v28.0.0>

This is the first jsdom release with a **rewritten resource loader API** and
the beginning of a series of behavior changes that align more closely with
browsers. The 28.x line keeps the same Node.js minimum as 27.x; the Node bump
arrives in 29.0.0.

---

## Breaking changes

### Resource loading customization API overhaul

The 27.x `resourceLoader` constructor option — a callback-based function —
has been replaced with a Promise-returning `ResourceLoader` class. Any custom
implementation from v27 must be rewritten.

Before (v27, callback API):

```js
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: (resource, callback) => {
    if (resource.url.pathname === '/api/user') {
      callback(null, Buffer.from(JSON.stringify({ id: 1 })));
      return;
    }
    resource.defaultFetch(callback);
  },
});
```

After (v28+, Promise API):

```js
import { JSDOM, ResourceLoader } from 'jsdom';

class ApiStub extends ResourceLoader {
  fetch(url, options) {
    if (new URL(url).pathname === '/api/user') {
      return Promise.resolve(Buffer.from(JSON.stringify({ id: 1 })));
    }
    return super.fetch(url, options);
  }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: new ApiStub(),
});
```

Key differences:

- The option is now an **instance** of `ResourceLoader`, not a function.
- The hook method is `fetch(url, options): Promise<Buffer>`.
- Falling back to the default network stack is `super.fetch(url, options)`.
- Synchronous XHR is **not** intercepted (this matches browsers).

### WebSocket per-origin throttling regression

Due to an upstream `undici` bug
([nodejs/undici#4743](https://github.com/nodejs/undici/issues/4743)),
WebSocket connections in jsdom 28 are no longer correctly limited to one per
origin. Tests that assert on this throttling will silently regress. No jsdom
workaround exists; either pin to v27 or wait for the upstream fix.

---

## New features

### MIME type sniffing on iframe and frame loads

Iframes and frames now sniff MIME types, fixing long-standing bugs where a
misconfigured `Content-Type` header would silently degrade a subdocument into
an HTML view.

### XHR and WebSocket interception via the new resource loader

`XMLHttpRequest` fetches and WebSocket upgrade requests now flow through the
new `ResourceLoader.fetch()` hook. This is the primary reason the loader was
rewritten — it makes mocking network calls in tests dramatically simpler.

Decoding fix for `<a>` and `<area>` query components in non-UTF-8 documents:

```js
// v27: query components in ISO-8859-1 documents could be mis-decoded
// v28: decoded correctly per the document's encoding
const dom = new JSDOM(html, { contentType: 'text/html; charset=ISO-8859-1' });
```

### `ArrayBuffer` / typed array snapshotting

`ArrayBuffer` and typed array instances passed to jsdom APIs are now properly
**snapshotted** rather than aliased. Mutations on the caller's side are no
longer visible to jsdom (and vice versa).

### Document referrer now tracks the initiating page

The document `referrer` now reflects the page that initiated navigation, not
the last redirect hop. This matches browser behavior.

```js
// Page A -> 302 -> Page B -> 302 -> Page C
// v27: document.referrer on Page C == Page B (last redirect)
// v28: document.referrer on Page C == Page A (initiator)
```

### `load` instead of `error` on non-OK HTTP

`<iframe>`, `<frame>`, and `<img>` elements (when `canvas` is installed) now
fire `load` events instead of `error` events when the underlying HTTP response
is non-OK. Update any tests asserting on the old behavior:

```js
// v27: error event fired on 404 image
// v28: load event fires; check status via image.naturalWidth === 0
```

### Resolved `url.parse()` deprecation warning

Using a WebSocket no longer triggers a `require('url').parse()` deprecation
warning. Test setups with `process.on('warning')` handlers that asserted on a
clean warning list will now stay clean.

### Numerous `XMLHttpRequest` fixes

A long tail of XHR bugs was closed in 28.0.0. If you have XHR-heavy tests that
behaved inconsistently across runs, retry them against 28 before reporting
regressions.

---

## Deprecations

The legacy 27.x resource loader API (the callback function passed to the
`resources` constructor option) is effectively removed in favor of the
`ResourceLoader` subclass. No deprecation period is documented — the API is
gone in 28.

---

## Migration tips from 27.4.0

1. **Review the new resource loading API** in the README. Any custom resource
   loader from v27 needs to be rewritten as a `ResourceLoader` subclass with a
   `fetch(url, options): Promise<Buffer>` method.
2. **WebSocket throttling**: if your tests rely on per-origin throttling,
   expect degraded behavior until the upstream `undici` issue is fixed.
   Consider pinning to v27 if this is critical.
3. **URL parsing + WebSockets**: the resolved `url.parse()` deprecation
   warning means behavior may have shifted; tests that previously asserted on
   the warning should be updated to assert on the absence of the warning.
4. **`error` event listeners on `<iframe>` / `<frame>` / `<img>`**: switch
   to `load` event listeners and inspect `naturalWidth`/`naturalHeight` (or
   the equivalent for frames) to detect non-OK responses.

---

## Source

<https://github.com/jsdom/jsdom/releases/tag/v28.0.0>
