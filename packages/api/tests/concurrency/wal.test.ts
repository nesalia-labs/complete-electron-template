import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('concurrency under WAL mode', () => {
  it('handles 50 concurrent reads consistently', async () => {
    await ctx.client.createUser({ name: 'Concurrent' })

    const reads = await Promise.all(
      Array.from({ length: 50 }, () => ctx.client.getUsers())
    )

    expect(reads).toHaveLength(50)
    // All 50 reads see the same data — proves WAL + busy_timeout work.
    expect(reads.every(
      (r: Array<{ name: string }>) => r.length === 1 && r[0].name === 'Concurrent'
    )).toBe(true)
  })

  it('handles mixed concurrent reads and writes', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      ctx.client.createUser({ name: `User${String(i).padStart(3, '0')}` })
    )
    const reads = Array.from({ length: 10 }, () => ctx.client.getUsers())

    // 10 writes + 10 reads interleaved, all must complete without error.
    await Promise.all([...writes, ...reads])

    const final = await ctx.client.getUsers()
    expect(final).toHaveLength(10)
    expect(final.map((u: { name: string }) => u.name).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `User${String(i).padStart(3, '0')}`)
    )
  })
})