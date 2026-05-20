# Complete Electron Template

A production-ready Electron application template with a modern tech stack and monorepo architecture.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TanStack Start, TanStack Router |
| Desktop | Electron 35, electron-vite, electron-builder |
| Database | Drizzle ORM + better-sqlite3 |
| IPC/RPC | oRPC with MessagePort adapter |
| Styling | Tailwind CSS v4 (CSS-first configuration) |
| Package Manager | npm workspaces |

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
└── .github/           # GitHub workflows (CI/CD)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
# Install all dependencies
npm install

# Build SDK first (required)
npm run build -w packages/sdk

# Build web app
npm run build -w apps/web
```

### Development

```bash
# Run web dev server
npm run dev -w apps/web

# Run desktop app
npm run dev -w apps/desktop
```

### Build

```bash
# Build SDK
npm run build -w packages/sdk

# Build web app
npm run build -w apps/web

# Build desktop app
npm run build -w apps/desktop
```

## CI/CD

The project uses GitHub Actions with a one-action-per-workflow philosophy:

| Workflow | Purpose |
|----------|---------|
| `lint-desktop.yml` | Lint desktop source code |
| `lint.yml` | Lint web source code |
| `typecheck-desktop.yml` | TypeScript check desktop |
| `typecheck.yml` | TypeScript check web |
| `build-desktop.yml` | Build desktop for release |
| `build.yml` | Build web app |

## Network Configuration

The desktop app uses `127.0.0.1` (not `localhost`) for dev server and IPC communication. Some networks block localhost resolution, causing `ERR_CONNECTION_TIMED_OUT`.

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines and context
- `docs/internal/` - Internal architecture documentation
- `docs/plans/` - Project plans and proposals