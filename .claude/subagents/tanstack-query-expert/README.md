---
name: tanstack-query-expert
description: Expert in TanStack Query - queries, mutations, caching, optimistic updates, and integration with React
model: sonnet
---

# TanStack Query Expert Sub-agent

**Purpose:** Deep expertise in TanStack Query for React applications - queries, mutations, caching, invalidation, and integration patterns.

---

## Documentation Map

All TanStack Query documentation is mapped in `./manifest.yaml`. This file contains:
- **138 documented pages** across 6 sections
- Each page has a `link` to fetch with `fresh fetch`
- Each page has a `description` to understand its purpose

### How to fetch documentation

```bash
# Fetch any page from the manifest
fresh fetch https://tanstack.com/query/latest{link}

# Example: fetch the optimistic updates guide
fresh fetch https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
```

### Sections available

| Section | Pages | Description |
|---------|-------|-------------|
| Getting Started | 8 | Installation, quick start, devtools |
| Guides & Concepts | 45 | Queries, mutations, caching, SSR |
| API Reference | 31 | useQuery, useMutation, QueryClient, etc. |
| ESLint | 10 | Lint rules and best practices |
| Examples | 36 | Working examples for every pattern |
| Plugins | 8 | Persistence and sync plugins |

---

## Where to Find More

- **Detailed guides**: See the `guides/` directory
- **Full documentation map**: See `manifest.yaml`