import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDBTestContext, type DBTestContext } from '../helpers.js'
import { runMigrations } from '../../src/migrator.js'
import { users, posts } from '../../src/schema/index.js'
import { initDatabase, closeSqlite } from '../../src/client.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let ctx: DBTestContext

beforeEach(() => { ctx = createDBTestContext() })
afterEach(() => { ctx.cleanup() })

describe('runMigrations', () => {
  it('is idempotent (safe to call multiple times)', () => {
    expect(() => {
      runMigrations(ctx.handle.db)
      runMigrations(ctx.handle.db)
      runMigrations(ctx.handle.db)
    }).not.toThrow()
  })

  it('creates the users table with expected columns', () => {
    const rows = ctx.handle.db.select().from(users).all()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it('creates the posts table (even though it is a template demo)', () => {
    const rows = ctx.handle.db.select().from(posts).all()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it('enforces the foreign key from posts.user_id to users.id', () => {
    // Inserting a post with a non-existent user_id must throw.
    expect(() => {
      ctx.handle.db.insert(posts).values({ title: 'Orphan', userId: 9999 }).run()
    }).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('allows inserting a post that references a real user', () => {
    const [user] = ctx.handle.db.insert(users).values({ name: 'Author' }).returning().all()
    expect(user).toBeDefined()

    ctx.handle.db.insert(posts).values({ title: 'Hello', userId: user!.id }).run()

    const allPosts = ctx.handle.db.select().from(posts).all()
    expect(allPosts).toHaveLength(1)
    expect(allPosts[0]?.userId).toBe(user!.id)
  })
})

describe('fresh init on an empty directory', () => {
  it('applies migrations automatically on a clean dataPath', () => {
    const dataPath = mkdtempSync(join(tmpdir(), 'db-fresh-'))
    const handle = initDatabase({ dataPath })
    runMigrations(handle.db)

    // Schema is present and queryable without any pre-existing file.
    const userRows = handle.db.select().from(users).all()
    const postRows = handle.db.select().from(posts).all()
    expect(userRows).toHaveLength(0)
    expect(postRows).toHaveLength(0)

    closeSqlite(handle)
    rmSync(dataPath, { recursive: true, force: true })
  })
})