import { os } from '@orpc/server'
import { z } from 'zod'

export function createSystemRoutes() {
  return {
    ping: os
      .input(z.object({ message: z.string() }))
      .handler(({ input }) => {
        return `pong: ${input.message}`
      })
  }
}
