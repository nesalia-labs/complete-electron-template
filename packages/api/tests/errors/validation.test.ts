import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('error paths — Zod input validation', () => {
  it('rejects ping with non-string message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(ctx.client.ping({ message: 123 as any })).rejects.toThrow()
  })

  it('rejects ping with missing message field', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(ctx.client.ping({} as any)).rejects.toThrow()
  })

  it('rejects createUser with missing required name', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(ctx.client.createUser({ email: 'x@y.com' } as any)).rejects.toThrow()
  })

  it('rejects getUserById with non-numeric id', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(ctx.client.getUserById({ id: 'abc' as any })).rejects.toThrow()
  })
})