import { builtInSettings } from './built-in.js';
/**
 * Build a settings registry from a list of entries.
 *
 * The order of `defs` is preserved — `groups()` returns groups in the order
 * they first appear. This drives the sub-nav order.
 */
export function createSettingsRegistry(defs) {
    const entries = Object.freeze([...defs]);
    const byKey = new Map();
    for (const entry of entries) {
        byKey.set(entry.key, entry);
    }
    const groupOrder = [];
    const groupSeen = new Set();
    for (const entry of entries) {
        if (!groupSeen.has(entry.group)) {
            groupSeen.add(entry.group);
            groupOrder.push(entry.group);
        }
    }
    return {
        entries,
        find(key) {
            return byKey.get(key);
        },
        groups() {
            return [...groupOrder];
        },
        byGroup(group) {
            return entries.filter((e) => e.group === group);
        },
        validate(key, value) {
            const entry = byKey.get(key);
            if (!entry) {
                return {
                    ok: false,
                    error: { message: `Unknown setting: ${key}` }
                };
            }
            if ('source' in entry && entry.source === 'globalDb') {
                return {
                    ok: false,
                    error: {
                        message: `Setting "${key}" is globalDb-backed; use its dedicated procedure instead.`
                    }
                };
            }
            const def = entry;
            const result = def.schema.safeParse(value);
            if (!result.success) {
                return { ok: false, error: result.error };
            }
            return { ok: true, value: result.data };
        }
    };
}
/**
 * The singleton registry with built-in entries.
 *
 * Consumers (PR 3) will create their own registry with `builtInSettings` spread
 * with app-specific entries — they should NOT mutate this singleton.
 */
export const settingsRegistry = createSettingsRegistry(builtInSettings);
//# sourceMappingURL=registry.js.map