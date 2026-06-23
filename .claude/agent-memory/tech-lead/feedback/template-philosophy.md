---
name: template-philosophy
description: The cultural north star — this is a template, the foundation of everything. Code should shock people. 45 minutes on a single detail is fine. Excellence over speed, always.
metadata:
  type: feedback
---

# Template Philosophy

This is the north star. Every other feedback memory is a manifestation of this rule.

## The shock standard
**Rule:** When someone opens any file in this repo, the code quality should **shock** them — in a good way. They should think "this is the bar".

**Why:** This is a template. It's the foundation of everything the team builds. Every pattern, every convention, every line gets copied into features, modules, and downstream projects. The "shock" propagates; mediocrity also propagates.

**How to apply:** Default to "would this shock someone?" as the acceptance test for any code, comment, or structure. If a peer reviewer would shrug, it's not good enough. If they'd stop and read it twice, you've hit the bar.

## 45 minutes on a detail is fine
**Rule:** Spending 45 minutes (or more) on a single detail — a function signature, a type definition, a comment, a file location — is the right move when the detail is load-bearing.

**Why:** The cost of getting a detail wrong is multiplied by every place it gets copied. 45 minutes once, in the template, prevents 45 minutes × 50 features in downstream work. The math favors slow-once.

**How to apply:** Don't apologize for time spent on details that matter. Don't optimize for "shipped now" over "right forever". Time spent on a load-bearing detail is leverage.

## Template thinking
**Rule:** Every line is load-bearing because it gets copied.

**Why:** Anyone reading this code will internalize the patterns. They'll reproduce the conventions in their own modules, with their own agents, on their own projects. The blast radius of "good enough" code is the entire downstream ecosystem.

**How to apply:** Write code as if it were going to be the canonical example of how to do it. If a junior reads this, what would they learn? If a senior reads it, what would they admire? Aim for both.

## Excellence over speed, always
**Rule:** When speed and quality conflict, choose quality. When scope and quality conflict, choose quality. When budget and quality conflict, choose quality.

**Why:** This is the foundation. The "shock" standard is only achievable if you don't compromise.

**How to apply:** If a decision is "ship now with a hack" vs "ship later with the right pattern", choose later. If "add a quick feature" vs "leave the codebase cleaner than I found it" conflict, choose cleaner. The user's trust is earned by holding this line.

## What this does NOT mean
- **Not "infinitely polish"** — polish the things that matter. The standard is high but bounded. Don't perfect the inconsequential.
- **Not "no shortcuts ever"** — context matters. A prototype or a spike can take shortcuts; the template itself cannot.
- **Not "ignore deadlines"** — slow is the default for details; ship the work, just don't ship bad patterns.
- **Not "exhaust the reviewer"** — high quality should not be verbose. Concise + excellent > verbose + good.

## How this connects to the other feedback memories

This is the **why** behind:

- [[quality-bar]] — security-first, schema-first, type-safe. The bar exists because of the template philosophy.
- [[code-taste]] — established patterns preserved, anti-patterns flagged. Patterns exist to be copied right.
- [[code-style-and-structure]] — granular style rules. Each style choice propagates.
- [[working-style]] — orchestrator identity, gated changes. The gate prevents rushed decisions.
- [[communication-style]] — direct, no fluff. The standard is in the work, not in the prose.

If a tension arises between this file and another, **this file wins**. The template philosophy is the load-bearing constraint. Everything else is its expression.

## Self-check: am I living up to the standard?

Before approving any code change, any agent output, any agent definition, any memory entry — ask:

1. Would I be proud to show this to the user?
2. Would someone reading this be shocked by the quality?
3. Did I take the time this deserved, or did I rush?
4. Does this look like the canonical example of how to do it?

If the answer to any is "no", keep working.

## Implications for delegation

When I brief an agent, the acceptance criteria should include **"would this shock the user?"** not just "does it work?". When the agent reports back, I should hold the same standard in review — accept only work I'd be proud to ship, not work that's merely correct.

When the user gives me a "vas y" approval on a plan, I should not interpret that as "skip the polishing". It means "I trust the plan, proceed at the standard". The standard never lowers.

## What the user is signaling

When the user says "it's ok to spend 45 minutes on a detail":
- **They are not micromanaging.** They're setting the standard so I don't second-guess.
- **They are not asking for slowness.** They're asking for thoroughness on what matters.
- **They are giving permission to over-invest.** Use it on the right things, not everything.
- **They are telling me what "good" looks like.** Match it.

Related: [[quality-bar]], [[code-taste]], [[code-style-and-structure]], [[working-style]], [[communication-style]]
