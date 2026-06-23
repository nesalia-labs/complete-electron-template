import type { RegistryEntry } from '@electron-template/api/settings'

/**
 * Add your app's custom settings here. Each entry is a `SettingDefinition`
 * (or `GlobalDbEntry` for globalDb-backed values). The settings page
 * auto-generates from this list + the built-in entries.
 *
 * Example:
 *   export const appSettings: RegistryEntry[] = [
 *     {
 *       key: 'editorFontSize',
 *       group: 'editor',
 *       schema: z.number().min(8).max(32),
 *       default: 14,
 *       labelKey: 'settings.fields.editorFontSize',
 *       descriptionKey: 'settings.fields.editorFontSizeDescription',
 *       control: { type: 'number' }
 *     }
 *   ]
 */
export const appSettings: Array<RegistryEntry> = []
