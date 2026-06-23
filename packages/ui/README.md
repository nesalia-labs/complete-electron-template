# `@electron-template/ui`

Shared shadcn/ui component library. Holds the 55 shadcn primitives + `cn()` helper + `useIsMobile` hook + shadcn CSS variables, consumed by `apps/web` (and any future consumer apps) via `@electron-template/ui/...` imports.

## Adding new components

**Run the shadcn CLI from this directory, not from a consumer app.**

```bash
cd packages/ui
npx shadcn@4.7.0 add <component-name>
```

The CLI installs the component into `src/components/` and updates `src/components/index.ts` automatically.

### Why from this directory?

shadcn CLI's path-resolution validation rejects cross-workspace aliases when invoked from a consumer app (see [shadcn-ui/ui#9239](https://github.com/shadcn-ui/ui/issues/9239)). Running from the package that owns the components sidesteps the validation — the CLI writes directly into `src/components/`, which is where the components belong.

Once a component is added here, consumers import it normally:

```tsx
import { Spinner } from "@electron-template/ui/components/spinner"
```

The `components.json` aliases in consumer apps (e.g., `apps/web/components.json`) tell shadcn *what import paths to write into files* — but the CLI uses those aliases for cross-workspace installs, which is where the bug bites. Run from the source, and the consumer's `components.json` never enters the picture for file routing.

## Local exports

| Path | What |
|---|---|
| `@electron-template/ui/components/<file>` | Individual component (preferred for tree-shaking) |
| `@electron-template/ui` | Root barrel — re-exports everything |
| `@electron-template/ui/lib/utils` | `cn()` helper |
| `@electron-template/ui/hooks/use-mobile` | `useIsMobile` hook |
| `@electron-template/ui/styles/globals.css` | shadcn CSS variables (load this in consumer's stylesheet) |

## Build

```bash
pnpm --filter @electron-template/ui build
```

Produces `dist/` with `.js` + `.d.ts` per source file, plus a barrel `dist/index.js`.

## Test the CLI

```bash
cd packages/ui
npx shadcn@4.7.0 add aspect-ratio --yes --overwrite
# → src/components/aspect-ratio.tsx
# → src/components/index.ts auto-updated
```

Then revert if just testing:

```bash
git checkout packages/ui/src/components/aspect-ratio.tsx packages/ui/src/components/index.ts
```

## See also

- `components.json` — shadcn CLI config for this package (package-side, not consumer-side)
- `tsconfig.json` — TS config with `@/*` paths for internal imports within this package
- `src/styles/globals.css` — shadcn CSS variables; consumers must import this for theme to work