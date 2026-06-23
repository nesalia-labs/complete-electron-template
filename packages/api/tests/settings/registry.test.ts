import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { settingsRegistry } from '../../src/settings/index.js'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

describe('settings registry', () => {
  it('has 4 built-in entries', () => {
    expect(settingsRegistry.entries).toHaveLength(4)
  })

  it('groups are unique and ordered', () => {
    expect(settingsRegistry.groups()).toEqual(['general', 'appearance', 'projects'])
  })

  it('finds entries by key', () => {
    expect(settingsRegistry.find('language')?.key).toBe('language')
    expect(settingsRegistry.find('nonexistent')).toBeUndefined()
  })

  it('validates correct values', () => {
    expect(settingsRegistry.validate('language', 'fr').ok).toBe(true)
    expect(settingsRegistry.validate('theme', 'dark').ok).toBe(true)
  })

  it('rejects invalid values', () => {
    const r = settingsRegistry.validate('theme', 'invalid')
    expect(r.ok).toBe(false)
  })

  it('marks recentProjects as globalDb', () => {
    const entry = settingsRegistry.find('recentProjects')
    expect(entry).toBeDefined()
    expect(entry && 'source' in entry && entry.source).toBe('globalDb')
  })
})

describe('settings oRPC procedures — round-trip', () => {
  it('getSettings returns the full store with registry defaults', async () => {
    const result = await ctx.client.getSettings()
    expect(result).toMatchObject({
      version: 1,
      language: 'en',
      theme: 'system',
      sidebarCollapsed: false
    })
  })

  it('getSettings filters by keys', async () => {
    const result = await ctx.client.getSettings({ keys: ['language'] })
    expect(result).toEqual({ language: 'en' })
  })

  it('updateSetting persists and round-trips (write → read)', async () => {
    const update = await ctx.client.updateSetting({ key: 'language', value: 'fr' })
    expect(update).toMatchObject({ success: true, key: 'language', value: 'fr' })

    const all = await ctx.client.getSettings()
    expect(all).toMatchObject({ language: 'fr' })

    const filtered = await ctx.client.getSettings({ keys: ['language'] })
    expect(filtered).toEqual({ language: 'fr' })
  })

  it('updateSetting throws 404 for unknown key', async () => {
    await expect(
      ctx.client.updateSetting({ key: 'nonexistent', value: 1 })
    ).rejects.toThrow(/Unknown setting/)
  })

  it('updateSetting throws 400 for invalid value', async () => {
    await expect(
      ctx.client.updateSetting({ key: 'theme', value: 'invalid' })
    ).rejects.toThrow()
  })

  it('updateSetting rejects globalDb-backed keys', async () => {
    await expect(
      ctx.client.updateSetting({ key: 'recentProjects', value: ['x'] })
    ).rejects.toThrow(/globalDb/)
  })
})
