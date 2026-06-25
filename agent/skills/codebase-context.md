---
description: "How the agent decides between `request_repo_info` (cheap, bounded) and the sandbox tools (`grep_repo`, `list_dir`, `find_file_by_partial_path`) when an issue mentions file paths, function names, or error messages. Load this skill in triage-workflow Step 1 when the issue body or stack trace points at the codebase."
---

# Codebase Context

When the issue body mentions file paths, function names, error
messages, or stack traces, you need to look at the code before
classifying. There are two reading surfaces available on every turn:

| | `request_repo_info` | Sandbox tools (`grep_repo`, `list_dir`, `find_file_by_partial_path`) |
|---|---|---|
| Backing API | GitHub Contents API (HTTP) | Vercel Sandbox microVM with the cloned repo |
| Speed | Fast (~hundreds of ms) | Slower (cold ~2s, warm instant) |
| Cost | GitHub API quota | Per-execution sandbox runtime |
| Scope | Single file, ≤100 lines, ≤8 paths/call | Whole repo, any depth |
| Best for | "What's in this one file?" | "Find all callers of X" / "where is Y defined?" / "what's in this directory?" |

**Decision rule:** reach for `request_repo_info` first. Escalate to
the sandbox tools only when the question requires repo-wide
traversal.

---

## When to escalate

Escalate to the sandbox tools when any of these are true. Prefer the
tool that fits the question; chain calls when none fits alone.

- **Searching across many files.** "Find all callers of
  `someFunction`", "where is `MY_VAR` defined?", "is there any file
  that imports `X`?". → `grep_repo`.
- **Listing a directory's layout.** "What's in
  `packages/api/src/routes/`?", "what's under `apps/desktop/src/`?".
  → `list_dir` with `maxDepth: 1` (default) or `2` for one level of
  recursion.
- **Fuzzy-finding a file by partial name.** The issue says
  `recent-projects` but the actual file is
  `packages/db/src/schema/recent-projects.ts`. The issue says
  "the ipc contract file" and you don't know the exact path. →
  `find_file_by_partial_path`.
- **Reading a single file longer than ~100 lines.** `request_repo_info`
  caps each excerpt at 100 lines; for longer files, use the sandbox's
  `read_file` via the framework's default tools.
- **Reading more than 8 paths in one turn.** `request_repo_info`'s
  `paths` array caps at 8. For more, batch via `grep_repo`.

Do **not** escalate when the question is "does this single file
exist?" or "what does this one function look like?". `request_repo_info`
is faster, cheaper, and doesn't spin up the sandbox.

---

## Tool reference

The three sandbox tools you should reach for are documented in
their source files; the model-facing descriptions are the canonical
contract. Quick reference:

| Tool | One-liner | Max output |
|---|---|---|
| `grep_repo` | ripgrep-style content search | `maxResults` (default 50, hard cap 200) |
| `list_dir` | one-line listing with file/dir markers | `HARD_MAX_ENTRIES` (500) |
| `find_file_by_partial_path` | substring match on repo paths | `HARD_MAX_RESULTS` (10) |

All three are `needsApproval: never()` (read-only).

The framework's `bash`, `read_file`, `write_file`, `glob`, and `grep`
are also exposed by `defaultBackend()` — they're auto-loaded on
every turn. **Do not call `write_file`**; triage is read-only on the
repo. `bash` is fine for read-only commands (`ls`, `cat`, `rg`,
`find`) but **do not run heavy commands** like `pnpm install`,
`pnpm build`, or `pnpm test` — they will time out the microVM and
add nothing to triage.

---

## Worked examples

### Example 1 — Issue mentions a function name

> "The bug is in `callGitHub` — it doesn't retry on 502."

1. **First call**: `request_repo_info` to confirm the symbol exists
   and grab its current shape. Pass the path you expect
   (`agent.ts`). One read, bounded, fast.
2. **Second call (if you need callers)**: `grep_repo` with
   `pattern: "callGitHub\\("` and `pathHint: "/workspace/agent"`.
   The backslash escapes the `(` so rg treats it as a literal.
3. **Cite in comment**: under `## Code context`, list the path and
   line numbers you read. The reviewer can reproduce without
   re-running the turn.

### Example 2 — Issue includes a stack trace

> ```
> Error: ENOENT: no such file or directory, open '/foo/bar.ts'
>   at Object.openSync (node:fs:585:3)
>   at readFileSync (/workspace/agent/index.js:42:18)
> ```

1. **First call**: `find_file_by_partial_path` with
   `partialPath: "agent/index.js"` to resolve the file's repo path
   if you don't already know it (the framework renames the cloned
   root to `/workspace`, so a stack trace that says
   `/workspace/agent/index.js` maps to `agent/index.js`).
2. **Second call**: `request_repo_info` to read the file (it's a
   small file under 100 lines).
3. **If you need context** around the failing line, fall back to
   the sandbox `read_file` (auto-exposed) with a `lineStart` /
   `lineEnd` range.
4. **Cite in comment**: the file path with the matching line range.

### Example 3 — Issue describes a regression across the app

> "Since v1.5 the desktop app hangs on every cold start."

1. **First call**: `list_dir` on `apps/desktop/src` (or
   `pathHint: "apps/desktop/src"`) to see what lives there.
2. **Second call**: `grep_repo` for terms related to "cold start"
   or "boot" (`pattern: "coldStart|onReady|app\\.whenReady"`).
3. **If hits are concentrated in one file**, `request_repo_info` to
   read that file in full.
4. **Cite in comment**: the directory + the grep pattern + the
   resolved files.

---

## What NOT to do

- **Do not call `write_file`.** Triage is read-only on the repo.
  Even if the issue asks for a code fix, you propose the change in
  the comment; a human applies it.
- **Do not run heavy commands.** `pnpm install`, `pnpm build`,
  `pnpm test`, etc., time out the sandbox microVM and add nothing
  to triage. Read-only commands (`ls`, `cat`, `rg`, `find`,
  `grep`) are fine.
- **Do not list the entire repo at once.** `list_dir` with
  `maxDepth` > 2 on `/workspace` will hit the 500-entry cap and
  truncate. Use `grep_repo` or `find_file_by_partial_path` for
  repo-wide queries.
- **Do not pass `/`-prefixed absolute paths from outside
  `/workspace`.** All three tools reject paths that escape the
  workspace. If you need to look at, say, `/etc/passwd` (you
  don't), this is the wrong agent.
- **Do not use `bash` when a purpose-built tool fits.** If the
  question is "find files matching X", `find_file_by_partial_path`
  is clearer than `bash: find /workspace -name "*X*"`. Reserve
  `bash` for one-off commands the purpose-built tools don't cover.

---

## What the comment should record

Per `triage-workflow.md` Step 7b, when you read files via any of
these tools, list them in the comment's `## Code context` section:

```markdown
## Code context (files referenced)

- `agent/agent.ts:50-65` — `callGitHub` definition matches issue
- `agent/channels/github.ts:120-145` — dispatcher does not pass
  `installation_id` through
```

Cite the **path and line range** you actually read, not just the
tool name. A reviewer should be able to open the file at those
lines and verify the claim without re-running the turn.
