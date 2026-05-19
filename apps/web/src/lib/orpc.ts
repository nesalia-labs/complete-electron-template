import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { AppRouter } from '@electron-template/sdk'

let client: AppRouter | null = null
let link: RPCLink | null = null
let port1: MessagePort | null = null
let initialized = false

export function getORPCClient(): AppRouter {
  return client as AppRouter
}

export async function initORPC(): Promise<AppRouter> {
  if (initialized && client) return client

  const { port1: p1, port2 } = new MessageChannel()

  port1 = p1
  window.postMessage('start-orpc-client', '*', [port2])

  link = new RPCLink({ port: p1 })
  client = createORPCClient<link, AppRouter>(link)
  p1.start()
  initialized = true

  return client
}