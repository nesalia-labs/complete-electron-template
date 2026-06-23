import { z } from 'zod';
import { type SettingDefinition } from '../settings/index.js';
/**
 * Minimal interface the settings oRPC procedures need from the store.
 *
 * `apps/desktop/src/main/settings.ts` (PR 1 stub, electron-store in PR 3)
 * implements this. Keeping the surface narrow lets us swap implementations
 * without touching the procedures.
 */
export interface AppStore {
    /** Snapshot of all stored settings (for `getSettings` with no keys). */
    get store(): Record<string, unknown>;
    /** Typed get for a single key. */
    get<K extends string>(key: K): unknown;
    /** Typed set for a single key. */
    set<K extends string>(key: K, value: unknown): void;
}
/**
 * Settings oRPC procedures.
 *
 * Two procedures:
 *   - `getSettings({ keys? })` — read from the store (or registry defaults)
 *   - `updateSetting({ key, value })` — validate against the registry schema
 *     and persist. Refuses globalDb-backed keys (PR 4 owns those).
 *
 * Follows the closure factory pattern: the store is closed over by each
 * handler. No `os.$context`.
 */
export declare function createSettingsRoutes(store: AppStore): {
    getSettings: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodOptional<z.ZodObject<{
        keys: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>, import("@orpc/server").Schema<Record<string, unknown>, Record<string, unknown>>, Record<never, never>, Record<never, never>>;
    updateSetting: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        key: z.ZodString;
        value: z.ZodUnknown;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        success: boolean;
        key: string;
        value: unknown;
    }, {
        success: boolean;
        key: string;
        value: unknown;
    }>, Record<never, never>, Record<never, never>>;
};
export type { SettingDefinition };
//# sourceMappingURL=settings.d.ts.map