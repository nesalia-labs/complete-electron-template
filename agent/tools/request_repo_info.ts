/**
 * Read targeted files from the repo via the GitHub contents API.
 *
 * The sandbox checkout is intentionally skipped (see `channels/github.ts`),
 * so the model has no `read_file` / `glob` / `grep`. When it needs to
 * confirm a file path or convention referenced in an issue, it calls this
 * tool with explicit paths — narrow reads, no sweep.
 *
 * Bounded output: the first ~100 lines per file, plus the blob sha so the
 * model can reason about staleness ("this matches HEAD"). We deliberately
 * cap the response so a 500-line `pnpm-lock.yaml` cannot flood the
 * context window. Anything longer needs a more specific path.
 *
 * `owner` / `repo` come from `ctx.session.auth.attributes` — the
 * `defaultGitHubAuth` helper stamps the repository there on every
 * GitHub-triggered turn. Calling this tool outside a GitHub turn is a
 * programmer error and the loader enforces it.
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

const MAX_EXCERPT_LINES = 100;
const MAX_PATHS_PER_CALL = 8;

/** Shape of the session auth attributes `defaultGitHubAuth` stamps. */
interface AuthAttributesLike {
  readonly repository?: string | readonly string[];
  readonly installation_id?: string | readonly string[];
}

interface SessionAuthLike {
  readonly initiator?: { readonly attributes?: AuthAttributesLike } | null;
  readonly current?: { readonly attributes?: AuthAttributesLike } | null;
}

function readAttr(
  attributes: AuthAttributesLike | undefined,
  key: keyof AuthAttributesLike,
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function repoFromAuth(auth: SessionAuthLike): { owner: string; repo: string } {
  const repository = readAttr(
    (auth.initiator ?? auth.current)?.attributes,
    "repository",
  );
  if (!repository || !repository.includes("/")) {
    throw new Error(
      "No GitHub repository on the session. `request_repo_info` only " +
        "runs on GitHub-triggered turns.",
    );
  }
  const [owner, repo] = repository.split("/");
  return { owner: owner ?? "", repo: repo ?? "" };
}

interface ContentsResponse {
  readonly sha: string;
  readonly content: string; // base64
  readonly encoding: "base64";
  readonly path: string;
}

function decodeExcerpt(contentB64: string): string {
  // GitHub returns content as base64 with embedded newlines.
  const normalized = contentB64.replace(/\s/g, "");
  const buffer = Buffer.from(normalized, "base64");
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length <= MAX_EXCERPT_LINES) return text;
  const head = lines.slice(0, MAX_EXCERPT_LINES).join("\n");
  return `${head}\n\n… [truncated; ${lines.length - MAX_EXCERPT_LINES} more lines]`;
}

export default defineTool({
  description:
    "Read the first ~100 lines of one or more files from the repository by " +
    "exact path (e.g. `packages/db/src/schema/recent-projects.ts`). Use this " +
    "to confirm a file path, an export name, or a config knob referenced in " +
    "an issue. Do not pass wildcards or directory prefixes; pass exact paths. " +
    "At most 8 paths per call.",
  needsApproval: never(),
  inputSchema: z.object({
    paths: z
      .array(
        z
          .string()
          .min(1)
          .refine((p) => !p.includes(".."), {
            message: "Paths must not contain `..`.",
          })
          .refine((p) => !p.startsWith("/"), {
            message: "Paths are repo-relative; no leading `/`.",
          }),
      )
      .min(1)
      .max(MAX_PATHS_PER_CALL)
      .describe(
        `Exact repo-relative file paths. At most ${MAX_PATHS_PER_CALL} per call.`,
      ),
  }),
  async execute({ paths }, ctx) {
    const { owner, repo } = repoFromAuth(ctx.session.auth);

    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          const file = await ctx.github.request<ContentsResponse>({
            method: "GET",
            path: `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
          });
          return {
            path: file.path,
            sha: file.sha,
            excerpt: decodeExcerpt(file.content),
          };
        } catch (error) {
          // 404 (path not found) is a normal outcome — the model was
          // guessing. Return a structured miss rather than throwing,
          // so one bad path doesn't sink the whole call.
          return {
            path,
            sha: null,
            excerpt: null,
            error: error instanceof Error ? error.message : "unknown error",
          };
        }
      }),
    );

    return { owner, repo, files: results };
  },
  toModelOutput(output) {
    const sections = output.files.map((file) => {
      if (file.excerpt === null) {
        return `- **${file.path}** — not found (${file.error ?? "unknown"})`;
      }
      return `- **${file.path}** (sha ${file.sha.slice(0, 7)})\n\n\`\`\`\n${file.excerpt}\n\`\`\``;
    });
    return {
      type: "text",
      value: `Files from ${output.owner}/${output.repo}:\n\n${sections.join("\n\n")}`,
    };
  },
});