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