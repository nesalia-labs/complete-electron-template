/**
 * Summarize outdated packages across the workspace.
 *
 * Reads `pnpm -r outdated --json`, classifies each entry by severity
 * (major / minor / patch), prints a clean summary, and lists majors
 * (the ones that need attention) with the workspaces that depend on them.
 *
 * Usage:
 *   tsx scripts/outdated.ts            # summary only, exit 0
 *   tsx scripts/outdated.ts --strict   # exit 1 if any major bump available (CI mode)
 *
 * Exit codes:
 *   0 — no major bumps available (with --strict) / always (without --strict)
 *   1 — major bumps available (with --strict)
 */
import { execSync } from 'node:child_process'

interface SemverParts {
  maj: number
  min: number
  pat: number
}

interface DependentPackage {
  name: string
  location: string
}

interface OutdatedEntry {
  current: string
  latest: string
  wanted: string
  isDeprecated: boolean
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
  dependentPackages: DependentPackage[]
}

type OutdatedMap = Record<string, OutdatedEntry>

type Severity = 'major' | 'minor' | 'patch' | 'same'

interface OutdatedRow {
  name: string
  current: string
  latest: string
  wanted: string
  isDeprecated: boolean
  type: string
  dependents: string
}

function parseSemver(version: string): SemverParts {
  const [maj = 0, min = 0, pat = 0] = version.split('.').map((n) => parseInt(n, 10))
  return { maj, min, pat }
}

function classify(current: string, latest: string): Severity {
  const cur = parseSemver(current)
  const lat = parseSemver(latest)
  if (cur.maj !== lat.maj) return 'major'
  if (cur.min !== lat.min) return 'minor'
  if (cur.pat !== lat.pat) return 'patch'
  return 'same'
}

function runOutdated(): OutdatedMap {
  try {
    const stdout = execSync('pnpm -r outdated --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return JSON.parse(stdout) as OutdatedMap
  } catch (err) {
    // pnpm exits 1 when outdated packages exist — that's normal.
    const stdout = (err as { stdout?: Buffer | string }).stdout?.toString() ?? ''
    if (!stdout) {
      console.error((err as Error).message)
      process.exit(2)
    }
    try {
      return JSON.parse(stdout) as OutdatedMap
    } catch {
      console.error('Failed to parse pnpm outdated JSON output')
      process.exit(2)
    }
  }
}

function printBucket(label: string, list: OutdatedRow[]): void {
  if (list.length === 0) return
  console.log(`${label}:`)
  for (const pkg of list) {
    const deprecated = pkg.isDeprecated ? ' [DEPRECATED]' : ''
    console.log(`  ${pkg.name.padEnd(36)} ${pkg.current} → ${pkg.latest}${deprecated}`)
    if (pkg.dependents) {
      console.log(`    └─ used by: ${pkg.dependents}`)
    }
  }
  console.log('')
}

function main(): void {
  const entries = runOutdated()
  const packages = Object.entries(entries)

  if (packages.length === 0) {
    console.log('✓ All packages are up to date.')
    process.exit(0)
  }

  const buckets: Record<'major' | 'minor' | 'patch', OutdatedRow[]> = {
    major: [],
    minor: [],
    patch: []
  }

  for (const [name, info] of packages) {
    const severity = classify(info.current, info.latest)
    if (severity === 'same') continue

    const dependents = (info.dependentPackages ?? [])
      .map((p) => p.name)
      .join(', ')

    buckets[severity].push({
      name,
      current: info.current,
      latest: info.latest,
      wanted: info.wanted,
      isDeprecated: info.isDeprecated,
      type: info.dependencyType,
      dependents
    })
  }

  const total = buckets.major.length + buckets.minor.length + buckets.patch.length

  console.log(`=== Outdated packages: ${total} ===\n`)
  console.log(`  MAJOR (breaking):  ${buckets.major.length}`)
  console.log(`  MINOR (features):  ${buckets.minor.length}`)
  console.log(`  PATCH (fixes):     ${buckets.patch.length}\n`)

  printBucket('MAJOR updates (review breaking changes before bumping)', buckets.major)
  printBucket('MINOR updates (new features, backward-compatible)', buckets.minor)
  printBucket('PATCH updates (safe to bump)', buckets.patch)

  console.log('Run `pnpm -r outdated` for the full table including `wanted` resolution.')
  console.log('Run `pnpm -r update <pkg>` to bump a specific package.')

  const isStrict = process.argv.includes('--strict')
  if (isStrict && buckets.major.length > 0) {
    console.log(`\n✗ Strict mode: ${buckets.major.length} major bump(s) pending.`)
    process.exit(1)
  }
}

main()