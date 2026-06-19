# jsdom 29.0.0 — Changelog

> **Release date:** 2026-03-15
> **Source:** <https://github.com/jsdom/jsdom/releases/tag/v29.0.0>

The 29.0.0 release lands on the same day as 28.0.0 but ships an independent
set of changes: a **Node.js minimum bump**, a **CSSOM dependency removal**, and
**fetch spec compliance** improvements. Together, 28 + 29 represent the bulk
of the work in the 29.x line.

---

## Breaking changes

### Node.js minimum version bumped

The minimum supported v22 version is now **v22.13.0** (previously v22.12.0+).
Node 20.x is no longer supported. If you are on Node 20, upgrade before
upgrading jsdom.

```bash
# Verify before upgrading
node --version
# expected: v22.13.0 or later
```

```jsonc
// package.json
{
  "engines": {
    "node": ">=22.13.0"
  }
}
```

If CI is on an older Node, `npm install` will fail with:

```
EBADENGINE  Unsupported engine { wanted: { node: '>=22.13.0' } }
```

### CSSOM dependency removal

`@acemir/cssom` and `cssstyle` are no longer transitive dependencies of
jsdom. They were replaced with fresh internal implementations built on
`webidl2js` wrappers and the `css-tree` parser.

If your code (or a transitive dependency) imports those packages through
jsdom's tree, you must now declare them explicitly:

```jsonc
// package.json — only needed if you (or a dep) import these directly
{
  "dependencies": {
    "jsdom": "^29.1.1",
    "@acemir/cssom": "^1.2.0",
    "cssstyle": "^4.0.1"
  }
}
```

Most test suites never import these packages directly and need no change.

### `CSSStyleRule.selectorText` setter now validates

Setting `selectorText` to an invalid value silently worked in v27 / v28. In
v29 it throws:

```js
const sheet = dom.window.document.styleSheets[0];
// v27/v28: silently accepts and stores broken selector
// v29: throws DOMException
sheet.cssRules[0].selectorText = '..bad';
```

If your code generates selectors dynamically, wrap assignments in a
try/catch.

### Stricter media query handling

`MediaList` now uses `css-tree` for proper parsing. Invalid media queries
fall back to `not all` instead of being naively comma-split:

```js
// v27: list parsed by splitting on commas, even for invalid tokens
// v29: parsed properly; invalid queries become 'not all'

const mq = dom.window.matchMedia('screen, :garbage');
// v29: list reflects proper media-query parsing
// query that does not match becomes 'not all'
```

---

## New features

### CSSOM overhaul

The CSSOM was rebuilt on `webidl2js` wrappers and `css-tree`. New behavior:

- New rules exposed on the `Window` object: `CSSCounterStyleRule`,
  `CSSNamespaceRule`.
- New getters on existing rules:
  - `CSSMediaRule.matches`
  - `CSSSupportsRule.matches`
  - `CSSKeyframeRule.keyText` (with validation)
  - `StyleSheet.ownerNode`
  - `StyleSheet.href`
  - `StyleSheet.title`

```js
const sheet = dom.window.document.styleSheets[0];
sheet.href; // populated from <link> or @import
sheet.title; // populated from <link title="...">
sheet.ownerNode; // the <link> or <style> element
```

### Security: bad-port blocking

jsdom now blocks fetches to commonly-abused ports per the [WHATWG fetch bad
port list](https://fetch.spec.whatwg.org/#port-blocking). Local tests that
hit restricted ports (e.g. `127.0.0.1:25`) will fail where they used to
succeed. Use an allowed port (3000, 8080, etc.) or configure your loader to
explicitly permit restricted ports.

```js
class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    // v29: this fetch is blocked at the loader layer because :25 is on the
    // fetch spec bad-port list.
    if (new URL(url).port === '25') {
      return Promise.reject(new Error('Bad port'));
    }
    return super.fetch(url, options);
  }
}
```

### Performance: lazy CSS selector engine init

The CSS selector engine is now lazily initialized, saving approximately
**0.5 ms per `Document`** (credit: @thypon). If you have a benchmark that
measured `JSDOM` startup time, expect a small speedup.

---

## Deprecations

`@acemir/cssom` and `cssstyle` are no longer transitive dependencies. If you
relied on them being available transitively, declare them as direct
dependencies — they are not deprecated as packages, just removed from jsdom's
dependency graph.

---

## Migration tips from 28.0.0

1. **Bump Node first**: upgrade to v22.13.0+ before installing jsdom 29.
   Update `engines.node` in `package.json` and the CI runner.
2. **Declare direct CSSOM deps** if you (or any dependency) imported
   `@acemir/cssom` or `cssstyle` through jsdom's tree. Add them as direct
   dependencies with explicit versions.
3. **Audit media-query parsing**: code that relied on naive comma-splitting
   will see different behavior. Switch to proper media-query logic.
4. **Validate selectors before assignment**: code that set
   `cssStyleRule.selectorText` to invalid values silently will now throw;
   validate before assignment or wrap in try/catch.
5. **Audit local test servers**: any test fetches to restricted ports (25,
   587, and others on the fetch bad-port list) will now be blocked. Use a
   port not on the list, or refactor the endpoint.

---

## Source

<https://github.com/jsdom/jsdom/releases/tag/v29.0.0>
