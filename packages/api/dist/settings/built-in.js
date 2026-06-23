import { languageSchema, themeSchema, sidebarCollapsedSchema } from './schemas.js';
/**
 * Built-in settings, registered automatically by `createSettingsRegistry([])`.
 *
 * `recentProjects` is a special-case entry: it has no Zod schema and no
 * electron-store default. Its value lives in `global.db` and is managed by
 * a separate procedure (PR 4). The registry still needs to know about it so
 * the sub-nav and `/settings/projects` view can render correctly.
 */
export const languageSetting = {
    key: 'language',
    group: 'general',
    schema: languageSchema,
    default: 'en',
    labelKey: 'settings.fields.language',
    descriptionKey: 'settings.fields.languageDescription',
    control: {
        type: 'select',
        options: [
            { value: 'en', labelKey: 'settings.languageOptions.en' },
            { value: 'fr', labelKey: 'settings.languageOptions.fr' },
            { value: 'es', labelKey: 'settings.languageOptions.es' }
        ]
    }
};
export const themeSetting = {
    key: 'theme',
    group: 'appearance',
    schema: themeSchema,
    default: 'system',
    labelKey: 'settings.fields.theme',
    descriptionKey: 'settings.fields.themeDescription',
    control: {
        type: 'cards',
        options: [
            { value: 'light', labelKey: 'settings.themeOptions.light' },
            { value: 'dark', labelKey: 'settings.themeOptions.dark' },
            { value: 'system', labelKey: 'settings.themeOptions.system' }
        ]
    }
};
export const sidebarCollapsedSetting = {
    key: 'sidebarCollapsed',
    group: 'appearance',
    schema: sidebarCollapsedSchema,
    default: false,
    labelKey: 'settings.fields.sidebarCollapsed',
    descriptionKey: 'settings.fields.sidebarCollapsedDescription',
    control: { type: 'switch' }
};
export const recentProjectsSetting = {
    key: 'recentProjects',
    group: 'projects',
    source: 'globalDb',
    render: 'project-list',
    placeholder: true,
    labelKey: 'settings.fields.recentProjects',
    descriptionKey: 'settings.fields.recentProjectsDescription'
};
/**
 * The list of built-in settings, in registry order.
 * Consumers (PR 3) will spread their own app-settings.ts entries after this.
 */
export const builtInSettings = [
    languageSetting,
    themeSetting,
    sidebarCollapsedSetting,
    recentProjectsSetting
];
//# sourceMappingURL=built-in.js.map