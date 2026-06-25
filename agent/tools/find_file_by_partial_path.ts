/**
 * Fuzzy file lookup in the cloned repo by partial path.
 *
 * P4 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 4). When an issue mentions a file by an approximate
 * name (e.g., `recent-projects` rather than the full
 * `packages/db/src/schema/recent-projects.ts`), the model needs a
 * way to resolve the partial hint against the cloned repo. This is
 * not a content search (`grep_repo`) and not a directory listing
 * (`list_dir`) — it is "find me files whose path contains X".
 *
 * Read-only. Approval: `never()`.
 *
 * Implementation: we delegate to the sandbox via the `run` method,
 * issuing `rg --files` (lists repo files, one per line, with `rg`-
 * style exclusions for `.git` / `node_modules`) and then filtering
 * client-side for lines containing the partial path. We fall back
 * to `find` if ripgrep is missing. Client-side filtering (rather
 * than passing the partial path as a glob) is intentional: it gives
 * us substring containment rather than glob expansion, so
 * `recent-projects` matches `recent-projects.ts`, `MyRecentProjects
 * .tsx`, `migrations/2026_recent-projects.sql`, etc.
 *
 * Why not pass a `find` glob directly?
 * Because globs are anchored at path-segment boundaries by default,
 * and "any path containing this substring" is what the model
 * actually wants. A recursive glob (with star-star) does match
 * anywhere in the path, but the simpler implementation is "list,
 * then filter".
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

const HARD_MAX_RESULTS = 10;
const SEARCH_ROOT = "/workspace";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

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
    "Find files in the cloned repo whose path contains `partialPath` as a " +
    "substring. Use this when an issue mentions a file by an approximate " +
    "name (e.g., the issue says \"the `recent-projects` table\" but the " +
    "actual file is at `packages/db/src/schema/recent-projects.ts`). " +
    "Substring match, not glob — `projects` matches `recent-projects.ts` " +
    "and `MyProjects.test.ts`. Returns up to 10 paths. Read-only; does " +
    "not modify the repo. For directory layout use `list_dir`; for " +
    "content search use `grep_repo`.",
  needsApproval: never(),
  inputSchema: z.object({
    partialPath: z
      .string()
      .min(1)
      .describe(
        "Substring to match anywhere in the file path (case-insensitive). " +
          "E.g. \"recent-projects\", \"ipc-contract\", \"useTriage\". For " +
          "exact path lookups use `request_repo_info` instead.",
      ),
  }),
  async execute({ partialPath }, ctx) {
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

    const rg = await ripgrepAvailable(run);
    // `rg --files` lists every file under the search root (defaults
    // to cwd). We exclude `.git` and `node_modules` so the listing
    // is bounded to repo content. Fallback uses `find -type f` with
    // the same exclusions.
    const command = rg
      ? [
          "rg",
          "--files",
          "--hidden",
          "--glob '!.git/*'",
          "--glob '!node_modules/*'",
          shellQuote(SEARCH_ROOT),
        ].join(" ")
      : [
          "find",
          shellQuote(SEARCH_ROOT),
          "-type f",
          "-not -path '*/.git/*'",
          "-not -path '*/node_modules/*'",
        ].join(" ");

    let result: { exitCode: number; stderr: string; stdout: string };
    try {
      result = await run({ command });
    } catch (error) {
      throw new Error(
        `find_file_by_partial_path sandbox execution failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    // rg exits 1 when the directory has no files matching its
    // filters (unlikely here — `--files` lists everything) and 0
    // for success. find exits 0 even on empty dirs. We treat any
    // non-zero exit as an error and surface stderr.
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      const stderr = result.stderr.trim();
      throw new Error(
        `find_file_by_partial_path listing failed (exit ${result.exitCode}): ${
          stderr.length > 0 ? stderr : "no stderr output"
        }`,
      );
    }

    const needle = partialPath.toLowerCase();
    const lines =
      result.stdout.length === 0 ? [] : result.stdout.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    const matches = lines
      // Strip the `/workspace/` prefix so model output is the same
      // repo-relative form `request_repo_info` returns.
      .map((line) => line.replace(/^\/workspace\//, ""))
      .filter((line) => line.toLowerCase().includes(needle))
      .slice(0, HARD_MAX_RESULTS);

    return {
      partialPath,
      matches: matches.map((path) => ({ path: path.startsWith("/") ? path : `/${path}` })),
      backend: rg ? ("rg" as const) : ("find" as const),
    };
  },
  toModelOutput(output) {
    if (output.matches.length === 0) {
      return {
        type: "text" as const,
        value: `No files in the repo contain \`${output.partialPath}\` in their path (backend: ${output.backend}).`,
      };
    }
    const header = `${output.matches.length} file(s) matching \`${output.partialPath}\` (backend: ${output.backend}):`;
    const body = output.matches.map((m) => `- \`${m.path}\``).join("\n");
    return { type: "text" as const, value: `${header}\n${body}` };
  },
});
