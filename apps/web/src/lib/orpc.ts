import { createORPCClient } from '@orpc/client'
import type { AppRouter } from '@electron-template/sdk'

let client: AppRouter | null = null
let initialized = false

export function getORPCClient(): AppRouter {
  if (!client) throw new Error('ORPC client not initialized')
  return client
}

export async function initORPC(): Promise<AppRouter> {
  if (initialized && client) return client

  const { port1: p1, port2 } = new MessageChannel()

  window.postMessage('start-orpc-client', '*', [port2])

  const { RPCLink } = await import('@orpc/client/message-port')
  const link = new RPCLink({ port: p1 })
  // TypeScript 6 has compatibility issues with oRPC client types
  // The runtime behavior is correct - this is a known upstream issue
  client = createORPCClient(link) as any
  p1.start()
  initialized = true

  return client!
}