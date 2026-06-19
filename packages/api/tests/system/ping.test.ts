import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('system routes', () => {
  it('ping returns the expected pong', async () => {
    const result = await ctx.client.ping({ message: 'hello' })
    expect(result).toBe('pong: hello')
  })

  it('ping preserves unicode input', async () => {
    const result = await ctx.client.ping({ message: '日本 😀 éàü' })
    expect(result).toBe('pong: 日本 😀 éàü')
  })

  it('ping preserves empty string', async () => {
    const result = await ctx.client.ping({ message: '' })
    expect(result).toBe('pong: ')
  })
})