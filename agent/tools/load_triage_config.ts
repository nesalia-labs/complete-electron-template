/**
 * Load `.github/triage.yml` from the repository and return its parsed
 * (Zod-validated) shape.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 2 § "Configurability"). The dispatcher (and the
 * material-change heuristic) read this to decide:
 *
 *   - `material_threshold` (number, default 0.2) — body-length delta
 *     that triggers re-triage on `edited`.
 *   - `triggers_enabled.{opened, edited, labeled}` (booleans,
 *     default all `true`) — per-trigger opt-out for the target repo.
 *
 * Source-of-truth pattern (the probot / Renovate convention the design
 * doc cites): a YAML file in the target repo's `.github/` directory.
 * Owners can opt out of any trigger, adjust the threshold, or
 * override labels by editing the file and pushing.
 *
 * Fetch path: GitHub Contents API at
 * `/repos/{owner}/{repo}/contents/.github/triage.yml`. We use the
 * same `callGitHub` helper as the other tools — no new HTTP surface,
 * no new GitHub App permission (Contents: Read is included in the
 * existing `Issues: Read & write` permission via the App's
 * installation token scope).
 *
 * Error handling:
 *   - 404 (file does not exist) → return `null`. The dispatcher
 *     treats "no config" as "all defaults" (open / edited-with-
 *     default-threshold / labeled all on).
 *   - Network / 5xx → propagates as a thrown error. Model decides
 *     whether to retry or proceed with defaults.
 *   - YAML parse error / Zod validation failure → returns an object
 *     with an `error` field describing the parse failure. Model can
 *     either fall back to defaults or surface the config error to
 *     the issue's triage comment as a note.
 *
 * `owner` / `repo` come from the `repo` input on this tool — the
 * caller (dispatcher) constructs them from the webhook payload. We
 * do not infer from `ctx.session.auth` because the dispatcher's
 * helper functions need to load config for repos that may not be
 * the current session's repo (e.g. admin tooling later).
 */
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import yaml from "js-yaml";
import { z } from "zod";
import { callGitHub, GitHubApiError } from "../agent.js";

const TRIGGER_NAMES = ["opened", "edited", "labeled"] as const;

const triggerFlag = z.boolean().optional();
const triggersEnabledSchema = z.object({
  opened: triggerFlag,
  edited: triggerFlag,
  labeled: triggerFlag,
});

const triageConfigSchema = z.object({
  material_threshold: z.number().min(0).max(1).optional(),
  triggers_enabled: triggersEnabledSchema.optional(),
});

export type TriageConfig = z.infer<typeof triageConfigSchema>;

interface ContentsFileResponse {
  readonly sha: string;
  readonly content: string;
  readonly encoding: "base64";
  readonly path: string;
}

function decodeBase64(b64: string): string {
  return Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8");
}

export default defineTool({
  description:
    "Load `.github/triage.yml` from the repository and return its parsed " +
    "shape: `{ material_threshold?: number, triggers_enabled?: { opened?: " +
    "boolean, edited?: boolean, labeled?: boolean } }`. Returns `null` if " +
    "the file does not exist (treat as all defaults: threshold 0.2, all " +
    "triggers on). Returns an object with an `error` field on YAML parse or " +
    "Zod validation failure.",
  needsApproval: never(),
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner (org or user)."),
    repo: z.string().min(1).describe("Repository name."),
  }),
  async execute({ owner, repo }, ctx) {
    const path = `/repos/${owner}/${repo}/contents/.github/triage.yml`;
    try {
      const { body: file } = await callGitHub<ContentsFileResponse>(
        ctx,
        "GET",
        path,
      );
      const text = decodeBase64(file.content);
      const parsed = yaml.load(text);
      const result = triageConfigSchema.safeParse(parsed);
      if (!result.success) {
        return {
          found: true as const,
          error: `triage.yml failed schema validation: ${result.error.message}`,
          raw: text,
        };
      }
      return {
        found: true as const,
        config: result.data,
        sha: file.sha,
      };
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        // Documented empty contract — caller treats as defaults.
        return { found: false as const };
      }
      return {
        found: true as const,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  },
  toModelOutput(output) {
    if (!output.found) {
      return {
        type: "text",
        value:
          "No `.github/triage.yml` in this repo. Using defaults: " +
          "material_threshold=0.2, all triggers enabled.",
      };
    }
    if ("error" in output && output.error) {
      return {
        type: "text",
        value: `Failed to load .github/triage.yml: ${output.error}. ` +
          "Falling back to defaults.",
      };
    }
    // `found: true` + no `error` key → `config` is guaranteed by the
    // discriminated union above. The explicit non-null assertion is
    // the same contract; the runtime branch above ensures we never
    // reach here without `config` being set.
    const cfg = output.config!;
    const parts: string[] = [];
    if (typeof cfg.material_threshold === "number") {
      parts.push(`material_threshold=${cfg.material_threshold}`);
    }
    const t = cfg.triggers_enabled;
    if (t) {
      parts.push(
        `triggers: opened=${t.opened !== false} edited=${t.edited !== false} labeled=${t.labeled !== false}`,
      );
    }
    if (parts.length === 0) {
      parts.push("(no overrides — all defaults)");
    }
    return {
      type: "text",
      value: `Loaded .github/triage.yml: ${parts.join("; ")}.`,
    };
  },
});