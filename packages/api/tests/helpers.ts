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
import { createRouter } from '../src/routes/index.js'

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

export function createTestContext(): TestContext {
  const dataPath = mkdtempSync(join(tmpdir(), 'orpc-int-'))
  const handle = initDatabase({ dataPath })
  runMigrations(handle.db)

  const router = createRouter(handle.db)

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
