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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newClient = createORPCClient<any>(link)
  p1.start()
  initialized = true
  client = newClient

  return newClient
}