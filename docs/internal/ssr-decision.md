# SSR Deferral — Why We Don't Use TanStack Start

**Date:** 2026-06-22
**Status:** Active decision
**Owner:** Tech Lead
**Related code:** `apps/web/`, `apps/web/vite.config.ts`, `apps/desktop/electron.vite.config.ts`

---

## Context

This template was scaffolded with TanStack Start (`@tanstack/react-start` + `nitro` + `createStartHandler` + `createServerEntry`) listed as dependencies, and `ssr: true` declared in the auto-generated `routeTree.gen.ts`. However, the actual SSR runtime was never wired: no server entry, no `hydrateRoot` in the client, no TanStack Start Vite plugin. The result was a half-wired state where the type system claimed SSR was on but no SSR was actually happening — the app booted in pure CSR via `createRoot(...).render(...)`.

On 2026-06-22 a deep-dive audit confirmed the half-wiring and resolved it by removing SSR entirely. This ADR records the decision so future contributors understand why the deps are gone and when (if ever) to bring them back.

---

## Decision

**TanStack Start is removed from this template.** The web app is pure client-side React served by Vite. The Electron desktop app loads the built Vite output via `loadFile()` (or `loadURL()` to the Vite dev server during development).

What stays:
- `@tanstack/react-router` — file-based routing, loaders (client-side), code-splitting, type-safe params
- `@tanstack/router-plugin/vite` — the Vite plugin that regenerates `routeTree.gen.ts` on route file changes
- `@tanstack/react-router-devtools` + `@tanstack/react-devtools` — DX
- `@tanstack/devtools-vite` — Vite plugin for the dev devtools

What was removed:
- `@tanstack/react-start`
- `nitro`
- The `ssr: true` augmentation in `routeTree.gen.ts` (auto-removed when the Start plugin was no longer in scope)

---

## Why this template doesn't need SSR

The template's primary target is an **Electron desktop app**. The web app (`apps/web`) is the renderer process inside an Electron window. For that use case, every benefit of SSR is inapplicable:

| SSR benefit | Applies here? | Why not |
|---|---|---|
| SEO (crawlers see HTML) | No | Electron windows aren't indexed by search engines. |
| Faster first paint | No | Renderer loads from `http://127.0.0.1:5173` (dev) or `file://` (prod) — no network latency, no slow first byte. |
| Server-side auth gates | No | Auth would go through oRPC over IPC, not HTTP cookies/sessions. |
| Social sharing (OG tags) | No | An Electron window has no shareable URL. |
| Streaming progressive enhancement | No | There's no JS-disabled fallback to enhance — the app is JS-only by design. |
| Server functions (typed RPC) | No | We already have oRPC + MessagePort, which is the same architectural idea implemented idiomatically for Electron. |

The cumulative cost of SSR is real: a server runtime to deploy, hydration mismatch debugging, server/client boundary friction, a Nitro adapter decision per deploy target, and added complexity in CI/build.

---

## When to re-adopt SSR

If a downstream user forks this template to build a **public web app** (deployed to a domain, indexed by search engines, accessible without an Electron shell), they should re-add SSR. The migration path is documented by TanStack:

1. Add `tanstackStart()` to the Vite config (alongside the existing `tanstackRouter()`).
2. Create `src/server.ts` with `createStartHandler` + `defaultStreamHandler` + `createServerEntry`.
3. Replace `createRoot(...).render(...)` in `main.tsx` with `hydrateRoot(document, <StartClient router={getRouter()} />)`.
4. Choose a Nitro deployment target (Node, Cloudflare Workers, Vercel, Bun, Deno) and add the corresponding config.
5. Update CI: `build:web` should produce a Nitro bundle, not a static Vite output.

The TanStack Start docs at `https://tanstack.com/start/latest` cover each step in detail. The transition is additive — the existing TanStack Router setup is the substrate that Start extends, so the file-based routes, loaders, and type-safe params continue to work.

For users who only need server functions (typed RPC that runs on a server) without rendering HTML on the server, the `@tanstack/react-start` server functions can be used standalone. This is a smaller addition than full SSR and is worth considering if the template ever grows a backend service.

---

## Consequences

### Positive

- The dependency tree is smaller: `nitro` and `@tanstack/react-start` (with all their transitives — `start-client-core`, `start-server-core`, `start-plugin-core`, `start-fn-stubs`, `start-storage-context`) are gone. `pnpm-lock.yaml` shrinks by ~40 entries.
- The build is faster and the typecheck surface is smaller.
- No hydration mismatch debugging.
- The repo is honest: what the code says it does, it does.

### Negative

- Anyone who expected SSR (because they read the old `routeTree.gen.ts` or the old `package.json`) will be surprised. This ADR exists to prevent that surprise.
- If the template is forked for a public web deployment, the forker will need to add TanStack Start themselves. This is documented above.

### Operational

- The dev server runs faster and the route tree regenerates on file changes (previously broken: the Vite plugin was missing from the config).
- The standalone `pnpm dev:web` and `pnpm build:web` now work without the Electron wrapper. Previously they would have failed because the Vite aliases in `apps/web/vite.config.ts` were off by one `../` — fixed in the same commit.
