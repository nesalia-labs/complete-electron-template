# eve Agent Feasibility — INDEX

> One-screen comparison of all candidate `eve` agents. Source briefs live
> alongside this file (`<agent>.md` in the same folder). Each brief follows
> the 15-section template defined below. **Read this first, then dive into
> the brief for any candidate you're considering greenlighting.**

**Status:** draft
**Last updated:** 2026-06-22
**Owner:** `eve-expert` (populates briefs); `tech-lead` (greenlights the build order)

---

## 1. Methodology

Per-agent briefs are **feasibility scans, not implementation plans**. They
sit between "researching" and "deciding to build." A brief that argues
against building the agent is a successful brief — the point is to surface
bad ideas early, not to justify work.

### Brief template (15 sections, in order)

1. **Verdict** — one line: `yes` / `yes-with-conditions` / `defer` / `no`
2. **The job** — 1 paragraph
3. **Trigger model** — events, filters, schedules
4. **Directory shape** — high-level tree; same as `docs/learnings/eve/issue-triage.md` § 2 unless there's a real reason to deviate
5. **Channels + connections + safety boundaries** — which platforms, which MCPs, exact `tools: { allow: [...] }` / `block: [...]`
6. **Authored tools** — what the channel/MCP doesn't provide (often: zero)
7. **Skills** — list, one-line purpose each
8. **Persona sketch** — 5–10 standing-rule bullets, not the full `instructions.md`
9. **Schedules** — cron + intent
10. **Cost model** — model choice, expected call volume, est. monthly token spend
11. **Risk register** — concern × mitigation table
12. **v1 non-goals** — explicit out-of-scope, matching `issue-triage.md` § 11
13. **Open questions** — what needs the user's call before building
14. **Effort** — `effort: xs/s/m/l` from the label taxonomy, with reasoning
15. **Depends on** — prerequisite agents / patterns that must land first

### Three non-obvious rules

- **No code.** Structure and intent only. The point is to vet the design, not produce a diff. Code comes after the brief is approved.
- **Heavy cross-refs to `docs/learnings/eve/`.** It's the gold standard; anything that deviates justifies the deviation. New patterns that emerge (e.g., a CI-failure-triage pattern not in the issue-triage doc) get a `prior-art.md` addendum, not buried in the per-agent brief.
- **The verdict is mandatory and honest.** If the brief's own analysis argues against building, the verdict says so.

---

## 2. Comparison table

> Populated by `eve-expert` as briefs are written. Empty rows = not yet
> researched. Sort by recommended build order once verdicts land.

| Agent | Verdict | Effort | Trigger | Channels | Key risk | Brief |
|---|---|---|---|---|---|---|
| _empty_ | | | | | | |

---

## 3. Recommended build order

> Tentative, based on `docs/learnings/eve/monorepo.md` § 8 and the
> `docs/learnings/eve/issue-triage.md` design. Revised by `tech-lead` after
> briefs land.

1. **issue-triage** — anchor; design already done in `docs/learnings/eve/issue-triage.md`
2. **dep-update-handler** — highest PR volume class; fast ROI
3. **stale-issue-sweep** — cheapest scheduled agent
4. **ci-failure-triage** — high value, needs careful design on false-positive rate
5. **pr-triage** — port of issue-triage once it stabilizes
6. **pr-review-nudges**, **first-time-contributor** — community niceties

---

## 4. Cross-references

- `docs/learnings/eve/README.md` — framework orientation
- `docs/learnings/eve/api.md` — slot reference (`define*` import map)
- `docs/learnings/eve/runtime.md` — sessions, sandbox, channels, deploy
- `docs/learnings/eve/prior-art.md` — patterns + anti-patterns (extend when briefs surface new ones)
- `docs/learnings/eve/monorepo.md` — agent-as-peer principle, integration seams
- `docs/learnings/eve/issue-triage.md` — the worked example; the reference shape
- `docs/plans/` — implementation plans live here, created AFTER a brief is greenlit
