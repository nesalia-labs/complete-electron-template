import { z } from 'zod'

/**
 * Zod schemas for the 4 built-in settings.
 *
 * These are intentionally narrow (no `.default()`) — defaults live on each
 * `SettingDefinition` entry so the registry stays the single source of truth.
 * `electron-store` will pick the schema defaults from the registry at wiring
 * time (PR 3).
 */

export const languageSchema = z.enum(['en', 'fr', 'es'])
export const themeSchema = z.enum(['light', 'dark', 'system'])
export const sidebarCollapsedSchema = z.boolean()

// Note: no `recentProjectsSchema` here — recentProjects is a `globalDb`-backed
// entry (see `built-in.ts`) and lives outside the electron-store.
