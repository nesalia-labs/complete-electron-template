# Security Posture — Electron Hardening

**Date:** 2026-06-22
**Status:** Active
**Owner:** Tech Lead
**Related code:** `apps/desktop/src/main/index.ts`

---

## Context

Electron apps ship a full Chromium renderer, which means any XSS or supply-chain attack against the renderer's HTML/JS has the same blast radius as a browser bug. The standard mitigations are:

1. **Process isolation** — `contextIsolation: true` + `nodeIntegration: false` keep the renderer's JS sandboxed from Node.
2. **OS sandbox** — `sandbox: true` runs the renderer in a Chromium sandbox with no OS-level access.
3. **Content-Security-Policy** — restricts what the renderer's HTML/JS can load, execute, and connect to.

This template intentionally relaxes **#2** (`sandbox: false` in `apps/desktop/src/main/index.ts`) because the preload script needs Node access for the `electron-toolkit` style helpers. That makes **#3** load-bearing: CSP is the compensating control.

Until 2026-06-22, no CSP was configured anywhere. The Electron runtime itself emits an `Insecure Content-Security-Policy` warning on every launch, which was visible in DevTools but easy to miss.

---

## Decision

Install a Content-Security-Policy header on every response via `session.defaultSession.webRequest.onHeadersReceived` in the main process. The policy is branched on `app.isPackaged`:

### Dev policy (`!app.isPackaged`)

```
default-src 'self' http://127.0.0.1:5173;
script-src 'self' http://127.0.0.1:5173 'unsafe-inline';
style-src 'self' http://127.0.0.1:5173 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173;
font-src 'self' data:;
object-src 'none';
base-uri 'none';
```

- `'unsafe-inline'` for `script-src` and `style-src` is required: Vite HMR injects inline `<script>` and `<style>` blocks for module reloading.
- `connect-src` includes `ws://127.0.0.1:5173` for the Vite HMR WebSocket.
- `object-src 'none'` blocks `<object>`, `<embed>`, `<applet>` — defense in depth against Flash-style attacks.
- `base-uri 'none'` prevents `<base>` tag injection that could redirect relative URLs.

### Prod policy (`app.isPackaged === true`)

```
default-src 'self' file:;
script-src 'self' file:;
style-src 'self' file: 'unsafe-inline';
img-src 'self' file: data:;
connect-src 'self' file:;
font-src 'self' file: data:;
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

- `script-src` has **no** `'unsafe-inline'` — the renderer is bundled, so no inline scripts should be needed.
- `style-src` keeps `'unsafe-inline'` because Tailwind v4 + shadcn inject `<style>` tags for dynamic theme variables. Tightening this requires either a nonce-based approach or refactoring the components to use `<style>` from a stylesheet.
- `form-action 'none'` and `frame-ancestors 'none'` tighten prod further (no form submissions, no embedding).
- `file:` scheme is required because the prod renderer loads via `loadFile()`.

### Future tightening (deferred)

1. **Drop `'unsafe-inline'` from `style-src` in prod** by refactoring shadcn components to use static stylesheets (or a nonce-based approach).
2. **Add a CSP report-uri** to catch violations in prod telemetry.
3. **Subresource Integrity (SRI)** for any future CDN-loaded assets (none today).

---

## Consequences

### Positive

- The Electron `Insecure Content-Security-Policy` warning is gone.
- XSS in the renderer is now contained: an attacker who injects `<script>` cannot exfiltrate via `fetch()` (blocked by `connect-src`), cannot load remote scripts (blocked by `script-src`), cannot inject `<iframe>` (blocked by `frame-ancestors`).
- Defense in depth: even if `sandbox: false` ever becomes `sandbox: true` or is removed entirely, CSP is the second line.

### Negative

- Any future feature that wants to load a third-party script, embed an iframe, or submit a form will need a CSP exception. The `object-src 'none'` and `frame-ancestors 'none'` are particularly strict.
- Tailwind v4 + shadcn currently rely on inline `<style>` tags for theme variables. If they ever switch to nonce-based injection, the prod `'unsafe-inline'` can be removed.
- The dev policy explicitly allows the dev server origin. If a developer runs the dev server on a different host/port, the CSP needs to be updated.

### Operational

- CSP violations appear in the renderer console and (with the `console-message` forwarder added 2026-06-22) in the terminal where `electron-vite dev` runs. This makes regressions immediately visible.
- The CSP string lives in code. Any change requires a code review. This is intentional — CSP is a security boundary, not a runtime configuration.

---

## Alternatives considered

1. **`webPreferences.contentSecurityPolicy`** — removed in Electron ~v20. No longer available.
2. **`<meta http-equiv="Content-Security-Policy">` in the renderer's HTML** — works, but is weaker (some directives like `frame-ancestors` are ignored in meta tags, and meta-CSP can be bypassed if the attacker can inject before the meta tag).
3. **`session.fromPartition()` per-window with `webRequest`** — gives per-window CSP, but we have only one window. Session-level is simpler and applies to any future windows automatically.
4. **No CSP** — the previous state. Rejected: the `sandbox: false` relaxation makes this unsafe. The `Insecure Content-Security-Policy` warning Electron emits is the runtime agreeing.

---

## Verification

After the change is deployed:

- `pnpm dev:desktop` launches without the `Insecure Content-Security-Policy` warning.
- DevTools → Network → click the document → Response Headers → `Content-Security-Policy` is present with the dev policy.
- The page renders normally (no CSP violations in the console or terminal).
- `pnpm build:desktop` then launching the packaged app shows the prod policy in DevTools.

If CSP violations appear (e.g., a third-party script blocked), the violation message in the terminal will name the blocked resource. Fix by either (a) removing the resource, (b) relaxing the relevant directive, or (c) using a nonce.
