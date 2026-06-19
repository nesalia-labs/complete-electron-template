#!/usr/bin/env node
/**
 * Wipe local SQLite database files inside the repo (dev mode only).
 *
 * Targets: apps/desktop/data/ (the dev SQLite file used when running
 *           `pnpm dev:desktop`).
 *           apps/desktop/release/ (electron-builder output, may contain
 *           a packaged SQLite file).
 *
 * Does NOT touch production userData (which lives outside the repo, e.g.
 *   - Windows: %APPDATA%/complete-electron-template/data/
 *   - macOS:   ~/Library/Application Support/complete-electron-template/data/
 *   - Linux:   ~/.config/complete-electron-template/data/
 * ).
 *
 * Idempotent. Safe to re-run.
 */
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const TARGETS = [
  { path: 'apps/desktop/data', desc: 'dev SQLite data file' },
  { path: 'apps/desktop/release', desc: 'electron-builder output' }
]

async function main() {
  console.log('=== Resetting local SQLite databases ===\n')
  console.log('  Scope: files inside this repo only.')
  console.log('  Production userData (outside the repo) is NOT touched.\n')

  let removed = 0
  let skipped = 0

  for (const { path: target, desc } of TARGETS) {
    const fullPath = join(ROOT, target)
    if (existsSync(fullPath)) {
      await rm(fullPath, { recursive: true, force: true })
      console.log(`  ✓ ${target}/  (${desc})`)
      removed++
    } else {
      console.log(`  - ${target}/  (not present)`)
      skipped++
    }
  }

  console.log(`\n  ${removed} removed, ${skipped} already clean`)
  console.log('\n✓ Reset complete')
  console.log('  Next step: pnpm dev:desktop (a fresh empty database will be created at boot).')
}

main().catch((err) => {
  console.error('✗ Reset failed:', err)
  process.exit(1)
})