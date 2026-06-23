import type { ZodType, ZodError } from 'zod';
/**
 * The settings registry — the single source of truth for the Settings UI.
 *
 * Lives in `packages/api` so both the renderer (via `@electron-template/api`
 * sub-path) and the main process can import it. Module is Drizzle-free so
 * Vite tree-shakes correctly when imported into the renderer bundle.
 *
 * Two entry kinds:
 *   - `SettingDefinition` — real, electron-store-backed entry with Zod schema
 *   - `GlobalDbEntry`     — placeholder for settings whose value lives in
 *                            `global.db` (e.g. `recentProjects`); no schema
 */
export type SettingGroup = 'general' | 'appearance' | 'projects' | (string & {});
export type SettingSource = 'store' | 'globalDb';
export type ControlType = 'select' | 'cards' | 'switch' | 'number' | 'text' | 'project-list';
export interface ControlOptions {
    options?: Array<{
        value: string;
        labelKey: string;
    }>;
}
export interface SettingDefinition<T = unknown> {
    /** Unique key, e.g. `'language'`. Used by electron-store and oRPC procedures. */
    key: string;
    /** Section in the sub-nav. */
    group: SettingGroup;
    /** Zod schema for validation. */
    schema: ZodType<T>;
    /** Default value. Must satisfy `schema`. */
    default: T;
    /** i18n key for the visible label. */
    labelKey: string;
    /** i18n key for the help/description text. */
    descriptionKey: string;
    /** How the UI should render this setting. */
    control: {
        type: ControlType;
    } & ControlOptions;
}
export interface GlobalDbEntry {
    key: string;
    group: SettingGroup;
    source: 'globalDb';
    /** Hint to the renderer for how to render this entry. */
    render: 'project-list' | (string & {});
    /** Marks this entry as a UI-only placeholder. Its value is not in the store. */
    placeholder: true;
    labelKey: string;
    descriptionKey: string;
}
export type RegistryEntry = SettingDefinition | GlobalDbEntry;
export type ValidateResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: ZodError | {
        message: string;
    };
};
export interface SettingsRegistry {
    readonly entries: readonly RegistryEntry[];
    find(key: string): RegistryEntry | undefined;
    groups(): SettingGroup[];
    byGroup(group: SettingGroup): RegistryEntry[];
    validate(key: string, value: unknown): ValidateResult<unknown>;
}
/**
 * Build a settings registry from a list of entries.
 *
 * The order of `defs` is preserved — `groups()` returns groups in the order
 * they first appear. This drives the sub-nav order.
 */
export declare function createSettingsRegistry(defs: readonly RegistryEntry[]): SettingsRegistry;
/**
 * The singleton registry with built-in entries.
 *
 * Consumers (PR 3) will create their own registry with `builtInSettings` spread
 * with app-specific entries — they should NOT mutate this singleton.
 */
export declare const settingsRegistry: SettingsRegistry;
//# sourceMappingURL=registry.d.ts.map