---
name: project-eval-agent-workflow-broken
description: The eval-agent.yml GitHub Actions workflow has never passed in repo history. Two runs to date (run #13 on 2026-06-25, run #14 on 2026-06-26), both failed. PR #31 was merged with this caveat.
metadata:
  type: project
---

# eval-agent.yml CI workflow — never validated

**Symptom**: The `.github/workflows/eval-agent.yml` workflow runs the v2 issue-triage agent's eval suite on PRs touching `agent/**`. As of 2026-06-26, it has **never passed**.

**Evidence** (`gh api repos/nesalia-labs/complete-electron-template/actions/workflows/eval-agent.yml/runs`):

| Run # | Date | Result | Branch |
|---|---|---|---|
| 13 | 2026-06-25 15:46:29Z | ❌ failure | `feat/v2-implementation` (PR that landed P5) |
| 14 | 2026-06-26 09:19:49Z | ❌ failure | `fix/double-comment-anti-pattern-v15` (PR #31) |

A 5-commit fix chain was applied on 2026-06-25 (`56629f2`, `b591639`, `558c105`, `0116b77`, `5e3d800`) trying to make run #13 pass. None of those fixes was validated against actual run output — there's no successful run after any of them.

**Why:** The workflow file's own comment (lines 7-11) claims:

> "The eval suite (under `agent/evals/`) is rule-based: tool-call shape, comment-section presence, label-name matches. **No LLM calls, no GitHub API calls, no secrets** — every fixture is a static JSON file, and the agent dev server runs in-process against the PR's code."

This is **wrong**. Reality:

1. The workflow DOES configure `MINIMAX_API_KEY: ${{ secrets.MINIMAX_SECRET_KEY }}` (line 82). The agent's main loop is LLM-backed (MiniMax M3 via BYOC, see `agent/agent.ts:78`), so the model call is the first thing in every turn. Without the secret, every eval falls over. The LLM works in CI (model classified #30 as `type: refactor` in run #14 logs).
2. The agent's tool calls DO hit GitHub. `apply_proposed_labels` and `post_triage_comment` both go through the `github-app` connection declared in `agent/agent.ts`. In CI, this connection has no authenticated user principal — `ConnectionAuthorizationFailedError: Connection "github-app" declares principalType "user" but the active session has no authenticated user principal`.
3. The sandbox workspace mount is incomplete in CI — `request_repo_info` and `read_file` sandbox tools fail with `File not found: /workspace/apps/desktop/src/main/projects.ts`.

So the eval framework runs the LLM (works), tries to call GitHub tools (fails: auth), tries to read sandbox files (fails: mount). 19 of 22 cases fail because most cases trigger at least one of those tool paths. The 3 that pass are pure-validation cases (probably label-formatting checks that don't need real tool calls).

**Impact:**

- PR #31 (double-comment anti-pattern fix) was merged with this caveat — its code is sound (manually verified), and the eval case 022 it adds is structurally correct (`times: 1` matcher is documented in `eve/dist/src/evals/match.d.ts`), but it is **not CI-validated** until the workflow is fixed.
- Any future PR adding agent eval cases will inherit the same broken baseline.
- The "regression gate" the eval suite was supposed to provide has never functioned in production.

**Why:** Reporter hygiene + framework expectation mismatch. The workflow was added aspirationally (claiming "no GitHub API calls") and never validated against a real run. Fixes were applied symptomatically.

**How to apply:**

1. **Before trusting any eval result from CI**, verify the workflow is currently passing. If it isn't, treat eval cases as documentation rather than enforcement.
2. **When adding new eval cases**, expect them to fail in CI for the same reasons. Don't block PRs on the broken gate.
3. **The fix work** (separate PR, separate task): the eval-agent workflow needs either (a) a fixture/mock for the GitHub App connection that provides an authenticated principal, (b) a fixture/mock for the sandbox workspace mount, or (c) a dedicated test GitHub App installation with CI-auth credentials. Option (a) is probably simplest — see how other agent CI setups mock the `principalType: "user"` requirement.
4. **Until the fix lands**, manual verification on the next incident-prone issue is the fallback for deploy-side guards. For model-side fixes, the model behavior in prod is the source of truth.

**Related:** [[project-agent-triage-v15-polish]] (item #1 was merged with this caveat), `agent/agent.ts:78` (the principalType declaration), `.github/workflows/eval-agent.yml` (the workflow file).