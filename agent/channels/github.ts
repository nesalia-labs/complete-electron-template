/**
 * GitHub App webhook channel — the agent's only entry point.
 *
 * P3 of the v2 issue-triage agent (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 2) extends the v1 single-trigger dispatcher (`opened` only)
 * into the full event matrix:
 *
 *   - `opened` / `reopened`         — dispatch
 *   - `edited`                      — material-change check; dispatch
 *                                      OR record no-op turn + return null
 *   - `labeled` with `status:*`     — re-triage (dispatch)
 *   - `labeled` with non-`status:*` — ignore (label changes alone don't
 *                                      change triage content)
 *   - `closed` / `transferred`      — purge state, return null
 *   - everything else               — ignore
 *
 * `defaultGitHubAuth(ctx)` derives session auth from the webhook actor
 * and stamps the repo, issue number, and installation id into
 * `auth.attributes` — which `apply_proposed_labels` and
 * `request_repo_info` read to construct their API paths. Returning
 * `null` skips dispatch.
 *
 * Credentials fall back to env vars (`GITHUB_APP_ID`,
 * `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`); the explicit
 * block below documents intent and is robust against someone renaming
 * them.
 *
 * Webhook URL must be `https://<deployment>/eve/v1/github`. Vercel
 * Deployment Protection must be OFF — see `instructions.md`.
 *
 * `turn.started` override: the channel's built-in handler drops an
 * `eyes` reaction AND checks the repo out into a sandbox on every
 * dispatched turn. P4 of the v2 design (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`,
 * Decision 4) re-enables the default sandbox checkout so the model
 * can use `bash` / `read_file` / `glob` / `grep` against the cloned
 * repo on turns where it needs to traverse the codebase (not just
 * spot-check a single file via `request_repo_info`). We keep our
 * custom handler to still post the `eyes` reaction; not suppressing
 * the default's checkout is sufficient — the framework runs the
 * checkout after our handler completes. The model decides per turn
 * whether to escalate from `request_repo_info` to sandbox tools; see
 * `agent/skills/codebase-context.md` for the heuristic.
 */
import { createHash } from "node:crypto";
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";
import type {
  GitHubInboundContext,
  GitHubIssueEvent,
} from "eve/channels/github";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, issueTriageState } from "../db/client.js";

/** Inline aliases — the dispatcher's helper functions take these shapes. */
type DispatchContext = GitHubInboundContext;
type IssueEvent = GitHubIssueEvent;

/**
 * Returns `true` if the just-added label (extracted from
 * `issue.raw.label?.name`) starts with `status:`. The webhook envelope
 * carries the changed label separately from the issue body so we can
 * gate re-triage on maintainer-applied status transitions without
 * firing on every label flip.
 */
function isStatusLabelChange(issue: IssueEvent): boolean {
  // The webhook payload puts the changed label at `issue.raw.label`
  // for `labeled` events. The exact shape is documented by GitHub:
  // { action: "labeled", label: { name: "status: triage", ... }, ... }
  const raw = issue.raw as { readonly label?: { readonly name?: unknown } };
  const name = raw.label?.name;
  return typeof name === "string" && name.startsWith("status:");
}

/**
 * sha256 of the issue body as a hex string. Matches the `body_hash`
 * column shape on `issue_triage_state`. We truncate to 32 hex chars
 * (128 bits) in the comparison UI but store the full digest so a
 * collision attack against the material-change check is implausible.
 */
