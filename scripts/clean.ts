/**
 * Remove build artifacts from all workspaces.
 *
 * Targets: every package's `dist/` and electron-vite's `out/`.
 * Does NOT touch: node_modules/ (use pnpm install to refresh), .git/, drizzle/ (committed migrations).
 *
 * Idempotent. Safe to re-run.
 */
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const TARGETS = [
  'packages/db/dist',
  'packages/api/dist',
  'packages/sdk/dist',
  'apps/web/dist',
  'apps/desktop/out'
]

async function main(): Promise<void> {
  console.log('=== Cleaning build artifacts ===\n')

  let removed = 0
  let skipped = 0

  for (const target of TARGETS) {
    const path = join(ROOT, target)
    if (existsSync(path)) {
      await rm(path, { recursive: true, force: true })
      console.log(`  ✓ ${target}/`)
      removed++
    } else {
      skipped++
    }
  }

  console.log(`\n  ${removed} removed, ${skipped} already clean`)
  console.log('\n✓ Clean complete')
  console.log('  Note: node_modules/ was NOT touched. Run "pnpm install" if you need to refresh.')
}

main().catch((err: unknown) => {
  console.error('✗ Clean failed:', err)
  process.exit(1)
})