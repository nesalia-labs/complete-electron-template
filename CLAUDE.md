# CLAUDE.md

Always respond in English.

This is a senior-level complete Electron application.

## Web Search

When performing web searches, you MUST use the `fresh` CLI tool. Never use other search methods.

### Fresh CLI Usage

```bash
# Search the web
fresh search "your search query"

# Fetch content from a specific URL
fresh fetch <url>
```

### Examples

```bash
# Search for React documentation
fresh search "React documentation 2026"

# Get content from a specific page
fresh fetch https://react.dev/docs
```

Available commands:
- `fresh auth` - Authentication commands
- `fresh search [options]` - Search the web using Exa.ai
- `fresh fetch [options] <url>` - Fetch and extract content from a URL

## Documentation Structure

- Internal documentation: `docs/internal/`
- Learnings: `docs/learnings/`
- Plans: `docs/plans/`
- Reports: `docs/reports/`

## CI/CD Philosophy

Each workflow file performs exactly **one action** (lint, typecheck, build, etc.).
This is intentional: when a CI run fails, agents can immediately identify which
workflow failed without parsing combined output. It improves debuggability for
both human and AI agents reviewing failure output.

## Tech Stack

**Year**: 2026 (current date)

### apps/web (TanStack Router SPA — no SSR)
| Tech | Version |
|------|---------|
| React | 19.2.4 |
| Tailwind CSS | 4.2.1 |
| TanStack Router | 1.167.4 |
| TanStack React Router DevTools | 1.166.9 |
| TanStack DevTools Vite | 0.7.0 |
| Vite | 7.3.1 |
| TypeScript | 6.0.3 |
| oRPC Client | 1.14.3 |
| Zod | 4.4.3 |
| i18next | 26.2.0 |
| Radix UI | 1.4.3 |
| Lucide React | 1.16.0 |
| Recharts | 3.8.0 |
| shadcn | 4.7.0 |
| Sonner | 2.0.7 |
| date-fns | 4.1.0 |

### apps/desktop (Electron Desktop App)
| Tech | Version |
|------|---------|
| Electron | 35.0.0 |
| electron-vite | 5.0.0 |
| electron-builder | 26.8.1 |
| TypeScript | 6.0.3 |
| ESLint | 10.4.0 |
| oRPC Client | 1.14.3 |
| oRPC Server | 1.14.3 |
| Zod | 4.4.3 |

### packages/api (oRPC Server Router)
| Tech | Version |
|------|---------|
| oRPC Server | 1.14.3 |
| Zod | 4.4.3 |
| drizzle-orm | 0.45.2 |
| @electron-template/db | workspace:* |

### packages/db (Drizzle ORM Database)
| Tech | Version |
|------|---------|
| Drizzle ORM | 0.45.2 |
| better-sqlite3 | 12.10.0 |
| drizzle-kit | 0.31.10 |

### packages/sdk (Shared SDK — type-only)
| Tech | Version |
|------|---------|
| @electron-template/api | workspace:* |

### packages/ui (shadcn components package)
| Tech | Version |
|------|---------|
| shadcn | 4.7.0 |
| Radix UI | 1.4.3 |
| Tailwind CSS | 4.2.1 |
| Lucide React | 1.16.0 |
| class-variance-authority | 0.7.1 |

### Build & CI
| Tech | Version |
|------|---------|
| pnpm | 9 (CI) |
| Vite | 7.3.1 |
| TypeScript | 6.0.3 |
| ESLint | 10.4.0 |
| Vitest | 3.2.4 |

## Network Configuration

The desktop app renderer dev server and IPC communication use `127.0.0.1` (not `localhost`).
This is intentional: some networks block localhost resolution, causing ERR_CONNECTION_TIMED_OUT.
Using the explicit IP avoids this issue.

## Issue Labels

GitHub issues use a structured label taxonomy:

### Type (color-coded)
- `type: bug` - Bug fix (red)
- `type: feature` - New feature (blue)
- `type: refactor` - Code refactoring (purple)
- `type: docs` - Documentation changes (gray)
- `type: security` - Security fix (black)

