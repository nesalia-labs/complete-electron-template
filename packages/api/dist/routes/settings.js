import { os, ORPCError } from '@orpc/server';
import { z } from 'zod';
import { settingsRegistry } from '../settings/index.js';
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
export function createSettingsRoutes(store) {
    const getSettings = os
        .input(z
        .object({
        keys: z.array(z.string()).optional()
    })
        .optional())
        .handler(({ input }) => {
        const all = store.store;
        if (input?.keys && input.keys.length > 0) {
            return Object.fromEntries(input.keys.map((k) => [k, all[k]]));
        }
        return all;
    });
    const updateSetting = os
        .input(z.object({
        key: z.string(),
        value: z.unknown()
    }))
        .handler(({ input }) => {
        const entry = settingsRegistry.find(input.key);
        if (!entry) {
            throw new ORPCError('NOT_FOUND', {
                message: `Unknown setting: ${input.key}`
            });
        }
        if ('source' in entry && entry.source === 'globalDb') {
            throw new ORPCError('BAD_REQUEST', {
                message: `Use projects.updateRecent for globalDb-backed settings`
            });
        }
        const result = settingsRegistry.validate(input.key, input.value);
        if (!result.ok) {
            const message = 'message' in result.error && typeof result.error.message === 'string'
                ? result.error.message
                : `Invalid value for setting "${input.key}"`;
            throw new ORPCError('BAD_REQUEST', { message });
        }
        store.set(input.key, result.value);
        return { success: true, key: input.key, value: result.value };
    });
    return { getSettings, updateSetting };
}
//# sourceMappingURL=settings.js.map