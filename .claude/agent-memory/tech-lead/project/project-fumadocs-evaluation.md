---
name: project-fumadocs-evaluation
description: Fumadocs evaluated 2026-06-22 as candidate docs framework for the template. Strong architectural fit but adoption blocked on 4 open questions; spike recommended before committing.
metadata:
  type: project
---

Fumadocs was deep-researched on 2026-06-22 (21 sources, 96 claims, 25 verified via 3-vote adversarial, 6 killed) as a candidate docs layer for `apps/web` or a new `packages/docs/`. Source: see deep-research workflow result for the day.

**Why we evaluated it:** Template needs a docs framework that composes with TanStack Start + Vite + Tailwind 4 + shadcn. Fumadocs is the only major React docs framework that officially supports TanStack Start (alongside Next.js, Waku, React Router).

**How to apply:** Use the verdict below before recommending Fumadocs in future conversations. Do NOT recommend adoption until the 4 open questions are resolved. Default to the spike pattern in "Recommended next step" when evaluating similar docs-framework candidates.

## Verdict (medium confidence — synthesis, not a verified sub-claim)

**Strong fit** for the template's stack:
- Officially supports TanStack Start (same framework `apps/web` uses)
- Same shadcn-style CLI fork ownership pattern the template already commits to for `packages/ui`
- Three composable layers (UI + Core + Content Source) ship as independent npm packages — composes cleanly into the monorepo
- Framework-agnostic Core; only the integration layer is per-framework
- Headless Core + themeable UI = same architecture ethos as the template's Radix + shadcn split

## Key non-obvious facts (kill-worthy misconceptions)

These were refuted by verification — DO NOT re-litigate them:

- ❌ **"Fumadocs is Next.js-only / Next.js-locked"** — KILLED 0-3. Officially supports TanStack Start, Waku, React Router. Next.js is first-among-equals, not required.
- ❌ **"Requires Next.js 16 + Tailwind 4 as foundation"** — KILLED 0-3.
- ❌ **"Server-first, React Server Components-based"** — KILLED 1-2. Core is framework-agnostic, not RSC-locked.
- ❌ **"Custom content sources tightly coupled to Next.js renderer"** — KILLED 0-3. Loader API + Low-Level API are framework-agnostic.

## Architecture (for context — what each layer does)

- **UI** (`fumadocs-ui`) — default theme; components (Accordion, Auto Type Table, Code Block) + layouts (Docs, Home, Notebook, Flux). Use as-is or fork locally via `npx @fumadocs/cli add <component>`.
- **Core** (`fumadocs-core`, ~304K weekly downloads) — headless docs logic, navigation, search integration. Framework-agnostic.
- **Content Source** (`fumadocs-mdx`, official) — MDX processing layer. Built-in MDX properties: `frontmatter`, `toc`, `structuredData` (for search), `extractedReferences` (href analysis). Targets Next.js / Vite / Runtime Loader.
- **Page tree** — central nav data structure passed to DocsLayout, drives sidebar/breadcrumb/footer.
- **Canonical MDX flow** — MDX in `content/docs` → compiled by `fumadocs-mdx` (ESM-only) → `.source/` folder generated at build/dev time.

## Open questions blocking adoption

1. **TanStack Start production maturity** — manual-install page exists, but real-world large docs sites on TanStack Start (vs the huge Next.js ecosystem) are less visible. Adoption signal unclear.
2. **MDX build performance in Vite/TanStack-Start path** — `.source` folder generation has NOT been validated against pnpm workspace monorepo caching. Could blow up incremental builds.
3. **CSS variable / theme token collisions** — Fumadocs UI and shadcn both ship Tailwind theme variables. Running both in the same app could cause cascade conflicts. Must verify before merging.
4. **Paid alternative parity** — Mintlify, ReadMe, Docusaurus, Starlight, Nextra all have features (hosting, analytics, OpenAPI rendering, search quality, MDX extensions) that Fumadocs may or may not match. Worth a head-to-head if hosting/analytics are desired.

## Recommended next step (spike, ~half a day)

1. Initialize `packages/docs/` as a pnpm workspace package with Fumadocs on TanStack Start.
2. Port one or two existing docs pages (or stub).
3. Validate: build perf, hydration, Tailwind 4 token compat with shadcn, search, dev-server hot reload.
4. Report back with results on the 4 open questions before any architectural commitment.

## Companion context

- See [[project-monorepo-structure]] for the workspace layout Fumadocs would compose into.
- See [[project-logging-state]] for the unrelated audit done the same day — both came out of an idle-window research burst.