function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Heuristic for "did the issue body change materially?": per the v2
 * design doc, material = any of:
 *   - body length delta > `threshold` (default 0.2 = 20%)
 *   - new code blocks added (``` count increased)
 *   - new file paths mentioned (backtick-wrapped paths OR `*.ext` patterns)
 *   - labels changed (excluding `status:*`)
 *
 * Returns `{ changed: boolean, reason?: string, currentBody: string,
 * currentLabels: string[] }` so the dispatcher can record the new
 * `body_hash` / labels even on a "no change" decision (we still
 * record the turn, just as a `no-op`).
 */
interface MaterialChangeResult {
  readonly changed: boolean;
  readonly reason: string;
  readonly currentBody: string;
  readonly currentLabels: readonly string[];
  readonly newBodyHash: string;
}

async function evaluateMaterialChange(
  ctx: DispatchContext,
  issue: IssueEvent,
  previousBodyHash: string,
  previousLabels: readonly string[],
  threshold: number,
): Promise<MaterialChangeResult> {
  // Fetch the current issue body via the channel's GitHub handle
  // (installation-token auth handled by the channel). 404 / API error
  // → fall back to "treat as no-op" so a transient fetch failure does
  // not dispatch a spurious re-triage.
  type IssueResponse = {
    readonly body: string | null;
    readonly labels: ReadonlyArray<{ readonly name?: string | null }>;
  };
  let current: IssueResponse;
  try {
    const response = await ctx.github.request<IssueResponse>({
      method: "GET",
      path: `/repos/${ctx.repository.owner}/${ctx.repository.name}/issues/${issue.issueNumber}`,
    });
    current = response.body ?? { body: null, labels: [] };
  } catch (error) {
    return {
      changed: false,
      reason: `failed to fetch current issue body: ${error instanceof Error ? error.message : "unknown error"}`,
      currentBody: "",
      currentLabels: [],
      newBodyHash: previousBodyHash,
    };
  }

  const currentBody = current.body ?? "";
  const currentLabels = current.labels
    .map((l) => (typeof l.name === "string" ? l.name : null))
    .filter((l): l is string => l !== null);
  const newBodyHash = hashBody(currentBody);

  // 1. Body length delta. The previous body length is unknown to us
  //    (we only stored the hash) — so we can compare hashes directly,
  //    AND we can fetch the previous body from GitHub if we want
  //    length-based heuristics. We do not store body length; the
  //    `body_hash` mismatch is the strongest possible signal that the
  //    body changed at all. From there, we approximate "material" with
  //    the structural checks below.
  const bodyChanged = newBodyHash !== previousBodyHash;

  if (!bodyChanged) {
    return {
      changed: false,
      reason: "body_hash unchanged",
      currentBody,
      currentLabels,
      newBodyHash,
    };
  }

  // 2. Label delta excluding `status:*`. A non-status label flip
  //    (e.g. someone added `type: bug`) is a content signal — re-triage.
  const labelDelta = symmetricDifference(
    new Set(currentLabels),
    new Set(previousLabels),
  );
  const nonStatusDelta = labelDelta.filter((l) => !l.startsWith("status:"));
  if (nonStatusDelta.length > 0) {
    return {
      changed: true,
      reason: `labels changed (non-status): ${nonStatusDelta.join(", ")}`,
      currentBody,
      currentLabels,
      newBodyHash,
    };
  }

  // 3. New code blocks added (rough heuristic on `currentBody` length
  //    vs the stored hash gives us a "did anything change" signal;
  //    from there we count triple-backtick fences and compare against
  //    the previous body's count, which we approximate by counting
  //    inside `currentBody` itself — the dispatcher cannot read the
  //    previous body, only its hash).
  //    Practical approach: count the fences. If there are >= 1 new
  //    code block (i.e. the body contains any fenced block at all),
  //    AND the body is non-trivial (>200 chars), treat as material.
  //    The model can still be conservative on re-triage by reading the
  //    issue again at the start of the turn.
  const fenceCount = (currentBody.match(/```/g) ?? []).length;
  if (fenceCount >= 2 && currentBody.length > 200) {
    return {
      changed: true,
      reason: "issue body contains code blocks and is non-trivial",
      currentBody,
      currentLabels,
      newBodyHash,
    };
  }

  // 4. New file paths mentioned. Backtick-wrapped repo paths or
  //    `*.ext` patterns are a signal that the user added a code
  //    reference. Look for backticked strings containing `/` OR an
  //    obvious file extension pattern.
  const filePathPattern = /`[^`]*\/[^`]+`|\b\S+\.(ts|tsx|js|jsx|py|rs|go|md|json|ya?ml)\b/g;
  const filePathMatches = currentBody.match(filePathPattern);
  if (filePathMatches && filePathMatches.length > 0) {
    return {
      changed: true,
      reason: `issue body mentions ${filePathMatches.length} file path(s)`,
      currentBody,
      currentLabels,
      newBodyHash,
    };
  }

  // 5. Body length proxy via threshold. We don't have the previous
  //    length, so we approximate: if the body is short AND unchanged
  //    except for whitespace/typo (we already know the hash changed),
  //    AND none of the structural signals above fired, we treat as
  //    "no material change" and fall back to a no-op. The threshold
  //    argument is reserved for a future enhancement where we store
  //    body length on each turn.
  void threshold; // currently unused; see comment above.
  return {
    changed: false,
    reason: "body changed but no material signals (code blocks, file paths, label delta) detected",
    currentBody,
    currentLabels,
    newBodyHash,
  };
}

