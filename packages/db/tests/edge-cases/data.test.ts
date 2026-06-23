import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { users } from '../../src/schema/index.js'
import { createDBTestContext, type DBTestContext } from '../helpers.js'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('edge case data', () => {
  it('handles unicode in user names (CJK, emoji, latin diacritics)', () => {
    const [row] = ctx.handle.db
      .insert(users)
      .values({ name: '日本ユーザー 😀 éàü' })
      .returning()
      .all()
    expect(row?.name).toBe('日本ユーザー 😀 éàü')
  })

  it('handles very long names (1000 chars)', () => {
    const longName = 'a'.repeat(1000)
    const [row] = ctx.handle.db.insert(users).values({ name: longName }).returning().all()
    expect(row?.name).toBe(longName)
    expect(row?.name.length).toBe(1000)
  })

  it('handles SQL-like characters safely (parameterized, no injection)', () => {
    const evil = "'; DROP TABLE users; --"
    const [row] = ctx.handle.db.insert(users).values({ name: evil }).returning().all()
    expect(row?.name).toBe(evil)

    // The table must still exist with exactly this row.
    const all = ctx.handle.db.select().from(users).all()
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe(evil)
  })

  it('accepts empty string for name (no min length constraint)', () => {
    const [row] = ctx.handle.db.insert(users).values({ name: '' }).returning().all()
    expect(row?.name).toBe('')
  })
})