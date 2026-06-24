import { defineAgent } from "eve";

/**
 * Issue-triage agent for the `complete-electron-template` repo.
 *
 * Model choice: Sonnet for high-volume GitHub issue triage. The PR-triage
 * reference template uses the same default; Haiku is the documented escape
 * hatch under cost pressure, Opus is wrong-shape for sustained triage volume.
 */
export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
});