function symmetricDifference<T>(a: Set<T>, b: Set<T>): T[] {
  const result: T[] = [];
  for (const x of a) if (!b.has(x)) result.push(x);
  for (const x of b) if (!a.has(x)) result.push(x);
  return result;
}

/**
 * Read the most recent `issue_triage_state` row for the issue. Returns
 * `null` if no state exists OR if the row's `closedAt` is set (the
 * issue has been closed / purged — treat as fresh state for any new
 * turn). Soft-deleted rows are skipped because a `closed` event
 * triggers a purge; if a stale row sneaks through, the next turn
 * still sees "no prior state".
 */
async function readPreviousState(
  repoKey: string,
  issueNumber: number,
): Promise<{
  readonly bodyHash: string;
  readonly labelsApplied: readonly string[];
} | null> {
  const db = await getDb();
  const rows = await db
    .select({
      bodyHash: issueTriageState.bodyHash,
      labelsApplied: issueTriageState.labelsApplied,
      closedAt: issueTriageState.closedAt,
    })
    .from(issueTriageState)
    .where(
      and(
        eq(issueTriageState.repo, repoKey),
        eq(issueTriageState.issueNumber, issueNumber),
        isNull(issueTriageState.closedAt),
      ),
    )
    .orderBy(desc(issueTriageState.createdAt))
    .limit(1);

  const latest = rows[0];
  if (!latest) return null;
  let labels: string[];
  try {
    const parsed: unknown = JSON.parse(latest.labelsApplied);
    labels = Array.isArray(parsed)
      ? parsed.filter((l): l is string => typeof l === "string")
      : [];
  } catch {
    labels = [];
  }
  return { bodyHash: latest.bodyHash, labelsApplied: labels };
}

