# Tech Lead Agent Memory Index

## Reference Memories
- [oRPC MessagePort Bridge](reference/orpc-bridge.md) — How main/renderer communicate via MessageChannel + IPC; central architectural seam
- [Package Boundary Rules](reference/package-boundary-rules.md) — Monorepo DAG and the api/settings sub-path carve-out for the renderer
- [Skills Overview](reference/skills-overview.md) — What a Claude Code skill is, SKILL.md format, vs agents/commands/hooks
- [Skills Frontmatter](reference/skills-frontmatter.md) — Complete SKILL.md frontmatter field reference (spec + Claude extensions)
- [Skills Invocation](reference/skills-invocation.md) — Auto vs manual invocation, semantic matching, paths/disable toggles
- [Loops & Scheduling](reference/loops-and-scheduling.md) — /loop command, cron expressions, jitter rules, 7-day expiry, session scope
- [Goals](reference/goals.md) — /goal command for condition-driven autonomous mode, evaluator model, writing effective conditions
- [Subagents](reference/subagents.md) — Built-in types, frontmatter, tool/MCP/permission scoping, hooks, memory, forks, nested limits
- [Workflows](reference/workflows.md) — Dynamic multi-agent orchestration scripts, agent/parallel/pipeline APIs, ultracode opt-in, patterns (adversarial verify, tournament, loop-until-dry), cost control
- [Hooks](reference/hooks.md) — All 28 lifecycle events, hook types, exit code semantics, stdin JSON schema, matcher patterns, security checklist
- [CLAUDE.md Hierarchy](reference/claude-md-hierarchy.md) — Load order of managed/user/project/local files, @import, rules/ paths, what reaches subagents, recommended structure
- [MCP](reference/mcp.md) — .mcp.json config, transports (stdio/http/sse/ws), scopes, subagent mcpServers frontmatter, allowedMcpServers/deniedMcpServers, OAuth, mcp__<server>__<tool> naming
- [Plan Mode](reference/plan-mode.md) — EnterPlanMode/ExitPlanMode flow, 5-phase workflow, Plan subagent internals, allowedPrompts, composition with /goal and subagents
- [Agent Teams](reference/agent-teams.md) — Lead+peer sessions, SendMessage API, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, shared task list, vs subagents/workflows (experimental)
- [Permissions & Settings](reference/permissions-and-settings.md) — All 6 modes, settings.json precedence, env var flags, bypassPermissions trust list, least-privilege patterns
- [Agent SDK](reference/agent-sdk.md) — query()/ClaudeSDKClient, full ClaudeAgentOptions, headless claude -p, canUseTool, programmatic subagents, TS+Py type cheats
- [Plugins](reference/plugins.md) — plugin.json manifest, components (commands/skills/agents/hooks/MCP), subagent restrictions, marketplace, authoring walkthrough

## Project Memories
- [Monorepo Structure](project/monorepo-structure.md) — Package relationships and dependencies
- [DB Refactor State](project/project-db-refactor-state.md) — Senior DI factory, auto-migrations, integration tests landed 2026-06-19
- [Logging State](project/project-logging-state.md) — Junior-grade: 3 console.* calls, no library, no file sink, wal_checkpoint silently swallowed
- [Fumadocs Evaluation](project/project-fumadocs-evaluation.md) — Strong fit for TanStack Start stack; adoption blocked on 4 open questions; spike recommended
- [Template Audit 2026-06-22](project/project-template-audit-2026-06-22.md) — 3 critical + 5 major findings; full plan at `docs/plans/template-audit-remediation.md`; 6-PR migration sequencing; user mandated tsconfig paths over `fix-imports.mjs` band-aid
- [shadcn Monorepo Pattern](project/project-shadcn-monorepo-pattern.md) — CSS export must point to src/, @source directives required in package + consumer stylesheets; Tailwind v4 doesn't cross workspace boundaries
- [V2.0.0 Direction](project/project-v2-direction.md) — Sidebar layout, settings system, theming, projects page. All decisions resolved. Full spec at `docs/internal/product/releases/v2.0.0/SPEC.md`. 5 features, ~36–54h total.
- [F2 Settings Architecture](project/project-f2-settings-architecture.md) — F2+F3 merged in V2.2, registry in `packages/api/src/settings/`, recentProjects in `global.db`, edit-time extensibility via `app-settings.ts`.
- [F2 PR 1 Foundation State](project/project-f2-pr1-foundation-state.md) — Registry, electron-store stub, oRPC procedures, hooks landed 2026-06-23. 36 tests pass. PR 3 swaps InMemoryStore for electron-store.
- [Agent Triage v1.5 Polish](project/project-agent-triage-v15-polish.md) — Item #1 (double-comment) resolved 2026-06-26 via PR #31 (HARD RULE + turn.completed hook + case 022). Items #2 (re-triage on labeled) and #3 (@triage-bot) still deferred.
- [Eval Agent Workflow Broken](project/project-eval-agent-workflow-broken.md) — `.github/workflows/eval-agent.yml` has never passed (2 runs, both failed). PR #31 merged with this caveat; case 022 isn't CI-validated.

