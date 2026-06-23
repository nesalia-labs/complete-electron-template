import type { z } from 'zod';
import { languageSchema, themeSchema, sidebarCollapsedSchema } from './schemas.js';
import type { SettingDefinition, GlobalDbEntry } from './registry.js';
/**
 * Built-in settings, registered automatically by `createSettingsRegistry([])`.
 *
 * `recentProjects` is a special-case entry: it has no Zod schema and no
 * electron-store default. Its value lives in `global.db` and is managed by
 * a separate procedure (PR 4). The registry still needs to know about it so
 * the sub-nav and `/settings/projects` view can render correctly.
 */
export declare const languageSetting: SettingDefinition<z.infer<typeof languageSchema>>;
export declare const themeSetting: SettingDefinition<z.infer<typeof themeSchema>>;
export declare const sidebarCollapsedSetting: SettingDefinition<z.infer<typeof sidebarCollapsedSchema>>;
export declare const recentProjectsSetting: GlobalDbEntry;
/**
 * The list of built-in settings, in registry order.
 * Consumers (PR 3) will spread their own app-settings.ts entries after this.
 */
export declare const builtInSettings: readonly [SettingDefinition<"en" | "fr" | "es">, SettingDefinition<"light" | "dark" | "system">, SettingDefinition<boolean>, GlobalDbEntry];
//# sourceMappingURL=built-in.d.ts.map