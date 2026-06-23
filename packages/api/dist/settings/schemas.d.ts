import { z } from 'zod';
/**
 * Zod schemas for the 4 built-in settings.
 *
 * These are intentionally narrow (no `.default()`) — defaults live on each
 * `SettingDefinition` entry so the registry stays the single source of truth.
 * `electron-store` will pick the schema defaults from the registry at wiring
 * time (PR 3).
 */
export declare const languageSchema: z.ZodEnum<{
    en: "en";
    fr: "fr";
    es: "es";
}>;
export declare const themeSchema: z.ZodEnum<{
    light: "light";
    dark: "dark";
    system: "system";
}>;
export declare const sidebarCollapsedSchema: z.ZodBoolean;
//# sourceMappingURL=schemas.d.ts.map