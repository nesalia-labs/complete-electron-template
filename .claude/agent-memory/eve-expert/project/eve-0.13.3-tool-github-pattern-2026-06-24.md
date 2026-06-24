---
name: eve-0.13.3-tool-github-pattern-2026-06-24
description: API delta between eve beta (0.6.0-beta.20) and stable 0.13.3 for calling GitHub from authored tools. The ctx.github.request(...) helper that betas exposed on ToolContext is gone. The only public path is ctx.getToken(provider) with an inline auth provider that mints installation tokens from the App's PEM key. Use this pattern whenever an authored tool needs to call GitHub REST in eve@0.13.3+.
metadata:
  type: project
---

## The API delta

In eve beta (0.6.0-beta.20), `ToolContext` exposed `ctx.github.request({ method, path, body })` and `GitHubIssueEvent` exposed `issue.label?.name` on the labeled action. Both were removed in the stable 0.13.3 refactor.

In stable 0.13.3:

- `ToolContext` = `SessionContext & { getToken(provider), requireAuth(provider) }`. No `ctx.github`.
- `ctx.github.request(...)` only exists on `GitHubInboundContext` (channel hook contexts), which is what `onIssue`/`onComment`/`onPullRequest` receive — not what tools receive.
- `GitHubIssueEvent` is `{ action, issueNumber, raw }` only. The added-label info is in the top-level webhook payload's `raw`, which the `onIssue` signature does NOT surface.
- `callGitHubApi(...)` and the other `eve/channels/github/api.js` helpers are present but NOT re-exported from the public `eve/channels/github` entry, and the deep path is blocked by `package.json#exports`.

**Why:** The channel refactor in 0.13 separated inbound-context (channel handlers) from session-context (tools/hooks) and pushed outbound auth through the inline `getToken(provider)` flow.

**How to apply:** When you see a beta-era scaffold that calls `ctx.github.request(...)` from a tool, the fix is NOT a one-line import swap. You need:

1. An inline `ToolAuthProvider` with `principalType: "user"` and a `getToken` that mints a GitHub installation token from `process.env.GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`, keyed by `principal.attributes.installation_id` (which `defaultGitHubAuth` stamps on every GitHub-triggered turn).
2. A `callGitHub(ctx, method, path, body?)` helper that calls `ctx.getToken(provider, { authKey })` and then `fetch()`s the API with the bearer token.
3. Each tool imports the helper and replaces `ctx.github.request(...)` with `callGitHub(ctx, ...)`.

Token minting (RS256 JWT, 10-min expiry, `iat: now-60` to tolerate clock skew; exchange at `POST /app/installations/{id}/access_tokens`) mirrors `eve/dist/src/public/channels/github/auth.js#createGitHubAppJwt` + `createGitHubInstallationToken`. Cache the token in-process per `installation_id` and refresh 60s before GitHub's reported `expires_at`. The runtime's per-step `getToken` cache is keyed on `(scope, principalKey)` so a `principalType: "user"` provider keyed on `installation_id` works correctly across a single step.

The labeled-action re-triage trigger (`issue.action === "labeled"` + check the added label name) is NOT implementable in 0.13.3 without reaching into the webhook payload's top-level `raw`. Drop the trigger and defer to v1.5 per the design doc; do NOT reach into undocumented payload shape.

## Concrete pattern (used in agent/agent.ts)

```ts
export const githubAuth: ToolAuthProvider = {
  principalType: "user",
  getToken: async (opts) => {
    const principal = opts.principal as {
      readonly attributes?: Readonly<Record<string, string | readonly string[]>>;
      readonly id: string; readonly issuer: string; readonly type: "user";
    };
    const installationId = readAttr(principal.attributes, "installation_id");
    if (!installationId) throw new Error("githubAuth: no installation_id");
    return await mintInstallationToken(installationId);
  },
};
```

The principal-cast is a structural-typing hack; the runtime guarantee comes from `principalType: "user"` in `resolveConnectionPrincipal` (`eve/dist/src/runtime/connections/principal.js`). Document the cast with a comment pointing to the runtime file.

## Acceptance criteria gotcha for the agent/ workspace

- pnpm-workspace.yaml's literal `'agent'` entry makes pnpm treat `agent/` as a workspace root and creates `agent/node_modules/`. This produces a `discover/unsupported-directory` warning from `eve info` that is not fixable without removing the literal entry from the workspace (which would break the workspace model).
- The warning is unavoidable given the current scaffolding. The .gitignore entry (`agent/node_modules/`) prevents git pollution; the warning is informational. The original PR's acceptance criteria claimed the warning would also be gone — that goal is incompatible with the workspace wiring.
