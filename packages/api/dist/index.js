export { createRouter } from './routes/index.js';
// Settings registry and schemas are exposed via the sub-path
// `@electron-template/api/settings` — not the main entry. See CLAUDE.md for
// the rationale (renderer-safe exception). Consumers:
//   - main process (electron-store wiring): `import { settingsRegistry, ... } from '@electron-template/api/settings'`
//   - renderer (UI auto-gen in PR 3):     `import { builtInSettings, ... }  from '@electron-template/api/settings'`
//# sourceMappingURL=index.js.map