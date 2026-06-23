---
name: migration-numbering
description: Drizzle migration file numbering follows the auto-incremented idx in _journal.json, not a free-form naming choice.
metadata:
  type: feedback
---

When `drizzle-kit generate` runs, it picks the next idx (the count of existing entries in `_journal.json`) and tags the migration accordingly. It is wrong to manually rename `0001_*.sql` to `0002_*.sql` if no `0001` exists yet — the journal entry must stay in sync.

**Why:** Observed during PR 4 (recent_projects table): the planning brief asked for `0002_recent_projects.sql`, but the journal had only `0000`, so drizzle-kit correctly produced `0001_wonderful_the_enforcers.sql`. Renaming the file without updating `_journal.json` would break `runMigrations()` at boot because the recorded `tag` would not match any file on disk.

**How to apply:** Always run `pnpm db:generate` for new migrations and let it pick the idx. If a brief or PR description names a specific number, that is a hint to *reserve* the number (insert a stub migration) — but the simpler and more common pattern is to defer to the generator and note the deviation in the PR report.