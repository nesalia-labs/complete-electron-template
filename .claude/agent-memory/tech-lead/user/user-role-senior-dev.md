---
name: user-role-senior-dev
description: User is a senior TypeScript developer comfortable with Electron, oRPC, Drizzle, and modern JS ecosystem. Mixes French and English in conversation.
metadata:
  type: user
---

User is the maintainer of `complete-electron-template`, a senior-grade Electron + oRPC + Drizzle + TanStack Start monorepo. Comfortable with:

- Strict TypeScript 6.0 with `verbatimModuleSyntax`, `noUnusedLocals`, etc.
- ESM + pnpm workspaces
- Electron 35 internals (preload, MessagePortMain, lifecycle hooks)
- Drizzle ORM 0.45 + better-sqlite3
- oRPC 1.14 (message-port adapter, Context, $context)
- Architectural patterns: DI, factory closures, single source of truth

Speaks French primarily, comfortable with English technical terms. Don't translate technical terms unnecessarily.

Expects senior-level output: trade-off analysis, root-cause investigation, no shortcut hacks. Tolerates the TS 6 / oRPC `as any` workaround when properly documented (see `apps/web/src/lib/orpc.ts` and `packages/api/src/router.test.ts` for the accepted pattern).

Related: [[feedback-investigate-before-recommending]], [[project-db-refactor-state]].