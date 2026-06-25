/**
 * Eval-run config for the v2 issue-triage agent.
 *
 * P5 of the v2 design (see
 * `docs/internal/architecture/agents/reports/issue-triage-v2-design.md`).
 *
 * No judge model is configured: every assertion in this suite is
 * rule-based (tool-call shape, comment-section presence, label-name
 * matches). LLM-as-judge is intentionally deferred per the
 * non-goals — we want evals to be deterministic and runnable on
 * every PR without burning tokens.
 *
 * `maxConcurrency: 1` because the triage agent has one GitHub
 * channel that processes issues sequentially; running multiple
 * evals in parallel against the same dev server does not buy us
 * anything and can mask ordering bugs in the dispatcher.
 *
 * `timeoutMs: 60_000` is generous for one triage turn. The agent
 * commonly calls 3-5 tools (load_skill, request_repo_info,
 * apply_proposed_labels, post_triage_comment) and Sonnet at high
 * volume is ~5-15s per turn. 60s gives ample headroom for cold
 * model caches without making a stuck eval block CI.
 */
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  maxConcurrency: 1,
  timeoutMs: 60_000,
});