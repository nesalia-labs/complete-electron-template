import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('users routes — isolation', () => {
  it('starts with an empty users table (test isolation)', async () => {
    const users = await ctx.client.getUsers()
    expect(users).toEqual([])
  })
})

describe('users routes — happy path', () => {
  it('createUser persists and returns the inserted row', async () => {
    const user = await ctx.client.createUser({ name: 'Alice', email: 'alice@example.com' })
    expect(user.name).toBe('Alice')
    expect(user.email).toBe('alice@example.com')
    expect(typeof user.id).toBe('number')
  })

  it('createUser without email returns null email (not undefined)', async () => {
    const user = await ctx.client.createUser({ name: 'NoEmail' })
    expect(user.email).toBeNull()
  })

  it('getUsers returns all created users', async () => {
    await ctx.client.createUser({ name: 'Bob' })
    await ctx.client.createUser({ name: 'Charlie' })
    const users = await ctx.client.getUsers()
    expect(users).toHaveLength(2)
    expect(users.map((u: { name: string }) => u.name).sort()).toEqual(['Bob', 'Charlie'])
  })

  it('getUserById returns the user when it exists', async () => {
    const created = await ctx.client.createUser({ name: 'Found' })
    const found = await ctx.client.getUserById({ id: created.id })
    expect(found?.name).toBe('Found')
  })

  it('getUserById returns undefined for a missing id', async () => {
    const result = await ctx.client.getUserById({ id: 999 })
    expect(result).toBeUndefined()
  })

  it('deleteUser removes the row', async () => {
    const created = await ctx.client.createUser({ name: 'Dave' })
    const { success } = await ctx.client.deleteUser({ id: created.id })
    expect(success).toBe(true)
    const remaining = await ctx.client.getUsers()
    expect(remaining).toHaveLength(0)
  })

  it('deleteUser is a no-op (does not throw) for a missing id', async () => {
    const { success } = await ctx.client.deleteUser({ id: 9999 })
    expect(success).toBe(true)
  })
})