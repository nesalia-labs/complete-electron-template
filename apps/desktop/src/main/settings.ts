// Real persistent settings store — replaces the PR 1 InMemoryStore stub.
//
// We use `electron-store` (sindresorhus) which writes to
// `<userData>/settings.json` and is built on `conf`. It is:
//   - ESM-only (v11+) — default-imported with `import Store from 'electron-store'`.
//   - Node-only (uses `fs`) — must NEVER be imported from the renderer.
//   - JSON-Schema-typed for the `schema` option (Zod is NOT accepted); see note below.
//
// Wiring:
//   - `defaults` are derived from the registry (single source of truth).
//   - We deliberately do NOT pass a `schema` to electron-store, even though
//     `packages/api/src/settings/registry.ts` has Zod schemas per entry. Reason:
//     electron-store's `schema` option expects a JSON Schema object
//     (typed via `tsd`-generated types from `conf`), not a Zod schema.
//     We do not want to add `zod-to-json-schema` as a dependency for this PR
//     (out of scope: "No new dependencies except `electron-store`"). All
//     write-time validation already happens at the oRPC boundary in
//     `packages/api/src/routes/settings.ts` via `settingsRegistry.validate`,
//     so a second layer of validation at the disk layer would be redundant.
//     Trade-off: a bug in the oRPC handler could write a malformed value to
//     disk; in practice the optimistic update + onSettled invalidate keeps
//     the UI honest and the next launch re-validates on read.
//
// Migration (CF-5): the V1 InMemoryStore stub never wrote to disk, so a fresh
// install with no `settings.json` will inherit the defaults via electron-store
// on first read. For an existing user who somehow upgrades from a V1 era build
// (pre-electron-store), the constructor's `defaults` are merged on top of the
// stored data for any missing keys — so old partial values are preserved and
// new fields fill in.

import Store from 'electron-store'
import {
  settingsRegistry,
  type SettingDefinition
} from '@electron-template/api/settings'
import type { AppStore } from '@electron-template/api'

/** Build the `defaults` object for electron-store from the registry.
 *  Skips `globalDb`-backed entries (their values live in `global.db`). */
function buildDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = { version: 1 }
  for (const entry of settingsRegistry.entries) {
    if ('source' in entry && entry.source === 'globalDb') continue
    defaults[entry.key] = (entry as SettingDefinition).default
  }
  return defaults
}

const electronStore = new Store<Record<string, unknown>>({
  name: 'settings', // writes to <userData>/settings.json
  defaults: buildDefaults(),
  clearInvalidConfig: false // keep partial V1 data; defaults merge on top
})

/**
 * Adapt electron-store's `Store` to the narrow `AppStore` interface used by
 * the settings oRPC procedures (`packages/api/src/routes/settings.ts`).
 *
 * Why an adapter instead of passing the raw `Store` instance?
 * - The `AppStore` interface is the documented seam between main process and
 *   api package; keeping it stable lets us swap implementations (e.g. a
 *   test-only in-memory store) without touching the procedures.
 * - The renderer doesn't need store change events — TanStack Query handles
 *   invalidation via `onSettled` in `useUpdateSetting`.
 */
export const store: AppStore = {
  get store(): Record<string, unknown> {
    // electron-store returns a frozen snapshot — copy to keep the AppStore
    // contract (callers may mutate the returned object without affecting disk).
    return { ...electronStore.store }
  },
  get<K extends string>(key: K): unknown {
    return electronStore.get(key)
  },
  set<K extends string>(key: K, value: unknown): void {
    electronStore.set(key, value)
  }
}
