/**
 * List GitHub issue form templates from `.github/ISSUE_TEMPLATE/`.
 *
 * Phase P1 of the v2 design (see `docs/internal/architecture/agents/reports/
 * issue-triage-v2-design.md`). The model calls this in Step 2 of the
 * triage workflow to validate an incoming issue body against the
 * template's `required: true` fields before falling back to the v1
 * heuristic info-completeness check.
 *
 * Scope: YAML issue forms (`.yml` / `.yaml`). Legacy Markdown templates
 * (`ISSUE_TEMPLATE.md`) are explicitly out of scope per the v2 design
 * doc (this repo's choice; revisit if a sister repo needs Markdown).
 *
 * Output shape — one entry per template file in the directory:
 *   - `name`, `description`, `title`, `labels` (template-applied labels)
 *   - `fields[]` reduced to `{ id, type, label, required }` so the
 *     model can grep for `required: true` without re-parsing YAML.
 *
 * Error handling:
 *   - Directory 404 (`.github/ISSUE_TEMPLATE/` does not exist in this
 *     repo) → `{ templates: [] }`. The model treats empty as
 *     "no template validation possible" and proceeds with the v1
 *     heuristic check.
 *   - Individual file failures (network blip, malformed YAML, GitHub
 *     422) → skip that template and continue. One bad file does not
 *     sink the whole call.
 *
 * GitHub API surface: see the note in `apply_proposed_labels.ts` —
 * the `ctx.github.request(...)` helper that earlier betas exposed on
 * `ToolContext` is gone in `eve@0.13.3`. We call `callGitHub` from
 * `agent.ts` instead.
 *
 * YAML parsing: `js-yaml@^4.2.0` (already transitively available in the
 * workspace's pnpm store via `eve`'s own dependency closure; added as
 * an explicit dep here so the agent's install is self-contained and
 * survives `eve` dropping `js-yaml` as a transitive).
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import yaml from "js-yaml";
import { callGitHub, GitHubApiError } from "../agent.js";

const TEMPLATE_DIR = ".github/ISSUE_TEMPLATE";

interface ContentsDirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly sha: string;
  readonly size: number;
  readonly type: "file" | "dir";
}

interface ContentsFileResponse {
  readonly sha: string;
  readonly content: string;
  readonly encoding: "base64";
  readonly name: string;
  readonly path: string;
}

/** GitHub Contents API base64 payloads include embedded newlines. */
function decodeBase64(b64: string): string {
  return Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8");
}

/** Restricted field type set per the upstream GitHub issue form schema. */
const FIELD_TYPES = [
  "markdown",
  "input",
  "textarea",
  "dropdown",
  "checkboxes",
] as const;

type FieldType = (typeof FIELD_TYPES)[number];

interface ReducedField {
  readonly id: string;
  readonly type: FieldType;
  readonly label: string;
  readonly required: boolean;
}

interface ReducedTemplate {
  readonly name: string;
  readonly description: string;
  readonly title?: string;
  readonly labels?: readonly string[];
  readonly fields: readonly ReducedField[];
}

/**
 * Reduce a parsed YAML issue form into the subset the model needs for
 * validation. Anything we cannot safely coerce is omitted (rather than
 * thrown) — a malformed `body[]` entry should not block triage.
 */
function reduceTemplate(parsed: unknown, fallbackName: string): ReducedTemplate | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;

  const name =
    typeof root.name === "string" && root.name.trim().length > 0
      ? root.name
      : fallbackName;
  const description =
    typeof root.description === "string" ? root.description : "";
  const title = typeof root.title === "string" ? root.title : undefined;
  const labels = Array.isArray(root.labels)
    ? root.labels.filter((l): l is string => typeof l === "string")
    : undefined;

  const fields: ReducedField[] = [];
  const body = root.body;
  if (Array.isArray(body)) {
    for (const entry of body) {
      if (!entry || typeof entry !== "object") continue;
      const field = entry as Record<string, unknown>;
      const type = field.type;
      if (typeof type !== "string" || !(FIELD_TYPES as readonly string[]).includes(type)) {
        // `markdown` entries and any unrecognized type are skipped — the
        // model does not validate the prose of a markdown block.
        continue;
      }
      const attrs = (field.attributes ?? {}) as Record<string, unknown>;
      const label = typeof attrs.label === "string" ? attrs.label : "";
      const id = typeof field.id === "string" ? field.id : "";
      if (id.length === 0) continue;
      const validations = (field.validations ?? {}) as Record<string, unknown>;
      const required = validations.required === true;
      fields.push({ id, type: type as FieldType, label, required });
    }
  }

  return { name, description, title, labels, fields };
}

