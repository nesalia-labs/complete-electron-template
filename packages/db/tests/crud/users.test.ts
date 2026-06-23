import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '../../src/schema/index.js'
import { createDBTestContext, type DBTestContext } from '../helpers.js'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('CRUD on users', () => {
  it('starts empty (test isolation)', () => {
    const rows = ctx.handle.db.select().from(users).all()
    expect(rows).toEqual([])
  })

  it('insert returns the new row via .returning()', () => {
    const [row] = ctx.handle.db
      .insert(users)
      .values({ name: 'Alice', email: 'alice@example.com' })
      .returning()
      .all()

    expect(row).toBeDefined()
    expect(row?.name).toBe('Alice')
    expect(row?.email).toBe('alice@example.com')
    expect(typeof row?.id).toBe('number')
  })

  it('insert without email stores null', () => {
    const [row] = ctx.handle.db.insert(users).values({ name: 'Bob' }).returning().all()
    expect(row?.email).toBeNull()
  })

  it('select with where() finds the row', () => {
    const [created] = ctx.handle.db
      .insert(users)
      .values({ name: 'Carol' })
      .returning()
      .all()

    const found = ctx.handle.db.select().from(users).where(eq(users.id, created!.id)).get()
    expect(found?.name).toBe('Carol')
  })

  it('delete with where() removes the row', () => {
    const [created] = ctx.handle.db
      .insert(users)
      .values({ name: 'Dave' })
      .returning()
      .all()

    ctx.handle.db.delete(users).where(eq(users.id, created!.id)).run()

    const remaining = ctx.handle.db.select().from(users).all()
    expect(remaining).toHaveLength(0)
  })

  it('delete is a no-op (does not throw) for a missing id', () => {
    expect(() => {
      ctx.handle.db.delete(users).where(eq(users.id, 9999)).run()
    }).not.toThrow()
  })

  it('createdAt defaults to a Date instance', () => {
    const [row] = ctx.handle.db.insert(users).values({ name: 'TimeTest' }).returning().all()
    expect(row?.createdAt).toBeInstanceOf(Date)
  })
})