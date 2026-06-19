import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { initDatabase, closeSqlite } from '../../src/client.js'
import { createDBTestContext, type DBTestContext } from '../helpers.js'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('initDatabase', () => {
  it('creates a database file at the configured path', () => {
    const dbPath = join(ctx.dataPath, 'database.sqlite')
    expect(existsSync(dbPath)).toBe(true)
  })

  it('returns an open SQLite handle', () => {
    expect(ctx.handle.sqlite.open).toBe(true)
    expect(ctx.handle.db).toBeDefined()
  })

  it('applies WAL journal mode', () => {
    expect(ctx.handle.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
  })

  it('enables foreign keys', () => {
    expect(ctx.handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('uses synchronous = NORMAL (safe with WAL)', () => {
    expect(ctx.handle.sqlite.pragma('synchronous', { simple: true })).toBe(1)
  })

  it('sets a non-zero busy_timeout (>= 1000ms)', () => {
    const timeout = ctx.handle.sqlite.pragma('busy_timeout', { simple: true })
    expect(typeof timeout).toBe('number')
    expect(timeout).toBeGreaterThanOrEqual(1000)
  })
})

describe('closeSqlite', () => {
  it('is safe to call once', () => {
    expect(() => closeSqlite(ctx.handle)).not.toThrow()
  })

  it('is idempotent (safe to call multiple times)', () => {
    expect(() => {
      closeSqlite(ctx.handle)
      closeSqlite(ctx.handle)
      closeSqlite(ctx.handle)
    }).not.toThrow()
  })
})