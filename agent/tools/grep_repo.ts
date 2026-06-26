/**
 * ripgrep-style content search across the cloned repo.
 *
 * P4 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 4) re-enables the default sandbox checkout so the model
 * can traverse the repo beyond `request_repo_info`'s single-file,
 * bounded-output scope. This tool is the "find all callers of X" /
 * "where is Y defined" / "grep for pattern Z" surface — the
 * questions `request_repo_info` is too narrow to answer.
 *
 * Sandboxed execution: we resolve the active sandbox via
 * `ctx.getSandbox()` and run the search through the sandbox's
 * `run` method. Default backend is `defaultBackend()` (Vercel
 * Sandbox) — see `eve/sandbox` and the design doc's Decision 4.
 *
 * Two paths in one tool, decided at run-time:
 *   1. `rg` is preferred (faster, structured line-number output).
 *   2. Fallback to `grep -rn` if `rg` is not present in the
 *      microVM (some just-bash backends skip ripgrep). We probe
 *      `which rg` first; if it fails, the fallback builds the
 *      `grep` command directly with `--exclude-dir=.git`.
 *
 * Read-only: never invokes `write_file`. Approval: `never()`.
 *
 * Output projection (terse, model-facing): one line per match with
 * `path:line:content`, with a header line that summarises total
 * hits and the truncated status. The model can read it back into
 * its own reasoning without re-running the search.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

const DEFAULT_MAX_RESULTS = 50;
const HARD_MAX_RESULTS = 200;
const PATH_HINT_DEFAULT = "/workspace";

/**
 * Single-quote a string for safe inclusion in a `bash`-style command
 * composed via the sandbox's `run` method. Mirrors `shellQuote` from
 * `eve/execution/sandbox/shell-quote.js` so the framing matches what
 * the framework grep/glob executors emit (single-quote with embedded
 * single-quotes escaped as `'\''`).
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Normalize a path hint from model input. The sandbox runs commands
 * against paths relative to `/workspace`. We accept either an
 * absolute path starting with `/workspace` OR a relative path and
 * resolve it to `/workspace/<relative>` — anything else is rejected
 * with a clear error so the model can't escape the workspace root.
 */
