# IPC Contract — Main ↔ Renderer Architecture

**Date:** 2026-06-22
**Status:** Active
**Owner:** Tech Lead
**Related code:** `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `apps/web/src/lib/orpc.ts`

---

## Context

Electron apps have two main process types: the **main** process (Node, full system access) and the **renderer** process (Chromium, sandboxed, runs the web app). Communication between them crosses a process boundary and is the primary attack surface. The wrong pattern leaks Node into the renderer (defeating `contextIsolation`); the right pattern treats the boundary like a network — typed, validated, and minimal.

This template chose an unusual transport: `MessagePort` forwarded through a single IPC channel, with oRPC as the protocol layer. This ADR records why, what's allowed, and what the contract looks like.

---

## Decision

### Transport: `MessagePort` over `ipcRenderer.invoke`

Standard Electron IPC uses `ipcRenderer.invoke(channel, ...args)` from the renderer and `ipcMain.handle(channel, handler)` in main. We use `MessagePort` instead, forwarded through a single one-shot IPC channel:

```
Renderer                                Main
────────                                ────
new MessageChannel()
  ├─ port1 → RPCLink
  └─ port2 ──── postMessage ────►  preload: event.ports[0]
                                          │
                                          └─ ipcRenderer.postMessage ──► main: event.ports[0]
                                                                          │
                                                                          └─ RPCHandler.upgrade(port)
```

**Why not plain `ipcRenderer.invoke`?**

| Concern | `ipcRenderer.invoke` | `MessagePort` + oRPC |
|---|---|---|
| Type safety | Manual per-channel | End-to-end via Zod schemas |
| Procedure count | N channels, N handlers | 1 channel, 1 upgrade |
| Streaming | Not supported | Native (port is duplex) |
| Validation | Manual per-handler | Centralized in oRPC router |
| Schema drift | Silent (no compile-time check) | Compile-time (Zod + TS) |
| Refactor cost | O(N) handlers | O(1) router registration |

`ipcRenderer.invoke` is fine for 1-2 ad-hoc calls. Once you have 5+ procedures, the boilerplate compounds and you end up reinventing oRPC badly. The template ships with 4 procedures (`ping`, `createUser`, `getUsers`, `getUserById`, `deleteUser`) and is structured to grow — so we paid the MessagePort setup cost once.

### Preload: the only contextBridge surface

The preload script (`apps/desktop/src/preload/index.ts`) is the **sole** bridge between renderer and main. It does exactly two things:

1. **Forward the MessagePort** from the renderer's `postMessage` to the main process via `ipcRenderer.postMessage('start-orpc-server', null, [port])`.
2. **Origin-allowlist the source** of the `postMessage` event (only `http://127.0.0.1:5173`).

That is all. The preload does **not** expose any contextBridge surface, does **not** add `window.electron.*` methods, does **not** call `ipcRenderer.invoke` for ad-hoc channels. As of 2026-06-22, after C2 was resolved, the preload is 17 lines.

### Origin allowlist: `http://127.0.0.1:5173` (dev) and `file://` (prod)

The renderer's `postMessage` to the preload can come from any frame in any origin. The preload checks `event.origin` against `ALLOWED_ORIGIN` and drops mismatches with a `console.warn`. This prevents a compromised renderer (or a malicious iframe) from impersonating the app and triggering the IPC upgrade.

For production (when `app.isPackaged` is true), the renderer is loaded via `loadFile(join(__dirname, '../renderer/index.html'))`, so the origin becomes `file://`. The allowlist currently only matches the dev origin — a follow-up should add a `file://` branch (or remove the check entirely in production, since `file://` has no cross-origin confusion risk).

### oRPC contract: Zod-first

Every procedure in `packages/api/src/routes/` follows the same shape:

```ts
const getUserById = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => {
    return db.select().from(users).where(eq(users.id, input.id)).get()
  })
```

- `.input(z.X)` is mandatory for every procedure that takes arguments. Zero-arg procedures omit it.
- The return type is inferred from the handler and propagated through `AppRouter` → `@electron-template/sdk` → `apps/web/src/lib/orpc.ts` (the oRPC client).
- Schemas are the single source of truth. Changing the schema is a type error in any consumer.

The `AppRouter` type is exported from `packages/api/src/index.ts` and re-exported from `packages/sdk/src/index.ts` for consumers. The web app imports `AppRouter` to type its oRPC client; the desktop main process imports the `createRouter` factory to register handlers.

