import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MessageChannel } from 'node:worker_threads'
import { RPCHandler } from '@orpc/server/message-port'
import { RPCLink } from '@orpc/client/message-port'
import { createORPCClient } from '@orpc/client'
import {
  initDatabase,
  closeSqlite,
  runMigrations,
  type DatabaseHandle
} from '@electron-template/db'
import { createRouter, type AppStore } from '../src/routes/index.js'
import { settingsRegistry, type SettingDefinition } from '../src/settings/index.js'

/**
 * Per-test context: an isolated DB + MessageChannel + oRPC client.
 * Mirrors exactly the IPC primitives Electron uses between renderer and main.
 */
export interface TestContext {
  dataPath: string
  handle: DatabaseHandle
  // TypeScript 6 has compatibility issues with oRPC client types
  // (see apps/web/src/lib/orpc.ts for the established pattern).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  cleanup: () => void
}

/**
 * Build an in-memory store that satisfies `AppStore`, seeded with registry
 * defaults for non-globalDb entries. The desktop uses a real electron-store
 * (see `apps/desktop/src/main/settings.ts`), but for hermetic tests we don't
 * want to touch the user's `<userData>/settings.json`. The shape matches
 * `AppStore` so the same oRPC procedure code paths run as in production.
 */
function createInMemoryStore(): AppStore {
  const data: Record<string, unknown> = { version: 1 }
  for (const entry of settingsRegistry.entries) {
    if ('source' in entry && entry.source === 'globalDb') continue
    data[entry.key] = (entry as SettingDefinition).default
  }
  return {
    get store() {
      return { ...data }
    },
    get(key) {
      return data[key]
    },
    set(key, value) {
      data[key] = value
    }
  }
}

export function createTestContext(): TestContext {
  const dataPath = mkdtempSync(join(tmpdir(), 'orpc-int-'))
  const handle = initDatabase({ dataPath })
  runMigrations(handle.db)

  const store = createInMemoryStore()
  const router = createRouter(handle.db, store)

  const channel = new MessageChannel()
  const serverPort = channel.port1
  const clientPort = channel.port2

  const handler = new RPCHandler(router)
  handler.upgrade(serverPort)
  serverPort.start()

  const link = new RPCLink({ port: clientPort })
  clientPort.start()

  // TypeScript 6 has compatibility issues with oRPC client types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createORPCClient(link) as any

  return {
    dataPath,
    handle,
    client,
    cleanup: () => {
      try { closeSqlite(handle) } catch { /* idempotent */ }
      try { rmSync(dataPath, { recursive: true, force: true }) } catch { /* idempotent */ }
      try { clientPort.close() } catch { /* idempotent */ }
      try { serverPort.close() } catch { /* idempotent */ }
    }
  }
}
