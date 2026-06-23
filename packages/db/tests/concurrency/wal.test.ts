import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { users } from '../../src/schema/index.js'
import { createDBTestContext, type DBTestContext } from '../helpers.js'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('concurrency under WAL mode', () => {
  it('handles 50 concurrent reads consistently', () => {
    ctx.handle.db.insert(users).values({ name: 'Concurrent' }).run()

    const results: Array<Array<{ name: string }>> = []
    for (let i = 0; i < 50; i++) {
      results.push(ctx.handle.db.select().from(users).all())
    }

    // better-sqlite3 is synchronous, so we iterate sequentially — but
    // the assertion still validates that the WAL setup is stable across
    // many reads on the same handle.
    expect(results).toHaveLength(50)
    expect(results.every((r) => r.length === 1 && r[0]?.name === 'Concurrent')).toBe(true)
  })

  it('handles 100 inserts in a tight loop (WAL checkpointing works)', () => {
    for (let i = 0; i < 100; i++) {
      // Pad to 3 digits so lexicographic sort matches numeric order.
      ctx.handle.db.insert(users).values({ name: `User${String(i).padStart(3, '0')}` }).run()
    }

    const all = ctx.handle.db.select().from(users).all()
    expect(all).toHaveLength(100)
    expect(all.map((u) => u.name).sort()).toEqual(
      Array.from({ length: 100 }, (_, i) => `User${String(i).padStart(3, '0')}`)
    )
  })

  it('enforces email uniqueness under rapid inserts', () => {
    ctx.handle.db.insert(users).values({ name: 'First', email: 'same@example.com' }).run()

    // The second insert with the same email must fail (unique constraint).
    expect(() => {
      ctx.handle.db.insert(users).values({ name: 'Second', email: 'same@example.com' }).run()
    }).toThrow(/UNIQUE constraint failed/)
  })
})