---

## Consequences

### Positive

- **One channel, one handler, one type chain.** Adding a new procedure means: write a Zod schema, write a handler, import the procedure in `routes/index.ts`. No new IPC channel, no new contextBridge surface, no new `ipcMain.handle`.
- **Type safety across the process boundary.** The renderer's `client.getUserById({ data: { id: 42 } })` is type-checked at compile time. The server's `input.id` is typed as `number`. A schema mismatch is a build error, not a runtime error.
- **No contextBridge attack surface.** With zero exposed methods, there's nothing for the renderer to call outside the oRPC contract. The blast radius of a renderer compromise is the oRPC surface (which is already validated and schema-typed).
- **Streaming-ready.** If a future procedure needs to push events (file download progress, log streaming, etc.), the MessagePort is already duplex. No new IPC pattern to learn.

### Negative

- **Higher setup cost than `ipcRenderer.invoke` for trivial cases.** A single ad-hoc ping is more code with MessagePort. The cost amortizes at ~3+ procedures.
- **Coupling to oRPC.** The template is committed to oRPC as the protocol. Swapping to tRPC, gRPC-Web, or a custom JSON-RPC layer would require rewriting `apps/web/src/lib/orpc.ts` and the main process's `RPCHandler` setup.
- **No browser-extension-style isolation.** The renderer's `postMessage` is checked for origin, but any code in the renderer (including a compromised npm dep) can call the oRPC client. The oRPC procedures themselves are the trust boundary.
- **No request-level auth.** Any code in the renderer can call any procedure. For a single-user desktop app this is fine. If the template ever grows multi-user or remote-renderer features, the oRPC layer would need a session/auth middleware.

### Operational

- Adding a procedure: edit `packages/api/src/routes/<domain>/index.ts`, export from `routes/index.ts`. The web app picks it up automatically via the typed `AppRouter`.
- Removing a procedure: delete it. TypeScript will flag any consumer that was using it. Safe to deploy.
- Renaming a procedure: rename + find/replace in consumers. TypeScript enforces.

---

## The contract, summarized

| Layer | Contract |
|---|---|
| Renderer → Preload | `postMessage('start-orpc-client', '*', [port])` from `http://127.0.0.1:5173` (dev) or `file://` (prod, not yet enforced). |
| Preload → Main | `ipcRenderer.postMessage('start-orpc-server', null, [serverPort])` after origin check. |
| Main → oRPC | `RPCHandler(router, { interceptors: [onError(...)] }).upgrade(serverPort)` then `serverPort.start()`. |
| Renderer → oRPC | `RPCLink({ port: port1 })` + `createORPCClient(link)` (cast `as any` to work around a TS 6 type friction with the generic). |
| Procedure → Procedure | Zod input schema + handler return type, both end-to-end typed via `AppRouter`. |

---

## Forbidden patterns

These are anti-patterns that will be rejected in code review:

- `contextBridge.exposeInMainWorld('electron', ...)` for any purpose other than the MessagePort forwarder.
- `ipcRenderer.invoke` / `ipcRenderer.send` / `ipcMain.handle` / `ipcMain.on` for ad-hoc channels. All IPC goes through oRPC.
- Calling `electron.remote` (deprecated and disabled in this template anyway).
- `webPreferences.nodeIntegration: true` (currently `false`; the relaxation is `sandbox: false` + CSP, not Node re-integration).
- Trusting `event.origin` in the preload without an explicit allowlist.
- Skipping `.input(z.X)` on a procedure. Every input is validated.

---

## Verification

After any change to the IPC layer:

- `pnpm --filter @electron-template/api typecheck` — schemas resolve.
- `pnpm --filter web typecheck` — the renderer's oRPC client types match the router.
- `pnpm run dev:desktop` — click "Test Ping" in the demo route; the terminal should show no preload errors and the oRPC `ping` procedure should return `pong: hello`.
- `grep -E 'contextBridge|exposeInMainWorld' apps/desktop/src/preload/` — should return zero matches. The preload exposes nothing.

## Future work

- **Production origin allowlist:** add a `file://` branch (or remove the check entirely in packaged builds).
- **Request-level auth:** if multi-user or remote-renderer features are added, layer an auth middleware in the oRPC `interceptors`.
- **Procedure-level error reporting:** wire `oRPC`'s `onError` interceptor to a structured logger (M5 of the audit plan flagged this as a P2 — currently 3 `console.*` calls in main, no library).
