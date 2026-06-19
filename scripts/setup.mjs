#!/usr/bin/env node
/**
 * Bootstrap a fresh checkout of complete-electron-template.
 *
 * - pnpm install (all workspaces)
 * - drizzle-kit generate (creates the SQL migration files in packages/db/drizzle/)
 *
 * Idempotent. Safe to re-run.
 */
import { execSync } from 'node:child_process'

function run(cmd, label) {
  console.log(`\n[${label}] ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
}

console.log('=== complete-electron-template setup ===\n')

try {
  run('pnpm install', '1/2 install')
  run('pnpm --filter @electron-template/db db:generate', '2/2 generate migrations')
} catch (err) {
  console.error('\n✗ Setup failed. See the error above.')
  process.exit(err.status ?? 1)
}

console.log('\n✓ Setup complete')
console.log('  Next steps:')
console.log('    pnpm dev:desktop   # launch Electron in dev mode')
console.log('    pnpm -r typecheck  # verify everything compiles')
console.log('    pnpm -r test       # run the test suites')