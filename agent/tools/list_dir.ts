/**
 * List directory contents in the cloned repo.
 *
 * P4 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 4) — sibling to `grep_repo` and `find_file_by_partial_path`.
 * `request_repo_info` cannot list a directory (the GitHub Contents
 * API does have a directory listing, but it requires the path to be
 * known in full and only works one level at a time). The sandbox
 * already has `find` and `ls`, so we use them directly via the
 * sandbox's `run` method.
 *
 * Read-only. Approval: `never()`.
 *
 * Path resolution: same contract as `grep_repo`. `path` is anchored
 * to `/workspace` — pass either an absolute `/workspace/...` path
 * or a relative path (resolved as `/workspace/<relative>`).
 *
 * Output projection: terse, model-facing. Header line counts entries;
 * body is one line per entry with `dir` / `file` / `other` markers
 * and a size in bytes for files (matches `ls -la`).
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

const DEFAULT_MAX_DEPTH = 1;
const HARD_MAX_DEPTH = 4;
const HARD_MAX_ENTRIES = 500;

/**
 * Single-quote a string for safe inclusion in a `bash`-style command
 * composed via the sandbox's `run` method. Mirrors `shellQuote` from
 * `eve/execution/sandbox/shell-quote.js`.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Normalize a path hint from model input. Same contract as
 * `grep_repo.resolvePathHint` — keep the two tools symmetric so
 * the model doesn't have to remember which one accepts what.
 */
