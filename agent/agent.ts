import { createSign } from "node:crypto";
import { defineAgent } from "eve";
import type { ToolAuthProvider } from "eve/tools";
import { minimax } from "vercel-minimax-ai-provider";

import { getDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

/**
 * Issue-triage agent for the `complete-electron-template` repo.
 *
 * Model choice: Sonnet for high-volume GitHub issue triage. The PR-triage
 * reference template uses the same default; Haiku is the documented escape
 * hatch under cost pressure, Opus is wrong-shape for sustained triage volume.
 *
 * The named exports below (`githubAuth`, `callGitHub`, `GitHubApiError`)
 * are the shared GitHub REST helper used by the authored tools in
 * `agent/tools/`. In `eve@0.13.3` the `ToolContext` no longer carries
 * `ctx.github.request(...)` (which existed in earlier betas); the only
 * public path to call GitHub from a tool is via `ctx.getToken(provider)`
 * with an inline auth provider. `githubAuth` mints short-lived GitHub
 * App installation tokens using the channel's existing
 * `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` env vars, keyed off the
 * `installation_id` that `defaultGitHubAuth` stamps into the session
 * auth attributes.
 *
 * Migration bootstrap: the v2 state backend (Turso, see `agent/db/`)
 * needs its schema applied before any turn or schedule reads/writes
 * to it. We fire the migration as a module-load side effect — the
 * promise is attached to a fire-and-forget `void` so it does not
 * block module evaluation, and any error surfaces in the Vercel
 * function logs (the next tool call that hits the DB will also
 * fail-throw, but the boot itself is not blocked). Drizzle's
 * migrator is idempotent so re-runs are safe. See
 * `agent/db/migrate.ts` for the runner and `agent/db/client.ts` for
 * the env-var-driven client factory.
 *
 * Imports are STATIC (not dynamic) on purpose: `eve@0.13.3`'s
 * `getSingleRolldownChunk` invariant requires a single bundled
 * chunk per authored module, and `import("./db/client.js")` would
 * cause rolldown to code-split `agent.ts`. Inline imports keep the
 * bundle atomic at the cost of always pulling the Turso client +
 * Drizzle migrator into the function — fine for our deploy, where
 * the function size budget is comfortable.
 */
void (async () => {
  try {
    const db = await getDb();
    await runMigrations(db);
  } catch (error) {
    // eslint-disable-next-line no-console -- intentional: bootstrap signal
    console.warn(
      `[agent] startup migration failed (will surface on first DB call): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
})();

export default defineAgent({
  name: "@electron-template/agent",
  model: minimax("MiniMax-M3"),
});

/**
 * Inline auth provider that resolves a GitHub App installation token
 * for the active session. Bound to the session's `installation_id`
 * attribute (set by `defaultGitHubAuth` on every GitHub-triggered
 * turn); the runtime caches the resulting `TokenResult` per session
 * principal, and this module's own `installationTokenCache` further
 * deduplicates across sessions against the same installation.
 *
 * Typed as `ToolAuthProvider` so the runtime's
 * `ctx.getToken(githubAuth)` accepts it. Because `principalType: "user"`
 * narrows the runtime's `ConnectionPrincipal` to the user-shaped
 * variant, we type the callback parameter accordingly.
 */
export const githubAuth: ToolAuthProvider = {
  principalType: "user",
  getToken: async (opts) => {
    // Runtime guarantee: with `principalType: "user"`, the runtime
    // narrows `ConnectionPrincipal` to the user variant. Asserting
    // here is the same trust contract the rest of the framework
    // uses — see `resolveConnectionPrincipal` in
    // `eve/dist/src/runtime/connections/principal.js`.
    const principal = opts.principal as {
      readonly attributes?: Readonly<Record<string, string | readonly string[]>>;
      readonly id: string;
      readonly issuer: string;
      readonly type: "user";
    };
    const installationId = readAttr(principal.attributes, "installation_id");
    if (!installationId) {
      throw new Error(
        "githubAuth: no `installation_id` on the session — only GitHub-" +
          "triggered turns have one. Calling GitHub from a non-GitHub turn " +
          "is a programmer error.",
      );
    }
    return await mintInstallationToken(installationId);
  },
};

function readAttr(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string,
): string | undefined {
  if (!attributes) return undefined;
  const value = attributes[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/** Per-installation token cache, keyed by `installation_id`. */
const installationTokenCache = new Map<
  string,
  { readonly expiresAtMs: number; readonly token: string }
>();

async function mintInstallationToken(
  installationId: string,
): Promise<{ readonly token: string; readonly expiresAt?: number }> {
  const cached = installationTokenCache.get(installationId);
  // GitHub installation tokens are valid for one hour; the eve helper
  // (see eve/dist/src/public/channels/github/auth.js) refreshes 60s
  // before expiry. We mirror that.
  if (cached && Date.now() < cached.expiresAtMs - 60_000) {
    return { expiresAt: cached.expiresAtMs, token: cached.token };
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId) {
    throw new Error("githubAuth: GITHUB_APP_ID is required.");
  }
  if (!privateKey) {
    throw new Error("githubAuth: GITHUB_APP_PRIVATE_KEY is required.");
  }

  const jwt = signAppJwt(appId, privateKey);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `githubAuth: installation token exchange failed with HTTP ` +
        `${response.status}${text ? `: ${text}` : ""}`,
    );
  }
  const body = (await response.json()) as { token?: unknown; expires_at?: unknown };
  if (typeof body.token !== "string") {
    throw new Error("githubAuth: installation token response missing `token`.");
  }
  const expiresAtMs =
    typeof body.expires_at === "string" && Number.isFinite(Date.parse(body.expires_at))
      ? Date.parse(body.expires_at)
      : Date.now() + 60 * 60 * 1000;
  installationTokenCache.set(installationId, { expiresAtMs, token: body.token });
  return { expiresAt: expiresAtMs, token: body.token };
}

function signAppJwt(appId: string, privateKey: string): string {
  // GitHub-hosted env vars use literal "\n" to embed newlines in PEM
  // keys; the eve helper normalizes them (see
  // eve/dist/src/public/channels/github/auth.js#normalizeGitHubPrivateKey).
  const key = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { exp: nowSeconds + 600, iat: nowSeconds - 60, iss: appId };
  const encoding = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${encoding(header)}.${encoding(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key, "base64url");
  return `${signingInput}.${signature}`;
}

/** HTTP methods supported by {@link callGitHub}. */
export type GitHubApiMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

/** Successful GitHub API response. Non-2xx throws {@link GitHubApiError}. */
export interface GitHubApiResponse<T = unknown> {
  readonly body: T;
  readonly ok: boolean;
  readonly status: number;
}

/** Error thrown for non-2xx GitHub API responses from {@link callGitHub}. */
export class GitHubApiError extends Error {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  constructor(input: {
    readonly body: unknown;
    readonly method: string;
    readonly path: string;
    readonly status: number;
  }) {
    super(`GitHub ${input.method} ${input.path} failed with HTTP ${input.status}.`);
    this.name = "GitHubApiError";
    this.body = input.body;
    this.method = input.method;
    this.path = input.path;
    this.status = input.status;
  }
}

/**
 * Minimal subset of `ToolContext` that {@link callGitHub} relies on.
 * Lets the call sites pass `ctx` without coupling to the full
 * `ToolContext` surface (which contains ~20 other accessors the
 * helper has no business touching). The full `ToolContext` is
 * structurally assignable to this interface, so a `defineTool`
 * `execute(input, ctx)` can pass `ctx` directly.
 */
export interface CallGitHubContext {
  getToken(
    provider: ToolAuthProvider,
    options?: { readonly authKey?: string },
  ): Promise<{ readonly token: string; readonly expiresAt?: number }>;
}

/**
 * Calls an arbitrary GitHub REST path with installation-token auth.
 * Replacement for the beta-era `ctx.github.request(...)` API that
 * `eve@0.13.3` removed from `ToolContext`.
 */
export async function callGitHub<T = unknown>(
  ctx: CallGitHubContext,
  method: GitHubApiMethod,
  path: string,
  body?: unknown,
): Promise<GitHubApiResponse<T>> {
  const { token } = await ctx.getToken(githubAuth, { authKey: "github-app" });
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  const response = await fetch(`https://api.github.com${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });
  const responseBody = response.status === 204
    ? null
    : await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubApiError({
      body: responseBody,
      method,
      path,
      status: response.status,
    });
  }
  return { body: responseBody as T, ok: true, status: response.status };
}