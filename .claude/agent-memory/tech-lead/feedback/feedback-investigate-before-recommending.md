---
name: feedback-investigate-before-recommending
description: When presenting options or trade-offs, user wants deep investigation with concrete evidence (source code, docs) rather than bullet lists. Says "approfondi" to demand this.
metadata:
  type: feedback
---

When asked to evaluate options or recommend an approach, the user expects deep investigation, not a bullet-point menu. Specifically:

- Read library source code (e.g. `.d.ts` files in `node_modules`) to ground claims in actual API signatures
- Cite specific URLs / file paths / line numbers when making technical claims
- Show the actual problematic code, not just describe it
- Quantify trade-offs where possible (LOC, time, risk)

**Why:** Said "approfondi" when I gave a short menu of options. Senior dev who has been burned by half-baked analysis. Wants signal not noise.

**How to apply:** When the user asks "what should we do about X" or "should we do Y", don't reply with "here are 3 options" — investigate first, then present a recommendation backed by source-level evidence. Default to EnterPlanMode or a structured analysis message before proposing actions. Related: [[user-role-senior-dev]].