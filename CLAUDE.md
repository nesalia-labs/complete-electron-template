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

- **Frontend**: React 19, Tailwind CSS v4, TanStack Start, TanStack Router
- **Desktop**: Electron 35, electron-vite
- **Database**: Drizzle ORM + better-sqlite3
- **IPC/RPC**: oRPC with MessagePort adapter
- **Styling**: Tailwind v4 (CSS-first configuration)

## Network Configuration

The desktop app renderer dev server and IPC communication use `127.0.0.1` (not `localhost`).
This is intentional: some networks block localhost resolution, causing ERR_CONNECTION_TIMED_OUT.
Using the explicit IP avoids this issue.

## Project Structure

```
complete-electron-template/
├── apps/
│   ├── desktop/      # Electron desktop application
│   └── web/          # Web application (TanStack Start)
├── packages/
│   └── sdk/           # Shared SDK package
├── docs/
│   ├── internal/     # Internal documentation
│   ├── learnings/     # Learning documents
│   ├── plans/         # Plan documents
│   └── reports/      # Report documents
└── .github/           # GitHub workflows
```