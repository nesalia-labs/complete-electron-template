---
name: project-shadcn-monorepo-pattern
description: Established pattern for shadcn in this monorepo — CSS export must point to src/ (not dist/), and @source directives are required in both packages/ui globals.css and consumer stylesheets for Tailwind v4 to scan across workspace boundaries.
metadata:
  type: project
---

When shadcn is extracted into `packages/ui` (workspace package), the theme was not reaching the renderer in dev. Root cause + fix landed 2026-06-22, documented at `docs/plans/template-audit-remediation.md` section M6.

**Why:** The original setup pointed `"./styles/globals.css": "./dist/styles/globals.css"` in `packages/ui/package.json` and did not add `@source` directives. Two consequences: (a) in dev, the CSS export resolved to a non-existent `dist/` path; (b) Tailwind v4's content auto-detection from the Vite root (`apps/web/`) never reached `packages/ui/src/components/**/*.tsx`, so no utilities were generated for the shadcn components.

**How to apply:** When adding a new shadcn consumer (e.g., a future `apps/mobile` workspace) or when someone proposes coupling the CSS export to `dist/`, push back and require:
1. `packages/ui/package.json` → `"./styles/globals.css": "./src/styles/globals.css"` (source-level, not build artifact).
2. `@source "../**/*.{ts,tsx,js,jsx}";` in `packages/ui/src/styles/globals.css`.
3. `@source "../**/*.{ts,tsx}";` in the consumer's entry stylesheet.
4. Do not add a `cpSync` of `globals.css` into `dist/` in the build script.

**Reference:** [shadcn monorepo docs](https://ui.shadcn.com/docs/monorepo) — the official pattern. Also: `package.json#imports` is the modern alternative for package-local aliases; not currently used here but worth considering when the UI package grows.

Related: [[project-template-audit-2026-06-22]], [[project-monorepo-structure]], [[feedback-quality-bar]].