function resolvePath(path: string): string {
  if (path.startsWith("/workspace")) return path;
  if (path.startsWith("/")) {
    throw new Error(
      `path must be inside /workspace (got \`${path}\`). Pass a repo-relative path or a /workspace/... path.`,
    );
  }
  const trimmed = path.replace(/^\.\//, "");
  return `/workspace/${trimmed}`;
}

interface LsEntry {
  readonly name: string;
  readonly type: "file" | "dir" | "other";
  readonly size?: number;
}

/**
 * Parse the trailing line of a `find -maxdepth N -mindepth N -printf
 * "%y %s %p\n"` invocation into an `LsEntry`. We use `find` rather
 * than `ls -la` because `ls` formatting differs between GNU and BSD
 * (macOS), and the model's context should not depend on the build
 * host. `find -printf` is GNU-only too — if it's missing, fall
 * back to `ls -la` parsing. We probe at run time.
 */
async function probeFindPrintf(
  run: (input: { command: string }) => Promise<{
    readonly exitCode: number;
    readonly stderr: string;
    readonly stdout: string;
  }>,
): Promise<boolean> {
  try {
    const result = await run({ command: "command -v find >/dev/null 2>&1" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Parse one `ls -la`-style line into an `LsEntry`. Format:
 *   `drwxr-xr-x  2 user group 4096 Jan 1 12:00 dirname`
 * The first character is the type (`d`, `-`, `l`, etc.); the 5th
 * whitespace-separated field is the size. We grab by splitting on
 * whitespace rather than regex so a `link -> target` at the end
 * (symlinks) doesn't trip us up.
 */
function parseLsLine(line: string, dir: string): LsEntry | null {
  const trimmed = line.trimEnd();
  if (trimmed.length === 0) return null;
  // Skip the `total N` header line.
  if (trimmed.startsWith("total ")) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 9) return null;
  const perms = tokens[0] ?? "";
  const sizeStr = tokens[4] ?? "0";
  // Filenames with spaces appear as the trailing tokens; reassemble
  // from index 8 onward.
  const name = tokens.slice(8).join(" ");
  if (name === "." || name === "..") return null;
  const typeChar = perms.charAt(0);
  let type: "file" | "dir" | "other";
  if (typeChar === "d") type = "dir";
  else if (typeChar === "-") type = "file";
  else if (typeChar === "l") type = "other"; // symlink — surface, don't follow
  else type = "other";
  const size = Number.parseInt(sizeStr, 10);
  void dir; // kept for future use (e.g. resolving symlink targets)
  return { name, type, size: Number.isFinite(size) ? size : undefined };
}

/**
 * Parse a `find -printf "%y %s %p\n"` line. `%y` is the type
 * (`f` / `d` / `l`); `%s` is the size in bytes; `%p` is the path
 * (which we trim back to a name relative to the requested dir).
 */
function parseFindLine(
  line: string,
  baseDir: string,
): LsEntry | null {
  const trimmed = line.trimEnd();
  if (trimmed.length === 0) return null;
  const tokens = trimmed.split(" ");
  if (tokens.length < 3) return null;
  const typeChar = tokens[0] ?? "";
  const sizeStr = tokens[1] ?? "0";
  const fullPath = tokens.slice(2).join(" ");
  // Strip the baseDir prefix to get the relative name. The baseDir
  // is guaranteed to start with `/workspace`, so a simple prefix
  // strip works — fall back to basename if the path is outside.
  let name = fullPath;
  if (fullPath.startsWith(`${baseDir}/`)) {
    name = fullPath.slice(baseDir.length + 1);
  }
  let type: "file" | "dir" | "other";
  if (typeChar === "f") type = "file";
  else if (typeChar === "d") type = "dir";
  else type = "other";
  const size = Number.parseInt(sizeStr, 10);
  return { name, type, size: Number.isFinite(size) ? size : undefined };
}

export default defineTool({
  description:
    "List the contents of a directory in the cloned repo, one level deep " +
    "by default. Use this to understand a directory's layout before " +
    "deciding which files to read with `request_repo_info` or which " +
    "patterns to grep for with `grep_repo`. Pass a `path` inside " +
    "`/workspace` (the cloned repo) — defaults to `/workspace` (repo " +
    "root). Read-only; does not modify the repo. Output is sorted " +
    "alphabetically with directories first.",
  needsApproval: never(),
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "Directory to list. Absolute paths must start with `/workspace`; " +
          "relative paths resolve from `/workspace`. Defaults to `/workspace` " +
          "if you omit it.",
      )
      .optional(),
    maxDepth: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_DEPTH)
      .optional()
      .default(DEFAULT_MAX_DEPTH)
      .describe(
        `Recursion depth. \`1\` (default) lists the directory itself; \`2\` ` +
          `lists one level of subdirectories. Hard ceiling ${HARD_MAX_DEPTH}. ` +
          `Use \`grep_repo\` if you need to traverse the whole repo.`,
      ),
  }),
  async execute({ path, maxDepth }, ctx) {
    const resolved = resolvePath(path ?? "/workspace");
    const sandbox = await ctx.getSandbox();
    const run = (
      sandbox as unknown as {
        run: (input: {
          command: string;
        }) => Promise<{
          readonly exitCode: number;
          readonly stderr: string;
          readonly stdout: string;
        }>;
      }
    ).run.bind(sandbox);

    // Try `find -printf` first — structured output, easy to parse.
    // Fall back to `ls -la` if find's `-printf` isn't supported.
    const findPrintfCommand = [
      "find",
      shellQuote(resolved),
      `-maxdepth ${maxDepth}`,
      "-mindepth 1",
      `-printf '%y %s %p\\n'`,
    ].join(" ");

    let entries: LsEntry[] = [];
    let backend: "find-printf" | "ls" = "find-printf";

    try {
      const result = await run({ command: findPrintfCommand });
      if (result.exitCode === 0) {
        const lines = result.stdout.split(/\r?\n/);
        for (const line of lines) {
          const entry = parseFindLine(line, resolved);
          if (entry) entries.push(entry);
          if (entries.length >= HARD_MAX_ENTRIES) break;
        }
      } else {
        backend = "ls";
      }
    } catch {
      backend = "ls";
    }

    if (backend === "ls" || (entries.length === 0 && backend === "find-printf")) {
      // Fallback path. `-A` excludes `.` and `..`; we add them back
      // via the parseLsLine skip above. `-d /workspace` would
      // give the dir itself, not its contents, so a plain
      // `ls -lA <path>` is what we want.
      const lsCommand = [
        "ls",
        "-lA",
        shellQuote(resolved),
      ].join(" ");
      const fallback = await run({ command: lsCommand });
      if (fallback.exitCode !== 0) {
        const stderr = fallback.stderr.trim();
        throw new Error(
          `list_dir failed (exit ${fallback.exitCode}): ${
            stderr.length > 0 ? stderr : "no stderr output"
          }`,
        );
      }
      const lines = fallback.stdout.split(/\r?\n/);
      for (const line of lines) {
        const entry = parseLsLine(line, resolved);
        if (entry) entries.push(entry);
        if (entries.length >= HARD_MAX_ENTRIES) break;
      }
    }

    // Sort: directories first, then alphabetical within each group.
    entries.sort((a, b) => {
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    });

    const truncated = entries.length >= HARD_MAX_ENTRIES;
    return {
      path: resolved,
      entries,
      truncated,
    };
  },
  toModelOutput(output) {
    if (output.entries.length === 0) {
      return {
        type: "text" as const,
        value: `${output.path} is empty or does not exist.`,
      };
    }
    const header = `${output.path} has ${output.entries.length} entr${
      output.entries.length === 1 ? "y" : "ies"
    }${output.truncated ? ` (truncated at ${output.entries.length})` : ""}:`;
    const body = output.entries
      .map((e) => {
        const marker = e.type === "dir" ? "d " : e.type === "file" ? "f " : "? ";
        const size = typeof e.size === "number" ? `${e.size}b ` : "";
        return `- ${marker}${size}\`${e.name}\``;
      })
      .join("\n");
    return { type: "text" as const, value: `${header}\n${body}` };
  },
});
