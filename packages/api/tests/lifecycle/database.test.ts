import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initDatabase,
  closeSqlite,
  runMigrations
} from '@electron-template/db'
import { users } from '@electron-template/db'
import { eq } from 'drizzle-orm'

function tmpDataPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('lifecycle — migrations', () => {
  it('runMigrations is idempotent (safe to call multiple times)', () => {
    const dataPath = tmpDataPath('mig-')
    const handle = initDatabase({ dataPath })

    expect(() => {
      runMigrations(handle.db)
      runMigrations(handle.db)
      runMigrations(handle.db)
    }).not.toThrow()

    // Schema is present and queryable.
    const rows = handle.db.select().from(users).all()
    expect(Array.isArray(rows)).toBe(true)

    closeSqlite(handle)
    rmSync(dataPath, { recursive: true, force: true })
  })
})

describe('lifecycle — close + reopen', () => {
  it('persists data across close + reopen (WAL checkpoint worked)', () => {
    const dataPath = tmpDataPath('reopen-')

    // First lifecycle: write, close.
    const h1 = initDatabase({ dataPath })
    runMigrations(h1.db)
    h1.db.insert(users).values({ name: 'Persisted' }).run()
    closeSqlite(h1)

    // Second lifecycle: reopen, read.
    const h2 = initDatabase({ dataPath })
    const rows = h2.db.select().from(users).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Persisted')

    closeSqlite(h2)
    rmSync(dataPath, { recursive: true, force: true })
  })

  it('preserves data after a long write burst and close', () => {
    const dataPath = tmpDataPath('burst-')
    const h = initDatabase({ dataPath })
    runMigrations(h.db)

    for (let i = 0; i < 100; i++) {
      h.db.insert(users).values({ name: `User${String(i).padStart(3, '0')}` }).run()
    }
    closeSqlite(h)

    const h2 = initDatabase({ dataPath })
    const rows = h2.db.select().from(users).all()
    expect(rows).toHaveLength(100)
    closeSqlite(h2)
    rmSync(dataPath, { recursive: true, force: true })
  })
})

describe('lifecycle — type preservation', () => {
  it('returns createdAt as a Date instance when read on the same handle', () => {
    const dataPath = tmpDataPath('date-')
    const h = initDatabase({ dataPath })
    runMigrations(h.db)

    const [created] = h.db
      .insert(users)
      .values({ name: 'TimeTest' })
      .returning()
      .all()
    expect(created?.createdAt).toBeDefined()

    // After write+read on the same handle, it's a Date (timestamp mode).
    const [read] = h.db.select().from(users).where(eq(users.id, created!.id)).all()
    expect(read?.createdAt).toBeInstanceOf(Date)

    closeSqlite(h)
    rmSync(dataPath, { recursive: true, force: true })
  })
})