import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContext, type TestContext } from '../helpers.js'

let ctx: TestContext

beforeEach(() => { ctx = createTestContext() })
afterEach(() => { ctx.cleanup() })

/**
 * Round-trip tests for the `recent_projects` table via the oRPC procedures.
 *
 * Covers:
 *   - isolation (table starts empty)
 *   - happy path (touch → list → delete)
 *   - upsert behaviour (same projectId bumps opened_at + refreshes name)
 *   - ordering (newest first)
 *   - limit parameter (cap respected)
 *   - delete miss (NOT_FOUND surfaced as a rejected promise)
 *   - delete hit (success shape)
 */
describe('recent projects routes', () => {
  it('starts with an empty list (test isolation)', async () => {
    const list = await ctx.client.listRecentProjects({ limit: 10 })
    expect(list).toEqual([])
  })

  it('touchRecentProject persists a new row and list returns it', async () => {
    const row = await ctx.client.touchRecentProject({
      projectId: 'p1',
      projectName: 'Project One'
    })
    expect(row.projectId).toBe('p1')
    expect(row.projectName).toBe('Project One')
    expect(typeof row.id).toBe('number')
    expect(row.openedAt).toBeTruthy()

    const list = await ctx.client.listRecentProjects({ limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0].projectId).toBe('p1')
  })

  it('touchRecentProject is an upsert — same projectId refreshes name + bumps opened_at', async () => {
    const first = await ctx.client.touchRecentProject({
      projectId: 'p1',
      projectName: 'Old Name'
    })
    const firstOpenedAt = new Date(first.openedAt).getTime()

    // Force a clock gap so the bumped timestamp is strictly greater.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const second = await ctx.client.touchRecentProject({
      projectId: 'p1',
      projectName: 'New Name'
    })
    expect(second.id).toBe(first.id)
    expect(second.projectName).toBe('New Name')
    expect(new Date(second.openedAt).getTime()).toBeGreaterThan(firstOpenedAt)

    const list = await ctx.client.listRecentProjects({ limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0].projectName).toBe('New Name')
  })

  it('listRecentProjects returns rows in newest-first order', async () => {
    await ctx.client.touchRecentProject({ projectId: 'a', projectName: 'A' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await ctx.client.touchRecentProject({ projectId: 'b', projectName: 'B' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await ctx.client.touchRecentProject({ projectId: 'c', projectName: 'C' })

    const list = await ctx.client.listRecentProjects({ limit: 10 })
    expect(list.map((r: { projectId: string }) => r.projectId)).toEqual(['c', 'b', 'a'])
  })

  it('listRecentProjects respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.client.touchRecentProject({
        projectId: `p${i}`,
        projectName: `Project ${i}`
      })
      // small gap so opened_at is strictly increasing
      await new Promise((resolve) => setTimeout(resolve, 2))
    }

    const limited = await ctx.client.listRecentProjects({ limit: 3 })
    expect(limited).toHaveLength(3)
    expect(limited.map((r: { projectId: string }) => r.projectId)).toEqual([
      'p4',
      'p3',
      'p2'
    ])
  })

  it('deleteRecentProject removes a matching row and returns success', async () => {
    await ctx.client.touchRecentProject({ projectId: 'p1', projectName: 'P1' })
    const result = await ctx.client.deleteRecentProject({ projectId: 'p1' })
    expect(result).toEqual({ success: true, projectId: 'p1' })

    const list = await ctx.client.listRecentProjects({ limit: 10 })
    expect(list).toEqual([])
  })

  it('deleteRecentProject rejects with NOT_FOUND for an unknown projectId', async () => {
    await expect(
      ctx.client.deleteRecentProject({ projectId: 'never-existed' })
    ).rejects.toThrow()
  })
})