## Learning Memories
- [CI/CD Workflows](learnings/ci-cd-patterns.md) — 17 workflows, one-action-per-workflow principle
- [CI Atomic Principle](learnings/ci-atomic-principle.md) — One file = one action, with 2 documented exceptions (build-desktop.yml, release-desktop.yml) and the rationale
- [Vercel Monorepo Subdirectory](learnings/vercel-monorepo-subdirectory.md) — Nitro/eve writes output to workspace root; Vercel Root Directory must also be repo root, not the subdirectory, or deploy 404s. Framework presets supersede user buildCommand — don't use cp workaround.

## Feedback Memories
- [Template Philosophy](feedback/template-philosophy.md) — **The north star**: code should shock, 45 min on a detail is fine, excellence over speed
- [Communication Style](feedback/communication-style.md) — Language, tone, length, escalation rules
- [Quality Bar](feedback/quality-bar.md) — Security-first, schema-first, type-safe, pragmatic excellence
- [Working Style](feedback/working-style.md) — Orchestrator identity, gated agent/skill changes, research-first, n+1/n/n-1
- [Code Taste](feedback/code-taste.md) — Patterns to preserve, anti-patterns with file:line, established conventions
- [Code Style and Structure](feedback/code-style-and-structure.md) — File naming, directory layout, imports/exports, naming conventions, error handling, testing
- [Investigate Before Recommending](feedback/feedback-investigate-before-recommending.md) — Wants deep analysis with source-level evidence, not menus
- [oRPC Bootstrap at Boot](feedback/feedback-orpc-bootstrap-at-boot.md) — initORPC must be awaited in main.tsx before first render, not in a route's useEffect (F2 PR 1-5 gotcha)
- [CI Three Gates](feedback/feedback-ci-three-gates.md) — delegated PRs must pass lint + typecheck + build locally; typecheck alone missed ESLint + Rolldown failures on F2 rollout
- [Subagent Pushback as Signal](feedback/subagent-pushback-as-signal.md) — when a sub-agent refuses with sources, verify before re-briefing; 2026-06-25 priority-label incident where the tech-lead's brief was internally contradictory and only caught by eve-expert's pushback
- [Electron Security Model](feedback/electron-security-model.md) — sandbox:false is deliberate; 4-layer compensating control (CSP + origin filter + contextIsolation + no nodeIntegration). Never propose sandbox:true or relax CSP/origin without explicit review.
- [Issue Body File References](feedback/feedback-issue-body-file-references.md) — every file reference in a filed issue body must be reachable via the Contents API on the branch the eve bot fetches; never reference unpushed local docs (2026-06-26 #30 incident).
- [Deploy-Side Recap Hook](feedback/deploy-side-recap-hook.md) — when prose rules in instructions.md get repeatedly violated, escalate to a deploy-side hook (eve's turn.completed handler). Precedent: PR #31.

## User Memories
- [User Role: Senior Dev](user/user-role-senior-dev.md) — Senior TS dev, Electron/oRPC/Drizzle, French-speaking

<!-- Add new memories above this line, keep under 200 lines -->