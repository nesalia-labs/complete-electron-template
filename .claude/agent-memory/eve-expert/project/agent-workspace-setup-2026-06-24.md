---
name: agent-workspace-setup-2026-06-24
description: Setup notes for making the agent/ directory a pnpm workspace member and Vercel-deployable eve app. Covers the eve@0.13.3 / ai@7.0.0-beta.178 peer pin, Node 24 requirement, and pre-existing scaffold issues surfaced on first run.
metadata:
  type: project
---

The `agent/` directory in `complete-electron-template` is configured as a pnpm
workspace member named `@electron-template/agent` and an eve framework app
target for Vercel Root Directory = `agent`.

## Workspace wiring (3 files)

- `pnpm-workspace.yaml` adds literal `'agent'` (not a glob) alongside
  `apps/*` and `packages/*`. Literal entry is required so pnpm treats it as
  a workspace root with its own `node_modules/`.
- `agent/package.json` mirrors `@electron-template/api`'s shape
  (`type: module`, `private: true`, `version: 1.0.0`). Scripts:
  `dev/build/start/info/deploy/link` (all `eve <cmd>`) + `typecheck`
  (`tsc --noEmit`).
- `agent/tsconfig.json` mirrors `apps/desktop/tsconfig.json` but with
  `include: ["**/*"]` (NOT `["agent/**/*"]` — the tsconfig is co-located
  inside `agent/`, so include is relative to itself) and `noEmit: true`.
  Critical: `eve build` produces `.vercel/output` via Nitro; letting `tsc`
  emit duplicate `dist/` would conflict.

## Dependency pinning decisions

- `eve: "^0.13.3"` — `latest` on npm (2026-06-24). `beta` dist-tag still
  exists at `0.6.0-beta.20` but is the older line. `latest` is what we
  want.
- `ai: "7.0.0-beta.178"` — `eve@0.13.3` declares peer `ai: "7.0.0-beta.178"`
  exactly (no caret). pnpm's caret `^7.0.0-beta.0` resolves to canary and
  fails the peer; `7.0.0-beta.186` (the `beta` dist-tag) also fails. Must
  pin exact.
- `zod: "^4.4.3"` — matches the repo convention from `CLAUDE.md`.
- `@types/node: "^22.13.0"` — matches root `engines.node`.
- `typescript: "^6.0.3"` — matches the repo convention.

**Why:** First install with caret on `ai` produced a peer warning that
surfaced every `pnpm install`. Pinned exact to silence it.

**How to apply:** If you bump `eve` in the future, check its
`peerDependencies.ai` and align the pin. If the peer switches to a caret
range, switch back to caret on our side too.

## Local execution gotchas

- `eve` CLI requires **Node >=24**. The repo's root `engines.node` is
  `>=22.13.0` and `pnpm` defaults to Node 22. Locally, run eve via
  `/c/Users/dpereira/tools/node/node-v24.13.0-win-x64/node.exe` or PATH it
  before invoking the script. The CI machine will need Node 24 if/when
  any workflow runs `eve build`/`eve info` directly (current workflows do
  not — they use targeted `--filter` invocations that exclude `agent`).
- The `eve` bin shim is a POSIX shell script; invoking it directly via
  `node.exe <shim>` fails with a parse error. Always run via `bash` with
  `node` on PATH.
- Adding `agent` to `pnpm-workspace.yaml` makes pnpm treat it as a
  workspace root and place its deps in `agent/node_modules/`. This
  triggers an eve discovery warning (`discover/unsupported-directory`) but
  doesn't fail discovery. Will need a gitignore entry if the team wants a
  clean tree.

## Pre-existing scaffold issues surfaced

`eve info` reports `Diagnostics: 1 error, 1 warning`. Both are in files
the scaffold PR was already reviewed on; the brief says surface, don't fix:

1. **Error** — `discover/skill-frontmatter-invalid` in
   `agent/skills/label-taxonomy.md` at line 2, column 53. YAML frontmatter
   parser rejects the description text. The skill is excluded from the
   `Skills: 2 skills` summary as a result.
2. **Warning** — `discover/unsupported-directory` for `agent/node_modules/`
   (see Local execution gotchas above).

Additionally, the scaffold's TypeScript code does not compile against
`eve@0.13.3`'s published types:

- `tools/apply_proposed_labels.ts:74`, `:92`, `:107` — `ctx.github`
  property missing on `ToolContext`.
- `tools/post_triage_comment.ts:48` — same.
- `tools/request_repo_info.ts:113` — same.
- `channels/github.ts:47` — `issue.label` missing on `GitHubIssueEvent`.

These appear to be a delta between when the scaffold was written (eve
beta) and the now-stable `eve@0.13.3`. Need a follow-up to either pin to
the beta line (`0.6.0-beta.20`) or update the tool/channel code to match
the new context shape.

**Why:** Locked in the original commit `cc24f02` and not updated when eve
moved from beta to `latest`. The user's plan was to fix in a follow-up PR.

**How to apply:** When asked to fix the scaffold, fix the frontmatter
first (smallest blast radius), then update the tool/channel code to
match `eve@0.13.3`'s `ToolContext` and `GitHubIssueEvent` types. Don't
silently downgrade eve — confirm with the user.

## Build & CI integration

- `pnpm -r build` will now invoke `agent`'s `eve build` script, which
  fails on Node 22. The existing CI workflows all use targeted
  `--filter @electron-template/<pkg>` and won't trigger this. The root
  `package.json`'s `postinstall` uses `--filter "./packages/*" -r build`
  which also excludes `agent`. So in CI today the only risk is a developer
  running `pnpm -r build` locally without Node 24 on PATH.
- No `eve` entry was added to `onlyBuiltDependencies` in
  `pnpm-workspace.yaml`. `pnpm view eve` shows no install hook
  (`hasInstallScript` is unset) — the `bin: eve` shim is shipped in the
  tarball and just needs to be on PATH after install.