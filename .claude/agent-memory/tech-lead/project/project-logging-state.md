---
name: project-logging-state
description: Logging in the template is junior-grade — 3 console.* calls, no library, no structure, no file sink. Audit verdict + highest-leverage improvement.
metadata:
  type: project
---

Logging in `complete-electron-template` is **junior-grade** as of 2026-06-22 (audit performed). The entire production logging surface is 3 `console.*` calls:

- `apps/desktop/src/main/index.ts:16` — `console.error('[RPCHandler error]', error)` (main)
- `apps/desktop/src/preload/index.ts:8` — `console.warn('Blocked postMessage from origin:', event.origin)`
- `apps/desktop/src/preload/index.ts:26` — `console.error(error)`

No logging at all in `packages/api`, `packages/db`, `packages/sdk`, `packages/ui`, `apps/web` (renderer/SSR). No `pino` / `winston` / `electron-log` — `consola`/`debug` are transitive deps only.

**Why:** Template is at the "three calls that survived an early prototype" stage. No logger module, no env gating, no file sink (`app.getPath('logs')` never written — packaged Windows users have no logs to read), no correlation id across renderer → main → API → DB.

**How to apply:**
- Single highest-leverage improvement = introduce `packages/logger/src/index.ts` (pino or thin `createLogger(scope)` wrapper) + wire into 3 paths: `RPCHandler.onError` at `apps/desktop/src/main/index.ts:15-17`, oRPC procedures at `packages/api/src/routes/users/index.ts`, DB lifecycle at `packages/db/src/client.ts:18-30, :32-39`. Add `app.getPath('logs')` file sink.
- Highest-risk gap right now: `wal_checkpoint(TRUNCATE)` failure at `packages/db/src/client.ts:34-37` is silently swallowed — no telemetry on WAL corruption.
- Any logging-related work should default to the 3-site minimal wiring first, not a broad refactor across all packages.