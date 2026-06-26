/**
 * Shared helpers for the v2 issue-triage eval suite.
 *
 * Centralizes the eval-side boilerplate so each `*.eval.ts` file stays
 * focused on what it's testing:
 *
 * - `loadFixture` — read a fixture JSON by id
 * - `formatIssueAsUserMessage` — render title + body as the user
 *   message the agent sees (eval mode bypasses the GitHub `onIssue`
 *   channel and sends a plain user message)
 * - `arrayIncludes` — function matcher for `apply_proposed_labels.input.labels`
 *   (eve@0.13.3 matches arrays exactly, but the agent doesn't control
 *   the order of the labels array)
 * - `expectLabelsApplied` — convenience that asserts a set of labels
 *   were applied via `apply_proposed_labels` (each call applies the
 *   agent's proposed diff, so a single call covers all three)
 *
 * Kept as `_helpers.ts` (note the underscore) so the discovery layer
 * skips it — only `*.eval.ts` files are picked up as evals.
 */

import fixture001 from "../fixtures/001-clear-bug.json";
import fixture002 from "../fixtures/002-bug-missing-repro.json";
import fixture003 from "../fixtures/003-feature-clear-use-case.json";
import fixture004 from "../fixtures/004-bug-with-duplicate.json";
import fixture005 from "../fixtures/005-bug-with-file-paths.json";
import fixture006 from "../fixtures/006-refactor.json";
import fixture007 from "../fixtures/007-docs.json";
import fixture008 from "../fixtures/008-security.json";
import fixture009 from "../fixtures/009-out-of-scope.json";
import fixture010 from "../fixtures/010-bug-p0-critical.json";
import fixture011 from "../fixtures/011-bug-long-body.json";
import fixture012 from "../fixtures/012-feature-no-template.json";
import fixture013 from "../fixtures/013-edit-no-material-change.json";
import fixture014 from "../fixtures/014-edit-material-change.json";
import fixture015 from "../fixtures/015-label-status-change.json";
import fixture016 from "../fixtures/016-label-non-status-change.json";
import fixture017 from "../fixtures/017-closed-purge.json";
import fixture018 from "../fixtures/018-reopened.json";
import fixture019 from "../fixtures/019-bug-with-template-match.json";
import fixture020 from "../fixtures/020-feature-effort-large.json";
import fixture021 from "../fixtures/021-priority-label-actually-applies.json";
import fixture022 from "../fixtures/022-no-double-comment.json";
import fixture023 from "../fixtures/023-mention-by-maintainer.json";
import fixture024 from "../fixtures/024-mention-by-contributor.json";
import fixture025 from "../fixtures/025-mention-on-pr-review-thread.json";
import fixture026 from "../fixtures/026-bot-self-mention.json";
import fixture027 from "../fixtures/027-non-mention-comment-by-maintainer.json";

/**
 * Fixture shape (subset of what the agent receives in `onIssue`).
 * Mirrors GitHub's `issues` event payload. We only declare the
 * fields evals read.
 */
export interface Fixture {
  readonly description: string;
  readonly event: string;
  readonly action: string;
  readonly issue: {
    readonly body: string;
    readonly labels: readonly string[];
    readonly number: number;
    readonly title: string;
    readonly user: { readonly login: string };
  };
  readonly repository: {
    readonly name: string;
    readonly owner: { readonly login: string };
  };
  readonly expected: {
    readonly labels_applied: readonly string[];
    readonly proposed_status: string | null;
    readonly rationale: string;
  };
}

/**
 * Fixture shape for v2.5 mention-dispatch cases (023-027). Mirrors
 * GitHub's `issue_comment` / `pull_request_review_comment` event
 * payload. Separate from {@link Fixture} because the triage and
 * mention shapes have non-overlapping top-level fields (`issue` vs
 * `comment`) and disjoint `expected` shapes — a union would force
 * every triage eval case to narrow on `kind`, which buys nothing.
 */
export interface MentionFixture {
  readonly description: string;
  readonly event: string;
  readonly action: string;
  readonly issue: {
    readonly body: string;
    readonly number: number;
    readonly title: string;
  } | null;
  readonly pull_request: {
    readonly body: string;
    readonly number: number;
    readonly title: string;
  } | null;
  readonly comment: {
    readonly body: string;
    readonly id: number;
    readonly user: { readonly login: string; readonly type: string };
    readonly author_association: string;
  };
  readonly repository: {
    readonly name: string;
    readonly owner: { readonly login: string };
  };
  readonly expected: {
    readonly dispatches: boolean;
    readonly replies_with: "chat" | "triage" | null;
    readonly rationale: string;
  };
}

