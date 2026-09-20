# V DECISIONS PACKET — mission `free-public-debates`

Each row's DEFAULT binds every seat until V rules on that row. Rows are appended over time; cite a row by id, never a range. Evidence for every row: `docs/missions/free-public-debates/00-intake.md` (the contradiction check, C1–C7) unless another link is given. V's intake rulings I-1…I-4 are CLOSED and live in the intake record, not here.

| Row | Card | Decision needed | Default (binding until ruled) | Smallest yes/no for V |
|---|---|---|---|---|
| V-1 | S01 `t_2e15bf90` | A Free run whose answer is BLOCKED (C4) — today no BLOCKED answer can be published by anyone | A BLOCKED Free answer is not auto-published; it stays visible to its owner only | Keep BLOCKED Free answers out of the public list? |
| V-2 | S01 `t_2e15bf90` | The auto-publish step fails while the run itself succeeded (C5) | The run is never failed by it; the publish is retried until it lands; until then the debate is owner-only | Retry silently rather than fail the run? |
| V-3 | S01 `t_2e15bf90` | "Only a backend change" vs the existing Unpublish control on a Free debate, which the server will now refuse (C6) | No UI file changes in this mission; the API refuses with a typed error; a follow-up UI ticket is listed as residue at TEST(S01) | Leave the Unpublish button as it is for now? |
| V-4 | S01 `t_2e15bf90` | The author shown on an auto-published Free debate (C7) | The same pseudonym the owner-driven publish uses; never a real identity; no pseudonym available → treated as V-2 (retried) | Same pseudonym as a manual publish? |
