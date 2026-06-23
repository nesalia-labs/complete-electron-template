import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('users routes — edge case data', () => {
  it('handles unicode in user names (CJK, emoji, latin diacritics)', async () => {
    const u = await ctx.client.createUser({ name: '日本ユーザー 😀 éàü' })
    expect(u.name).toBe('日本ユーザー 😀 éàü')
  })

  it('handles very long names (1000 chars)', async () => {
    const longName = 'a'.repeat(1000)
    const u = await ctx.client.createUser({ name: longName })
    expect(u.name).toBe(longName)
    expect(u.name.length).toBe(1000)
  })

  it('handles SQL-like characters safely (parameterized, no injection)', async () => {
    const evil = "'; DROP TABLE users; --"
    const u = await ctx.client.createUser({ name: evil })
    expect(u.name).toBe(evil)
    // The table must still exist with exactly this row.
    const users = await ctx.client.getUsers()
    expect(users).toHaveLength(1)
    expect(users[0].name).toBe(evil)
  })
})