### Status (gray to green gradient)
- `status: triage` - Not yet reviewed by Tech Lead
- `status: needs-info` - Ticket incomplete, needs more info
- `status: ready` - Validated by Tech Lead, ready to pick up
- `status: in-progress` - Currently being worked on
- `status: in-review` - In code review
- `status: blocked` - Blocked by dependency or decision

### Priority (yellow to red gradient)
- `p0: critical` - Critical, stop everything and fix now
- `p1: high` - Required for next release
- `p2: medium` - Normal priority
- `p3: low` - Nice to have

### Effort (optional, for Tech Lead)
- `effort: xs` - Few minutes
- `effort: s` - Half a day
- `effort: m` - 1-2 days
- `effort: l` - A week or more (needs breakdown)

## Branching Strategy

Development workflow:
- `dev` - All development PRs merge here. This is the main development branch.
- `staging` - Pre-release testing branch.
- `main` - Production-ready code. Only releases merge here.

The flow `dev → staging → main` is managed by the **release manager**.

## Project Structure

```
complete-electron-template/
├── apps/
│   ├── desktop/                    # Electron desktop app
│   │   ├── electron.vite.config.ts
│   │   ├── electron-builder.json
│   │   ├── eslint.config.js
│   │   ├── package.json
│   │   ├── release/                # Release artifacts
│   │   ├── src/
│   │   │   ├── main/index.ts       # Main process entry
│   │   │   └── preload/index.ts    # Preload (MessagePort forwarder only)
│   │   └── tsconfig.json
│   │
│   └── web/                        # TanStack Router SPA (no SSR)
│       ├── index.html
│       ├── src/
│       │   ├── components/        # Local components (LanguageSwitcher, etc.)
│       │   ├── i18n/              # i18next setup + locales/
│       │   ├── lib/                # Utilities (orpc.ts)
│       │   ├── routes/             # TanStack Router file-based routes
│       │   ├── main.tsx            # CSR entry (createRoot + RouterProvider)
│       │   ├── router.tsx          # Router config
│       │   ├── routeTree.gen.ts    # Auto-generated route tree
│       │   └── styles.css          # Entry CSS (@source + globals.css)
│       ├── eslint.config.mjs
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── api/                        # oRPC server router
│   │   ├── src/
│   │   │   ├── index.ts           # Exports router + types
│   │   │   └── routes/             # oRPC procedures (system/, users/)
│   │   ├── drizzle.config.ts
│   │   ├── eslint.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                         # Drizzle ORM database layer
│   │   ├── src/
│   │   │   ├── client.ts          # initDatabase(), closeSqlite() — factory, no globals
│   │   │   ├── migrator.ts        # runMigrations()
│   │   │   ├── schema/            # Table definitions + $inferSelect/$inferInsert
│   │   │   └── index.ts           # Public surface
│   │   ├── drizzle/               # Generated SQL migrations (committed)
│   │   ├── drizzle.config.ts
│   │   ├── eslint.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                        # Type-only contract for renderer
│   │   ├── src/
│   │   │   ├── index.ts           # SDK exports
│   │   │   └── router.ts          # AppRouter type re-export
│   │   ├── eslint.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                        # shadcn components package
│       ├── src/
│       │   ├── components/        # shadcn components (button, input, card, etc.)
│       │   ├── hooks/
│       │   ├── lib/               # utils.ts, cn()
│       │   ├── styles/            # globals.css (@source + theme variables)
│       │   └── index.ts           # Public surface
│       ├── components.json
│       ├── eslint.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── internal/                  # ADRs (security, ipc-contract, ssr-decision)
│   ├── learnings/                 # Library notes + agent docs
│   ├── plans/                      # Migration + upgrade plans
│   └── reports/                    # Feasibility reports
│
├── .github/
│   └── workflows/                 # CI workflows (17 total)
│       ├── build-*.yml             # Build workflows
│       ├── lint-*.yml              # Lint workflows
│       ├── typecheck-*.yml         # Typecheck workflows
│       ├── test-*.yml              # Test workflows
│       ├── release-desktop.yml     # Desktop release
│       └── test-*.yml              # Integration tests
│
├── package.json                    # Root package.json
├── pnpm-workspace.yaml             # pnpm workspaces config
└── CLAUDE.md                       # This file
```