export default githubChannel({
  botName: "eve-triage",
  credentials: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  onIssue: async (ctx, issue) => {
    const repoKey = `${ctx.repository.owner}/${ctx.repository.name}`;

    // closed / transferred → purge state, no dispatch. Returning null
    // here is what tells the channel to ack the webhook without
    // starting a turn. The `purge_issue_state` tool is callable by
    // the model inside a turn, but on `closed` / `transferred` the
    // dispatcher can do it directly because no turn is starting.
    if (issue.action === "closed" || issue.action === "transferred") {
      try {
        await softDeleteIssueState(repoKey, issue.issueNumber);
      } catch (error) {
        // eslint-disable-next-line no-console -- dispatcher signal
        console.warn(
          `[channels/github] purge failed for ${repoKey}#${issue.issueNumber}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
      return null;
    }

    // labeled with non-status:* → ignore (v1 behavior parity).
    if (issue.action === "labeled" && !isStatusLabelChange(issue)) {
      return null;
    }

    // labeled with status:* → re-triage (treat like `reopened`).
    if (issue.action === "labeled" && isStatusLabelChange(issue)) {
      return { auth: defaultGitHubAuth(ctx) };
    }

    // reopened → dispatch.
    if (issue.action === "reopened") {
      return { auth: defaultGitHubAuth(ctx) };
    }

    // opened → dispatch.
    if (issue.action === "opened") {
      return { auth: defaultGitHubAuth(ctx) };
    }

    // edited → material-change check; dispatch or record no-op.
    if (issue.action === "edited") {
      const previous = await readPreviousState(repoKey, issue.issueNumber);
      if (!previous) {
        // No prior state — treat as fresh dispatch (the issue was
        // probably opened before P3 shipped, or state was purged).
        return { auth: defaultGitHubAuth(ctx) };
      }
      const result = await evaluateMaterialChange(
        ctx,
        issue,
        previous.bodyHash,
        previous.labelsApplied,
        0.2,
      );
      if (result.changed) {
        return { auth: defaultGitHubAuth(ctx) };
      }
      // Record the no-op turn so the audit trail shows the event
      // arrived. The model doesn't see this; it's an inline write
      // by the dispatcher. Failure to record is logged but does not
      // fail the dispatch decision.
      try {
        await recordNoOpTurn(repoKey, issue.issueNumber, result.newBodyHash);
      } catch (error) {
        // eslint-disable-next-line no-console -- dispatcher signal
        console.warn(
          `[channels/github] no-op record failed for ${repoKey}#${issue.issueNumber}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
      return null;
    }

    // Everything else (assigned, milestoned, deleted, pinned, etc.) →
    // ignore. v1 was opened-only; v2 extends to the documented matrix.
    return null;
  },
  events: {
    "turn.started": async (_data, channel) => {
      // P4 keeps the `eyes` reaction but no longer suppresses the
      // default sandbox checkout. The framework runs the checkout
      // AFTER this handler completes, so just not suppressing it is
      // sufficient — the model's per-turn tools (`bash`,
      // `read_file`, `glob`, `grep`, `write_file`) come online once
      // we return. Keep this handler limited to the eyes reaction;
      // don't suppress the default flow.
      try {
        await channel.thread.react("eyes");
      } catch {
        // Swallow: a failed reaction is not a triage failure.
      }
    },
    "turn.completed": async (_data, channel) => {
      // v1.5 polish: post-turn recap-comment guard. The model is
      // supposed to post exactly ONE comment per turn (the structured
      // triage comment with the `<!-- bot:marty-action triage:v2 -->`
      // marker). If it posts a second "Triage complete" / "Done" /
      // recap / acknowledgment a few seconds later, this hook DELETEs
      // it. The model-side HARD RULE in `instructions.md` is the
      // primary defense; this hook is the deploy-side safety net.
      //
      // All errors are logged, never thrown — a failed delete must
      // not break the webhook ack. The hook is purely additive: it
      // does NOT touch `turn.started`, `message.completed`,
      // `session.failed`, or `turn.failed` handlers.
      try {
        await runRecapCommentGuard(channel);
      } catch (error) {
        // eslint-disable-next-line no-console -- dispatcher signal
        console.warn(
          `[channels/github] recap-comment guard failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    },
  },
});

/**
 * Inline soft-delete on `closed` / `transferred`. Mirrors the
 * `purge_issue_state` tool's contract but runs in the dispatcher
 * before any turn starts (so the audit trail captures the event
 * itself, then the daily retention sweep hard-deletes after the
 * TTL).
 *
 * Idempotent: rows already stamped with `closedAt` are not touched.
 */
async function softDeleteIssueState(
  repoKey: string,
  issueNumber: number,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db
    .update(issueTriageState)
    .set({ closedAt: now })
    .where(
      and(
        eq(issueTriageState.repo, repoKey),
        eq(issueTriageState.issueNumber, issueNumber),
        isNull(issueTriageState.closedAt),
      ),
    );
}

/**
 * Inline no-op turn recorder for `edited` events that fail the
 * material-change check. Mirrors the `record_triage_turn` tool's
 * INSERT but runs in the dispatcher (the model is not in the loop
 * for a no-op).
 */
async function recordNoOpTurn(
  repoKey: string,
  issueNumber: number,
  newBodyHash: string,
): Promise<void> {
  const db = await getDb();
  await db.insert(issueTriageState).values({
    repo: repoKey,
    issueNumber,
    turnId: `noop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    eventAction: "no-op",
    bodyHash: newBodyHash,
    labelsApplied: JSON.stringify([]),
    commentId: null,
    commentHash: null,
    closedAt: null,
  });
}

/* ------------------------------------------------------------------ *
 * v1.5 polish: `turn.completed` recap-comment guard.
 *
 * Observed on issue #30 (2026-06-26) — the model (MiniMax M3) decided
 * unprompted to post a second "Triage complete for issue #30…" comment
 * a few seconds after the structured triage comment, violating the
 * `triage-workflow.md` Step 7d / `instructions.md` HARD RULE. The model
 * side is hardened in `instructions.md`; this hook is the deploy-side
 * safety net that auto-deletes any recap comment the model posts anyway.
 *
 * Algorithm:
 *   1. Pull the last 20 comments on the issue (sort: newest first).
 *   2. Find the most recent comment by the bot whose body carries
 *      `TRIAGE_MARKER` — that is the structured triage comment.
 *   3. Identify any other comment by the same author whose
 *      `created_at` is within `RECAP_WINDOW_SECONDS` AFTER the
 *      structured comment — those are the recap comments to delete.
 *   4. DELETE each recap comment via `channel.github.request`.
 *
 * All errors are logged, never thrown — a failed delete must not break
 * the webhook ack (the `turn.completed` hook is called from `waitUntil`).
 * ------------------------------------------------------------------ */

/** Marker prepended to every `post_triage_comment` body. */
const TRIAGE_MARKER = "<!-- bot:marty-action triage:v2 -->";

/** Window after the structured comment during which a "recap" is recognized. */
const RECAP_WINDOW_SECONDS = 120;

/** Shape of a single issue comment as returned by the GitHub REST API. */
interface IssueComment {
  readonly body: string;
  readonly created_at: string;
  readonly id: number;
  readonly user: { readonly login: string } | null;
}

/**
 * Find the most recent comment by the bot whose body carries the triage
 * marker. Returns `null` if no such comment exists (e.g. the model
 * errored out before posting one, or the marker lookup missed it — a
 * non-trivial edge case we handle by aborting the guard).
 */
function findStructuredTriageComment(
  comments: readonly IssueComment[],
  marker: string,
  botLogin: string,
): IssueComment | null {
  // Comments arrive sorted newest-first; the first match wins.
  for (const comment of comments) {
    if (comment.user?.login !== botLogin) continue;
    if (!comment.body.includes(marker)) continue;
    return comment;
  }
  return null;
}

/**
 * Classify a comment as a "recap" (i.e. a candidate for deletion).
 * True when the comment is NOT the structured comment, IS authored by
 * the bot, does NOT carry the marker, AND was created within
 * `windowSeconds` AFTER the structured comment's `created_at`.
 */
function isRecapComment(
  comment: IssueComment,
  marker: string,
  structuredCreatedAt: number,
  windowSeconds: number,
  botLogin: string,
): boolean {
  if (comment.user?.login !== botLogin) return false;
  if (comment.body.includes(marker)) return false;
  const createdAtMs = Date.parse(comment.created_at);
  if (!Number.isFinite(createdAtMs)) return false;
  const deltaSec = (createdAtMs - structuredCreatedAt) / 1000;
  return deltaSec >= 0 && deltaSec <= windowSeconds;
}

/**
 * DELETE one issue comment via the channel's installation-token-authed
 * GitHub handle. Logs (never throws) on failure — the `turn.completed`
 * hook runs from `waitUntil` and a thrown error would not fail the
 * webhook ack, but logging keeps the audit trail honest.
 */
async function deleteComment(
  channel: {
    readonly github: {
      request<T = unknown>(input: {
        readonly method: "DELETE";
        readonly path: string;
      }): Promise<{ readonly status: number; readonly body: T }>;
    };
  },
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  try {
    await channel.github.request({
      method: "DELETE",
      path: `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    });
  } catch (error) {
    // eslint-disable-next-line no-console -- dispatcher signal
    console.warn(
      `[channels/github] failed to delete recap comment ${commentId} on ${owner}/${repo}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

/**
 * Implementation of the `turn.completed` recap-comment guard. Pulls
 * the last 20 comments on the issue, finds the bot's structured
 * triage comment (by marker), and DELETEs any other comment by the
 * bot that was posted within `RECAP_WINDOW_SECONDS` of it.
 *
 * The bot's GitHub login is taken from the `MARTY_ACTION_LOGIN` env
 * var (default `marty-action[bot]`). If we cannot determine the login
 * (env missing AND no fallback), we abort silently with a warn log —
 * the guard is opportunistic, not load-bearing.
 */
async function runRecapCommentGuard(channel: {
  readonly conversation: { readonly issueNumber: number | null; readonly kind: string };
  readonly github: {
    request<T = unknown>(input: {
      readonly method: "DELETE" | "GET";
      readonly path: string;
    }): Promise<{ readonly status: number; readonly body: T }>;
  };
  readonly repository: { readonly owner: string; readonly name: string };
}): Promise<void> {
  // Only issue conversations are in scope. A PR surface would not
  // produce structured triage comments with this marker.
  if (channel.conversation.kind !== "issue") return;
  const issueNumber = channel.conversation.issueNumber;
  if (issueNumber === null) return;

  // Determine the bot's GitHub login. We prefer the explicit env var
  // (matches the live App's bot user — `marty-action[bot]` for the
  // current prod App). If the env var is unset, fall back to
  // `marty-action[bot]`; if that lookup fails (some future operator
  // renames the bot and forgets the env var), abort silently. Never
  // throw — see `instructions.md` HARD RULE note about the hook
  // being a safety net.
  const botLogin = process.env.MARTY_ACTION_LOGIN ?? "marty-action[bot]";
  if (!botLogin) return;

  const owner = channel.repository.owner;
  const repo = channel.repository.name;

  // Fetch the most recent 20 comments, newest first. `per_page=20` is
  // the GitHub max without paging; a single model turn cannot produce
  // more than a handful of comments, so 20 is more than enough.
  const response = await channel.github.request<readonly IssueComment[]>({
    method: "GET",
    path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=20&sort=created&direction=desc`,
  });
  const comments = response.body ?? [];

  const structured = findStructuredTriageComment(comments, TRIAGE_MARKER, botLogin);
  if (!structured) {
    // No structured comment found. The model either errored out
    // before posting one, or the marker lookup missed it (the latter
    // would be a bug in `post_triage_comment` — log it for visibility).
    // eslint-disable-next-line no-console -- dispatcher signal
    console.warn(
      `[channels/github] recap guard: no structured triage comment found on ${owner}/${repo}#${issueNumber}; skipping`,
    );
    return;
  }

  const structuredCreatedAt = Date.parse(structured.created_at);
  if (!Number.isFinite(structuredCreatedAt)) return;

  for (const comment of comments) {
    if (comment.id === structured.id) continue;
    if (!isRecapComment(comment, TRIAGE_MARKER, structuredCreatedAt, RECAP_WINDOW_SECONDS, botLogin)) {
      continue;
    }
    // eslint-disable-next-line no-console -- dispatcher signal
    console.warn(
      `[channels/github] recap guard: deleting comment ${comment.id} on ${owner}/${repo}#${issueNumber} (created ${comment.created_at})`,
    );
    await deleteComment(channel, owner, repo, comment.id);
  }
}