/**
 * Heuristics for matching an issue title to a template are documented
 * in `agent/skills/issue-templates.md` (the skill the model loads on
 * demand). We do not encode them in this tool — the tool is the raw
 * list; the skill teaches the model how to pick.
 */
export default defineTool({
  description:
    "List GitHub issue form templates from `.github/ISSUE_TEMPLATE/`. " +
    "Returns each template's name, description, title prefix, and a " +
    "reduced `fields[]` with `required: true` markers so the model can " +
    "validate an issue body for completeness. Call once per turn, in " +
    "triage-workflow Step 2, before falling back to the v1 heuristic " +
    "info-completeness check. Returns an empty `templates[]` if the " +
    "directory does not exist (treat as 'no template validation possible').",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
  }),
  async execute({ owner, repo }, ctx) {
    const dirPath = `/repos/${owner}/${repo}/contents/${TEMPLATE_DIR}`;

    // 1. List the directory. 404 → no templates in this repo; that's
    //    the documented empty-array contract, not an error.
    let entries: ContentsDirectoryEntry[];
    try {
      const { body } = await callGitHub<ContentsDirectoryEntry[]>(
        ctx,
        "GET",
        dirPath,
      );
      entries = Array.isArray(body) ? body : [];
    } catch (error) {
      // 404 → no `.github/ISSUE_TEMPLATE/` in this repo. That is the
      // documented empty-array contract, not an error — proceed without
      // template validation.
      if (error instanceof GitHubApiError && error.status === 404) {
        return { owner, repo, templates: [] };
      }
      // Any other error surfaces as an empty result with a diagnostic
      // string. The model treats this as "no templates available" and
      // falls back to the heuristic check.
      return {
        owner,
        repo,
        templates: [],
        error: error instanceof Error ? error.message : "unknown error",
      };
    }

    // 2. Filter to YAML form files. `.md` legacy templates are out of
    //    scope (v2 design). Subdirectory listings are ignored.
    const yamlFiles = entries.filter(
      (e) => e.type === "file" && /\.ya?ml$/i.test(e.name),
    );

    // 3. Fetch each template's raw YAML via the Contents API. Decode
    //    base64 (same pattern as `request_repo_info.ts`). Errors on
    //    individual files are isolated — one bad file does not sink
    //    the whole call.
    const templates: ReducedTemplate[] = [];
    const skipped: Array<{ name: string; error: string }> = [];
    await Promise.all(
      yamlFiles.map(async (entry) => {
        try {
          const { body: file } = await callGitHub<ContentsFileResponse>(
            ctx,
            "GET",
            `/repos/${owner}/${repo}/contents/${TEMPLATE_DIR}/${encodeURI(entry.name)}`,
          );
          const text = decodeBase64(file.content);
          const parsed = yaml.load(text);
          const reduced = reduceTemplate(parsed, entry.name);
          if (reduced) {
            templates.push(reduced);
          } else {
            skipped.push({ name: entry.name, error: "empty or non-object YAML" });
          }
        } catch (error) {
          skipped.push({
            name: entry.name,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
      }),
    );

    // Stable sort by template name for deterministic model-facing output.
    templates.sort((a, b) => a.name.localeCompare(b.name));

    return { owner, repo, templates, skipped };
  },
  toModelOutput(output) {
    if (output.templates.length === 0) {
      if ("error" in output && output.error) {
        return {
          type: "text",
          value:
            `No issue templates loaded from .github/ISSUE_TEMPLATE/ ` +
            `(error: ${output.error}). Fall back to the v1 heuristic ` +
            `info-completeness check in triage-workflow Step 2.`,
        };
      }
      return {
        type: "text",
        value:
          "No issue templates in .github/ISSUE_TEMPLATE/. Fall back to " +
          "the v1 heuristic info-completeness check in triage-workflow Step 2.",
      };
    }

    const summary = output.templates
      .map((t) => {
        const required = t.fields.filter((f) => f.required);
        const prefix = t.title ? ` (title prefix: \`${t.title.trim()}\`)` : "";
        const requiredSummary =
          required.length > 0
            ? `${required.length} required: ${required.map((f) => f.id).join(", ")}`
            : "no required fields";
        return `- **${t.name}**${prefix} — ${requiredSummary}`;
      })
      .join("\n");

    const skippedNote =
      output.skipped && output.skipped.length > 0
        ? `\n\nSkipped (parse/read error): ${output.skipped.map((s) => s.name).join(", ")}`
        : "";

    return {
      type: "text",
      value:
        `Found ${output.templates.length} issue template(s) in ` +
        `${output.owner}/${output.repo}/.github/ISSUE_TEMPLATE/. ` +
        `Match the issue title against each template's title prefix or ` +
        `name, then validate the body against that template's ` +
        `\`required: true\` fields.\n\n${summary}${skippedNote}`,
    };
  },
});