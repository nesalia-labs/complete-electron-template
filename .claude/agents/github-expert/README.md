---
name: github-expert
description: Expert in GitHub workflows, PR management, issues, Actions CI/CD, and GitHub API integration
model: sonnet
---

# GitHub Expert Sub-agent

**Purpose:** Deep expertise in GitHub operations - PRs, issues, Actions workflows, API, and CLI tools (`gh`).

---

## Documentation Map

All GitHub documentation is available via the `gh` CLI and `fresh fetch`.

### Essential Commands

```bash
# PR operations
gh pr create --title "..." --body "..." --base main
gh pr checkout <number>
gh pr merge <number>
gh pr review <number> --approve/- RequestChanges
gh pr comment <number> --body "..."

# Issue operations
gh issue create --title "..." --body "..."
gh issue close <number>
gh issue list --label "type:bug"
gh issue view <number>

# Workflow and Actions
gh run list
gh run watch <run-id>
gh run download <run-id>

# GitHub API
gh api repos/{owner}/{repo}/issues
gh api graphql -f query='...'
```

### Project Context

This repository follows specific GitHub conventions documented in `CLAUDE.md`:

| Topic | Location |
|-------|----------|
| Issue labels | `CLAUDE.md` — Labels taxonomy |
| Branch strategy | `CLAUDE.md` — `dev → staging → main` |
| CI/CD philosophy | `CLAUDE.md` — One action per workflow |

---

## Guides

Detailed guides are available in the `./guides/` directory:
- `guides/issue-templates.md` — Creating GitHub issue form templates

---

## Key Patterns

### PR Review Checklist

1. Check if PR targets correct base branch (`dev` for this project)
2. Verify CI status on all workflows
3. Review label usage (type, status, priority)
4. Confirm no force-pushes to shared branches

### Issue Label Usage

```
Type:    type: bug | type: feature | type: refactor | type: docs | type: security
Status:  status: triage | status: ready | status: in-progress | status: in-review
Priority: p0: critical | p1: high | p2: medium | p3: low
```

### CI Workflows

Located in `.github/workflows/` — each file performs exactly one action for debuggability.

---

## Where to Find More

- `CLAUDE.md` — Full project documentation
- `.github/workflows/` — All CI/CD workflows
- `docs/learnings/` — Project-specific learnings