function resolvePathHint(hint: string): string {
  if (hint.startsWith("/workspace")) return hint;
  if (hint.startsWith("/")) {
    throw new Error(
      `pathHint must be inside /workspace (got \`${hint}\`). Pass a repo-relative path or a /workspace/... path.`,
    );
  }
  // Strip leading `./` and join.
  const trimmed = hint.replace(/^\.\//, "");
  return `/workspace/${trimmed}`;
}

/**
 * Build the ripgrep command. We deliberately disable coloured output
 * and limit the blast radius with `.git/*` (always present in the
 * cloned repo) and `node_modules/*` (pnpm workspace noise).
 */
function buildRipgrepCommand(args: {
  readonly caseSensitive: boolean;
  readonly limit: number;
  readonly pattern: string;
  readonly path: string;
}): string {
  const parts = [
    "rg",
    "--line-number",
    "--color=never",
    "--hidden",
    "--glob '!.git/*'",
    "--glob '!node_modules/*'",
  ];
  if (!args.caseSensitive) parts.push("--ignore-case");
  parts.push(`--max-count ${args.limit}`);
  parts.push("--");
  parts.push(shellQuote(args.pattern));
  parts.push(shellQuote(args.path));
  return parts.join(" ");
}

/**
 * Fallback for backends without ripgrep. POSIX `grep -rn` with the
 * same `.git` / `node_modules` exclusions.
 */
function buildPosixGrepCommand(args: {
  readonly caseSensitive: boolean;
  readonly limit: number;
  readonly pattern: string;
  readonly path: string;
}): string {
  const parts = [
    "grep",
    "-rn",
    "--color=never",
    "--exclude-dir=.git",
    "--exclude-dir=node_modules",
  ];
  if (!args.caseSensitive) parts.push("-i");
  parts.push(`-m ${args.limit}`);
  parts.push("-E");
  parts.push("--");
  parts.push(shellQuote(args.pattern));
  parts.push(shellQuote(args.path));
  return parts.join(" ");
}

/**
 * Run a probe for `rg` against the sandbox. Returns `true` if
 * ripgrep is on PATH (exit code 0). Any non-zero result — or a
 * sandbox error — means we fall back to `grep -rn`.
 */
async function ripgrepAvailable(
  run: (input: { command: string }) => Promise<{
    readonly exitCode: number;
    readonly stderr: string;
    readonly stdout: string;
  }>,
): Promise<boolean> {
  try {
    const result = await run({ command: "command -v rg >/dev/null 2>&1" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export default defineTool({
  description:
    "Search the cloned repo for `pattern` (ripgrep-style), returning up to " +
    "`maxResults` matches with file path, line number, and content. Use this " +
    "when `request_repo_info` is too narrow: \"find all callers of X\", " +
    "\"where is Y defined\", or any cross-repo grep. Read-only — does not " +
    "modify the repo. The default `pathHint` is `/workspace` (the full repo " +
    "clone). For a subdirectory pass a repo-relative path like " +
    "`packages/api/src`. Falls back to POSIX `grep -rn` if `rg` is not " +
    "available on the sandbox.",
  needsApproval: never(),
  inputSchema: z.object({
    pattern: z
      .string()
      .min(1)
      .describe(
        "Search pattern. POSIX extended regex (the same syntax ripgrep uses). " +
          "Anchor with `^` or `$` if needed; escape regex metacharacters in " +
          "literal strings with `\\`.",
      ),
    pathHint: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Where to search. Absolute paths must start with `/workspace`; " +
          "relative paths resolve from `/workspace`. Defaults to the full " +
          "repo root when omitted.",
      ),
    caseSensitive: z
      .boolean()
      .optional()
      .default(false)
      .describe("Treat the pattern as case-sensitive. Defaults to false."),
    maxResults: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_RESULTS)
      .optional()
      .default(DEFAULT_MAX_RESULTS)
      .describe(
        `Cap on matches returned. Defaults to ${DEFAULT_MAX_RESULTS}; hard ` +
          `ceiling ${HARD_MAX_RESULTS}. The search stops after this many ` +
          `hits even if more exist.`,
      ),
  }),
  async execute({ pattern, pathHint, caseSensitive, maxResults }, ctx) {
    const resolvedPath = resolvePathHint(pathHint ?? PATH_HINT_DEFAULT);
    const sandbox = await ctx.getSandbox();
    // `SandboxSession.run` is typed structurally — we narrow the
    // method's shape locally so this tool compiles against either the
    // AI SDK Experimental_SandboxSession or the eve public session.
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

    const rg = await ripgrepAvailable(run);
    const command = rg
      ? buildRipgrepCommand({
          caseSensitive,
          limit: maxResults,
          pattern,
          path: resolvedPath,
        })
      : buildPosixGrepCommand({
          caseSensitive,
          limit: maxResults,
          pattern,
          path: resolvedPath,
        });

    // ripgrep exits 1 when there are zero matches (and 0 with hits).
    // POSIX grep exits 1 for zero matches as well. Treat both as a
    // valid empty result — only throw on unexpected exit codes.
    let result: { exitCode: number; stderr: string; stdout: string };
    try {
      result = await run({ command });
    } catch (error) {
      // A sandbox-level failure (network, microVM timeout) bubbles
      // up — the model should surface this in the comment's
      // Code context section rather than silently retry.
      throw new Error(
        `grep_repo sandbox execution failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      const stderr = result.stderr.trim();
      throw new Error(
        `grep_repo command failed (exit ${result.exitCode}): ${
          stderr.length > 0 ? stderr : "no stderr output"
        }`,
      );
    }

    const stdout = result.stdout;
    const lines = stdout.length === 0 ? [] : stdout.split(/\r?\n/);
    // Drop the trailing empty line that `split` leaves when stdout
    // ends with a newline (rg/grep both do).
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    const matches = lines.map((line) => {
      // ripgrep / grep -n format: `<path>:<line>:<content>`.
      // The first two `:` separators are the path and line; anything
      // after is the content (which may itself contain colons).
      const firstColon = line.indexOf(":");
      const secondColon =
        firstColon === -1 ? -1 : line.indexOf(":", firstColon + 1);
      if (firstColon === -1 || secondColon === -1) {
        // Defensive: if a line doesn't match the expected shape
        // (shouldn't happen with rg/grep -n), surface it whole
        // rather than throwing — a single malformed line should
        // not sink the whole call.
        return { file: line, line: 0, content: "" };
      }
      const file = line.slice(0, firstColon);
      const lineStr = line.slice(firstColon + 1, secondColon);
      const content = line.slice(secondColon + 1);
      const lineNum = Number.parseInt(lineStr, 10);
      return {
        file,
        line: Number.isFinite(lineNum) ? lineNum : 0,
        content,
      };
    });

    return {
      pattern,
      path: resolvedPath,
      matches,
      backend: rg ? ("rg" as const) : ("grep" as const),
      truncated: matches.length >= maxResults,
    };
  },
  toModelOutput(output) {
    if (output.matches.length === 0) {
      return {
        type: "text" as const,
        value: `No matches for \`${output.pattern}\` in ${output.path} (backend: ${output.backend}).`,
      };
    }
    const header = `${output.matches.length} match(es) for \`${output.pattern}\` in ${output.path} (backend: ${output.backend}${
      output.truncated ? `; truncated at ${output.matches.length}` : ""
    }):`;
    const body = output.matches
      .map((m) => `- \`${m.file}:${m.line}\` — ${m.content}`)
      .join("\n");
    return { type: "text" as const, value: `${header}\n${body}` };
  },
});
