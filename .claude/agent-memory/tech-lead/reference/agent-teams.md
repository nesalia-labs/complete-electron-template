---
name: agent-teams
description: How Claude Code agent teams work — lead + peer sessions, SendMessage API (with full source-level detail), task DAG, inbox file format, hooks, display modes, permissions, and known limitations.
metadata:
  type: reference
---

# Agent Teams

Agent teams let **multiple Claude Code instances coordinate as peers**, with a shared task list, direct messaging between teammates, and a lead session that orchestrates the whole thing. The lead is the main session; teammates are full, independent Claude Code sessions that can message each other directly (not just report back to a parent).

**Status:** Experimental. Disabled by default. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

## Activation

```json
// .claude/settings.json or env
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

Or shell:
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

Without the variable: **no team set up, no team directories written, no teammates proposed** by Claude.

## Key version milestones

| Version | Change |
|---|---|
| **v2.1.178+** | `TeamCreate` / `TeamDelete` removed. Teams auto-create on first teammate spawn. Auto-cleanup when session ends. `team_name` input on Agent tool accepted but ignored. `team_name` field in `TaskCreated` / `TaskCompleted` / `TeammateIdle` hook payloads is deprecated. |
| **v2.1.179+** | `teammateMode` default changed from `"auto"` to `"in-process"`. Set `"auto"` explicitly to get split-pane behavior when already in tmux/iTerm2. |
| **v2.1.181+** | Idle teammates hide from the panel after 30 seconds; reappear on next turn. Stays addressable while hidden. |
| **UDS_INBOX feature** | Adds Unix-domain-socket (`uds:<path>`) and Remote Control bridge (`bridge:<session-id>`) recipient addresses for cross-session messaging. |

## Architecture

```
┌────────────────────────────────────────────┐
│ Team Lead (main session)                   │
│ - Spawns teammates                         │
│ - Creates/assigns tasks (TaskCreate/Update)│
│ - Coordinates (SendMessage)                │
│ - Synthesizes results                      │
├────────────────────────────────────────────┤
│ Teammate-A │ Teammate-B │ Teammate-C       │
│ (tmux)     │ (iTerm2)   │ (in-process)     │
│ Shared task list                          │
│ Can DM each other directly                 │
└────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────┐
│ Shared filesystem (~/.claude/)            │
│ ├── teams/{name}/config.json               │
│ ├── teams/{name}/inboxes/*.json            │
│ ├── tasks/{name}/.lock + *.json            │
└────────────────────────────────────────────┘
```

**Key characteristics:**
- **Filesystem-based distributed coordination** — no central scheduler
- **Heterogeneous backends** — teammates can run in tmux, iTerm2, or in-process
- **Message-driven async** — agents don't poll; messages auto-deliver as new conversation turns
- **One team per session** — lead is fixed, can't promote a teammate or transfer leadership
- **No nested teams** — teammates can't spawn their own teammates; only the lead manages the team

## Team config schema (`~/.claude/teams/{name}/config.json`)

```jsonc
{
  "name": "analysis-team",                    // unique team identifier
  "description": "Team purpose",
  "createdAt": 1770535107409,                 // Unix ms
  "leadAgentId": "team-lead@analysis-team",    // format: {name}@{team}
  "leadSessionId": "c93b690c-...",
  "hiddenPaneIds": [],                        // UI state
  "teamAllowedPaths": [                       // team-wide permission grants
    { "path": "/path", "toolName": "Edit", "addedBy": "team-lead", "addedAt": 1770535107409 }
  ],
  "members": [
    {
      "agentId": "team-lead@analysis-team",
      "name": "team-lead",
      "agentType": "team-lead",
      "model": "claude-opus-4-6",
      "joinedAt": 1770535107409,
      "tmuxPaneId": "",                       // empty for lead
      "cwd": "/path/to/project",
      "subscriptions": []
    },
    {
      "agentId": "researcher-config@analysis-team",
      "name": "researcher-config",            // used as SendMessage recipient
      "agentType": "general-purpose",
      "model": "claude-opus-4-6",
      "prompt": "Initial task instructions",
      "color": "blue",                        // UI color
      "planModeRequired": false,              // require plan approval before execution
      "joinedAt": 1770535144590,
      "tmuxPaneId": "%14",                    // globally incrementing across all tmux
      "cwd": "/path/to/project",
      "worktreePath": "/path",                // optional: isolated worktree
      "sessionId": "9af1...",                 // optional: teammate session UUID
      "subscriptions": [],
      "backendType": "tmux",                  // tmux | iterm2 | in-process
      "isActive": true,                       // false = idle/inactive
      "mode": "acceptEdits"                   // current permission mode (mirrored for UI)
    }
  ]
}
```

**Color cycle (8 fixed):** `red, blue, green, yellow, purple, orange, pink, cyan`. Lead consumes `red` in runtime AppState; first persisted teammate is `blue`. Index increments on each assignment, wraps after `cyan`.

**tmux pane IDs are globally incrementing**, not team-scoped. Don't assume contiguous IDs within a team.

**`subscriptions` field is reserved** — always empty array, no runtime effect.

## SendMessage API (source-level)

From `src/tools/SendMessageTool/SendMessageTool.ts`. Input schema:

```ts
{
  to: string,                    // recipient: name, "*" for broadcast, "uds:<path>", "bridge:<id>"
  summary?: string,              // 5-10 word preview (REQUIRED when message is string)
  message: string | StructuredMessage
}

StructuredMessage = discriminatedUnion('type', [
  { type: 'shutdown_request', reason?: string },
  { type: 'shutdown_response', request_id: string, approve: boolean, reason?: string },
  { type: 'plan_approval_response', request_id: string, approve: boolean, feedback?: string }
])
```

### Recipient formats

| Format | Meaning | Notes |
|---|---|---|
| `name` | Direct message to teammate by name | Bare name, no `@` allowed (validation rejects) |
| `*` | Broadcast to all teammates | **Plain text only** — structured messages cannot be broadcast |
| `uds:<socket-path>` | Local peer via Unix domain socket | UDS_INBOX feature |
| `bridge:<session-id>` | Remote Control peer (cross-machine) | **Requires user approval** (safetyCheck, bypass-immune — cross-machine prompt injection must stay gated) |

### Validation rules (from source)

- `to` must not be empty
- `to` must not contain `@` (only one team per session)
- Plain string message → `summary` required
- Structured message + `to: "*"` → rejected (broadcast is plain text only)
- Structured message + `uds:`/`bridge:` address → rejected (cross-session = plain text only)
- `shutdown_response` must be sent to `team-lead`
- `shutdown_response.approve: false` → `reason` required

### Message routing logic

1. If message is plain string + `to` is in-process subagent name → queue or auto-resume
2. If message is plain string + `to` is `"*"` → broadcast
3. If message is plain string → unicast to mailbox
4. Structured message → switch on type:
   - `shutdown_request` → send shutdown request, return `request_id`
   - `shutdown_response` (approve) → signal abort, send approval to lead
   - `shutdown_response` (reject) → send rejection to lead with reason
   - `plan_approval_response` (approve) → send approval (lead-only operation)
   - `plan_approval_response` (reject) → send feedback (lead-only operation)

### Response shapes

```jsonc
// message
{ "success": true, "message": "Message sent to {name}'s inbox",
  "routing": { "sender": "...", "target": "@{name}", "targetColor": "blue", "summary": "...", "content": "..." } }

// broadcast
{ "success": true, "message": "Message broadcast to 2 teammate(s): a, b",
  "recipients": ["a", "b"],
  "routing": { "sender": "...", "target": "@team", "summary": "...", "content": "..." } }

// shutdown_request
{ "success": true, "message": "Shutdown request sent to {name}. Request ID: shutdown-{ts}@{name}",
  "request_id": "shutdown-1770536808909@name", "target": "name" }
```

### In-process agent routing

When sending to a teammate that's actually an in-process subagent:
- **Running task** → message queued for delivery at next tool round
- **Stopped task** → auto-resume in background with the message as prompt
- **No task in state** → try resume from disk transcript; if no transcript, fail

The system auto-resumes stopped agents. Output file path is returned.

## Task system

### Storage

```
~/.claude/tasks/{team_name}/
├── .lock          # 0-byte file for filesystem-level concurrency control
├── 1.json
├── 2.json
└── ...
```

### Task file schema

```jsonc
{
  "id": "1",                              // auto-incrementing string
  "subject": "Analyze team config",       // imperative mood
  "description": "Detailed prompt...",    // what the teammate reads
  "activeForm": "Analyzing team config",  // present continuous (UI when in_progress)
  "status": "pending|in_progress|completed|deleted",
  "owner": "researcher-config",           // string | undefined
  "blocks": ["4"],                        // downstream task IDs
  "blockedBy": [],                        // upstream task IDs
  "metadata": {}                          // optional
}
```

### State machine

```
created → pending → in_progress → completed
                 ↓
                 deleted
```

### Dependency graph (DAG)

- `blocks` / `blockedBy` form a directed acyclic graph
- **Bidirectional linking**: setting `addBlockedBy: ["1"]` on task #4 automatically adds `"4"` to task #1's `blocks`
- Tasks with non-empty `blockedBy` **cannot be claimed**
- When all blockers complete, downstream tasks auto-unblock
- `.lock` 0-byte file prevents concurrent modification races

### Assignment

- **Lead assigns**: `TaskUpdate owner=X` — task gets locked to that teammate
- **Self-claim**: teammate calls `TaskUpdate` to set itself as owner
- File locking makes concurrent claim attempts safe (one wins)

## Inbox file format (`~/.claude/teams/{name}/inboxes/{name}.json`)

JSON array. **Never deleted** — full message history preserved until session ends. Each message:

```jsonc
{
  "from": "team-lead",                   // sender name
  "text": "Message body or JSON string", // content (or JSON-encoded structured msg)
  "timestamp": "2026-02-08T11:36:55Z",   // ISO 8601
  "read": false,                          // flipped to true after consumption
  "summary": "...",                       // optional: SendMessage summary param
  "color": "blue"                         // optional: sender agent color
}
```

### Message types in the `text` field

The `text` field can be plain text or a JSON-encoded envelope. Message types:

| Type | Source | Key fields |
|---|---|---|
| Plain text | `SendMessage` plain string | — |
| `task_assignment` | `TaskUpdate(owner=X)` | `type, taskId, subject, description, assignedBy, timestamp` |
| `idle_notification` | Auto on turn end | `type, from, timestamp`; may add `idleReason`, `summary`, `completedTaskId`, `completedStatus`, `failureReason` |
| `shutdown_request` | `SendMessage(type="shutdown_request")` | `type, requestId, from, timestamp, reason?` |
| `shutdown_approved` | Agent approves shutdown | `type, requestId, from, timestamp, paneId, backendType` |
| `shutdown_rejected` | Agent rejects shutdown | `type, requestId, from, reason, timestamp` |
| `plan_approval_request` | Teammate calls `ExitPlanMode` | `type, from, timestamp, planFilePath, planContent, requestId` |
| `plan_approval_response` | Lead approves/rejects | `type, requestId, approved, timestamp` (+ `permissionMode` on approve, `feedback` on reject) |
| `permission_request` | Teammate restricted op | `type, request_id, agent_id, tool_name, tool_use_id, description, input, permission_suggestions` |
| `permission_response` | User approves via UI | `type, request_id, subtype`, `response` on success, `error` on error |
| `sandbox_permission_request` | Sandbox network access | `type, requestId, workerId, workerName, hostPattern, createdAt` |
| `sandbox_permission_response` | Lead responds | `type, requestId, host, allow, timestamp` |
| `team_permission_update` | Lead broadcasts rule change | `type, permissionUpdate, directoryPath, toolName` |
| `mode_set_request` | Lead asks teammate to switch mode | `type, mode, from` |

**Naming inconsistency (confirmed protocol bug):** shutdown/plan families use camelCase `requestId`; permission family uses snake_case `request_id`. Consumers must handle both.

**`teammate_terminated` is NOT delivered via inbox** — it's injected as a system turn to the lead directly.

## Message delivery semantics

1. Sender calls `SendMessage` → system writes to receiver's inbox file (`read: false`)
2. System checks receiver state:
   - **Idle** → wake receiver, delivers message (reads inbox, marks `read: true`)
   - **Busy** → message stays in inbox, delivered at end of current turn
3. After consumption, message stays in file (`read: true`), never deleted
4. Auto-delivery — receivers don't poll

**Peer DM visibility:** DMs between teammates are summarized in idle notifications to the lead (format: `[to {recipient}] {summary}`).

## Hooks for team coordination

Lifecycle hooks that fire on team events (replacing the old `TeammateIdle` / `TaskCreated` / `TaskCompleted` hooks):

| Hook | When | Exit 2 effect |
|---|---|---|
| `TeammateIdle` | Teammate about to go idle | Send feedback, keep teammate working |
| `TaskCreated` | Task being created | Prevent creation + send feedback |
| `TaskCompleted` | Task being marked complete | Prevent completion + send feedback |
| `SubagentStart` | Subagent begins (matcher: agent type) | — |
| `SubagentStop` | Subagent completes (matcher: agent type) | — |
| `PreToolUse` / `PostToolUse` | Tool execution boundaries | Standard hook behavior |

Use `TaskCompleted` as a **quality gate** — run tests/lint before accepting work.

## Display modes

Set via `teammateMode` in `~/.claude/settings.json` or `--teammate-mode` flag:

| Mode | Behavior | Requirements |
|---|---|---|
| `in-process` (default since v2.1.179) | All teammates in main terminal; navigate via arrow keys | None — works anywhere |
| `auto` | Split panes if already in tmux/iTerm2, else in-process | tmux OR iTerm2 with `it2` CLI |
| `tmux` | Always split-pane mode | tmux (best on macOS; `tmux -CC` in iTerm2 is suggested) |

**Not supported:** VS Code integrated terminal, Windows Terminal, Ghostty.

**Controls (in-process mode):**
- ↑/↓ — select teammate
- Enter — open transcript, message directly
- x — stop selected teammate (or whole team if focus on run)
- Ctrl+T — toggle task list
- Esc — interrupt current turn

## Permissions

- **All teammates inherit lead's mode at spawn** — `bypassPermissions` propagates
- **Cannot set per-teammate modes at spawn** — must change after spawning
- Teammate restricted operations → permission request via inbox → user approves via UI
- `teamAllowedPaths[]` in config.json for team-wide grant patterns (e.g., shared test fixtures directory)
- `mode_set_request` lets lead ask individual teammates to switch modes post-spawn

## Subagent definitions as teammates

Reference a subagent by name when spawning: *"Spawn a teammate using the security-reviewer agent type to audit the auth module."*

The teammate:
- **Honors** `tools` allowlist and `model` from the subagent definition
- **Appends** the definition body to the teammate's system prompt (doesn't replace)
- **Always has access** to team coordination tools (`SendMessage`, task tools) even if `tools` restricts others

**Not applied** (loaded from project/user settings instead):
- `skills` field
- `mcpServers` field

## Limitations (current)

- **No session resume for in-process teammates** — `/resume` and `/rewind` don't restore them; lead may try to message non-existent teammates
- **Task status can lag** — teammates sometimes fail to mark complete; blocks dependent tasks. Workaround: nudge the teammate or update status manually
- **Shutdown can be slow** — teammates finish current request/tool before shutting down
- **One team per session** — can't create additional named teams or share across sessions
- **No nested teams** — teammates can't spawn their own teammates
- **Lead is fixed** — main session is lead for its lifetime, can't promote teammate
- **Permissions set at spawn** — all teammates start with lead's mode
- **Split panes require tmux or iTerm2** — not VS Code terminal, Windows Terminal, or Ghostty

## Known bugs (from GitHub issues)

| Issue | Problem |
|---|---|
| #35240 | SendMessage referenced in Agent docs but gated behind Agent Teams flag |
| #35141 | Subagent continuation docs show old resume flow |
| #51071 | Agent tool description unconditionally documents SendMessage (misleading when not enabled) |
| #65784 | SendMessage docs omit relayed permission authority + auto mode blocking |
| #46316 | SendMessage broadcast rejects structured messages (intended, but documented poorly) |
| #49671 | `shutdown_request` acknowledged but teammates never terminate; TeamDelete blocked until session ends |
| #47021 | SendMessage referenced in docs but not available at runtime when teams disabled |
| #29908 | Teammates that idle without completing work ignore `shutdown_request` messages |

## Cost characteristics

Token usage scales linearly with team size:

| Setup | Relative cost |
|---|---|
| Solo session | 1x baseline |
| 3 subagents | ~3x baseline (results summarized back) |
| 3-person team | ~3x baseline (each is full session) |
| 16-person team (Anthropic C compiler test) | ~16x baseline |

**Trade-off:** teams add coordination overhead + token cost, but enable:
- Wall-clock time savings (~40% for 3 teammates, ~15% for 16)
- Specialization (each teammate owns different files)
- Adversarial verification (teammates challenge each other's findings)
- Self-coordination (no round-trip through lead for P2P messages)

**When teams beat subagents:** workers need to communicate, debate, or challenge each other.
**When subagents beat teams:** focused tasks where only the result matters; same-file edits; sequential work.

## Decision matrix (subagents vs teams vs workflows)

| | Subagents | Teams | Workflows |
|---|---|---|---|
| Context | Own window; results to caller | Own window; fully independent | Spawned by script, no shared state |
| Communication | Report to parent only | **Direct P2P via SendMessage** | Script-coordinated (no message protocol) |
| Coordination | Parent manages all | **Shared task list + self-coordination** | Script holds the plan |
| Scale | Few delegated/turn | 3-5 typical, up to 16 demonstrated | 16 concurrent, 1000 total/run |
| Resume | Per-invocation (with SendMessage) | **Auto-resume in-process teammates via SendMessage** | Run-level resume (cached results) |
| Token cost | Lower (results summarized) | Higher (full sessions) | Highest (many full sessions) |
| Best for | Focused tasks | Cross-layer work needing debate | Known-quality-pattern work at scale |

## When teams shine (from Anthropic blog)

- **Research and review** — multiple teammates investigate different angles, challenge each other's findings
- **New modules or features** — teammates own separate pieces without conflict
- **Debugging with competing hypotheses** — adversarial theory testing prevents anchoring bias
- **Cross-layer coordination** — backend / frontend / tests owned by different teammates

## Patterns

### Recipe: plan first, parallelize second
1. Use `Plan` mode (read-only) to produce a step-by-step plan — cheap, ~10K tokens
2. Review the plan, adjust if needed
3. Hand the plan to a team for parallel execution — expensive, but the checkpoint saves expensive course corrections

### Recipe: competing hypotheses (debugging)
```
Spawn 5 agent teammates to investigate different hypotheses.
Have them talk to each other to try to disprove each other's theories,
like a scientific debate. Update the findings doc with whatever
consensus emerges.
```

### Recipe: parallel code review
```
Spawn three teammates to review PR #142:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Recipe: cross-layer feature work
Give each teammate file ownership boundaries to prevent conflicts. The orchestrator prompt defines who owns what:

```
- Backend agent: owns src/api/billing/ and src/db/migrations/
- Frontend agent: owns src/components/billing/ and src/app/dashboard/billing/
  Blocks on backend completing the API schema task.
- Test agent: owns tests/billing/. Blocks on both.
Use Sonnet for each. Require plan approval.
```

### File ownership prevents conflicts
Without explicit ownership, two agents editing the same file causes overwrites. Worktree isolation adds a safety net.

### Team size guidelines
- **3-5 teammates** is the sweet spot
- **5-6 tasks per teammate** keeps everyone productive
- **15 independent tasks** → 3 teammates is the right starting point
- Three focused teammates consistently outperform five scattered ones

## Configuration for this repo

This repo does **NOT** currently have `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled. To enable:

```json
// .claude/settings.local.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Trade-off for the orchestrator role:** teams add capability but increase token cost. Given this repo is already well-served by the new specialist agents (drizzle-expert, orpc-expert, electron-expert, tanstack-router-expert, release-manager), teams are most useful for:
- **Cross-cutting refactors** that touch multiple packages
- **Debugging sessions** with competing hypotheses
- **PR review** with specialized lenses (security, perf, tests)
- **Audit work** where multiple perspectives add value

For routine feature work, the specialist agents + review-delegation skill are sufficient.

## Sources

- Official docs: https://code.claude.com/docs/en/agent-teams
- SendMessage source: https://github.com/codeaashu/claude-code/blob/main/src/tools/SendMessageTool/SendMessageTool.ts
- Protocol spec (deep, source-aligned): https://github.com/nightsailer/cc-team/blob/master/docs/protocol-spec.en.md
- Inter-agent protocols overview: https://www.morphllm.com/claude-orchestrator
- "From tasks to swarms": https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/

Related: [[subagents]], [[workflows]], [[hooks]], [[permissions-and-settings]]