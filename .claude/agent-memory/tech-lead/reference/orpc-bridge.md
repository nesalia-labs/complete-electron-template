---
name: orpc-messageport-bridge
description: How Electron main process and renderer communicate via MessageChannel + IPC
type: reference
---

# oRPC MessagePort Bridge Pattern

**Pattern:** MessageChannel + postMessage + IPC forwarding

**Flow:**
1. **Renderer** (`apps/web/src/lib/orpc.ts`): Creates `MessageChannel`, sends `port2` via `postMessage('start-orpc-client', '*', [port2])`
2. **Preload** (`apps/desktop/src/preload/index.ts`): Intercepts the message, forwards port via `ipcRenderer.postMessage('start-orpc-server', null, [serverPort])`
3. **Main** (`apps/desktop/src/main/index.ts`): Receives port, calls `handler.upgrade(serverPort)` to connect oRPC handler

**Security:** Origin check in preload (`ALLOWED_ORIGIN = 'http://127.0.0.1:5173'`) blocks unauthorized postMessage.

**Key files:**
- `apps/desktop/src/preload/index.ts`
- `apps/web/src/lib/orpc.ts`
- `apps/desktop/src/main/index.ts`
- `packages/api/src/router.ts` (oRPC procedures)