const FIXTURES: Readonly<Record<string, Fixture>> = {
  "001-clear-bug": fixture001 as Fixture,
  "002-bug-missing-repro": fixture002 as Fixture,
  "003-feature-clear-use-case": fixture003 as Fixture,
  "004-bug-with-duplicate": fixture004 as Fixture,
  "005-bug-with-file-paths": fixture005 as Fixture,
  "006-refactor": fixture006 as Fixture,
  "007-docs": fixture007 as Fixture,
  "008-security": fixture008 as Fixture,
  "009-out-of-scope": fixture009 as Fixture,
  "010-bug-p0-critical": fixture010 as Fixture,
  "011-bug-long-body": fixture011 as Fixture,
  "012-feature-no-template": fixture012 as Fixture,
  "013-edit-no-material-change": fixture013 as Fixture,
  "014-edit-material-change": fixture014 as Fixture,
  "015-label-status-change": fixture015 as Fixture,
  "016-label-non-status-change": fixture016 as Fixture,
  "017-closed-purge": fixture017 as Fixture,
  "018-reopened": fixture018 as Fixture,
  "019-bug-with-template-match": fixture019 as Fixture,
  "020-feature-effort-large": fixture020 as Fixture,
  "021-priority-label-actually-applies": fixture021 as Fixture,
  "022-no-double-comment": fixture022 as Fixture,
};

const MENTION_FIXTURES: Readonly<Record<string, MentionFixture>> = {
  "023-mention-by-maintainer": fixture023 as unknown as MentionFixture,
  "024-mention-by-contributor": fixture024 as unknown as MentionFixture,
  "025-mention-on-pr-review-thread": fixture025 as unknown as MentionFixture,
  "026-bot-self-mention": fixture026 as unknown as MentionFixture,
  "027-non-mention-comment-by-maintainer": fixture027 as unknown as MentionFixture,
};

export function loadFixture(id: string): Fixture {
  const fixture = FIXTURES[id];
  if (!fixture) {
    throw new Error(`Unknown fixture: ${id}. Add it to FIXTURES in evals/cases/_helpers.ts.`);
  }
  return fixture;
}

/**
 * Loader for v2.5 mention-dispatch fixtures (023-027). Kept separate
 * from {@link loadFixture} so the two fixture kinds cannot be
 * accidentally cross-loaded. The mention evals call this directly.
 */
export function loadMentionFixture(id: string): MentionFixture {
  const fixture = MENTION_FIXTURES[id];
  if (!fixture) {
    throw new Error(
      `Unknown mention fixture: ${id}. Add it to MENTION_FIXTURES in evals/cases/_helpers.ts.`,
    );
  }
  return fixture;
}

/**
 * Render a fixture's GitHub issue as the user message the agent sees.
 * In eval mode, the GitHub `onIssue` channel is bypassed — the eval
 * sends a plain user message. We serialize the fields the agent's
 * triage-workflow skill expects: title and body. We omit the labels
 * field because the agent reads them off the issue object during a
 * real GitHub event, and the eval-mode message is the equivalent of
 * the webhook payload's `issue.body` + `issue.title`.
 */
export function formatIssueAsUserMessage(issue: {
  readonly body: string;
  readonly title: string;
}): string {
  return `# ${issue.title}\n\n${issue.body}`;
}

/**
 * Matcher helper: returns true when `value` is an array that contains
 * `needle`. Used as a function matcher for `apply_proposed_labels.input.labels`
 * because the order of the labels array is not part of the agent's
 * contract (the agent decides the order; the matcher should not care).
 *
 * Per `EveEvalValueMatcher`: a function matcher that returns a boolean
 * is treated as a verdict.
 */
export function arrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.includes(needle);
}

/**
 * Convenience assertion: assert that `apply_proposed_labels` was called
 * with an input whose `labels` array contains ALL of `expectedLabels`.
 *
 * Note: this checks the LAST `apply_proposed_labels` call's input
 * because `calledTool` matches "at least one" by default. If the agent
 * calls the tool multiple times (e.g. once for the initial triage,
 * again for a re-triage), only the final call is asserted. That is the
 * intended behavior — we care about the final label set, not the
 * intermediate ones.
 */
export function expectLabelsApplied(
  expectedLabels: readonly string[],
): { readonly input: { readonly labels: (value: unknown) => boolean } } {
  if (expectedLabels.length === 0) {
    throw new Error(
      "expectLabelsApplied called with empty labels. Use t.notCalledTool('apply_proposed_labels') instead.",
    );
  }
  return {
    input: {
      labels: (value: unknown) =>
        Array.isArray(value) && expectedLabels.every((label) => value.includes(label)),
    },
  };
}

/**
 * Assert `apply_proposed_labels` was NOT called. Use for "no labels
 * applied" cases (off-topic issues, no-op edited events, closed events).
 */
export function notCalledApplyLabels(): { readonly name: string } {
  return { name: "apply_proposed_labels" } as const;
}

/**
 * Assert `apply_proposed_labels` returned `applied` containing ALL
 * of `expectedLabels`. Unlike `expectLabelsApplied`, which checks the
 * tool's INPUT, this checks the OUTPUT — i.e., the label actually
 * landed on the issue (not in `unknownInRepo`).
 *
 * Use this for "did the label apply?" assertions. The two matchers
 * together catch the class of bugs where the validator accepts a label
 * format that the repo doesn't have (input looks right, output is
 * silently empty).
 */
export function expectLabelsActuallyApplied(
  expectedLabels: readonly string[],
): { readonly output: { readonly applied: (value: unknown) => boolean } } {
  if (expectedLabels.length === 0) {
    throw new Error(
      "expectLabelsActuallyApplied called with empty labels. Use t.notCalledTool('apply_proposed_labels') instead.",
    );
  }
  return {
    output: {
      applied: (value: unknown) =>
        Array.isArray(value) && expectedLabels.every((label) => value.includes(label)),
    },
  };
}