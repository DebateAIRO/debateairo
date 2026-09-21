# Promoted probes — REV(S01) pass 2 (scoped), lens product-truth

Written against slice head **`c358d494`** (previous head `db4758da`, base `5b6cc9b1`). These are the
pass-1 probes of this lens (`probes/REV-S01-p1-product-truth/`) **re-derived at the new head**: every
expectation that pinned the pre-fix state is inverted here and says so in a comment on the case, so a
RED at `db4758da` and a GREEN here are the same measurement of a product that changed.
**Neither probe is wrapped** — each runs bare, mutates nothing, starts no process and binds no port.

To run, copy each file into the same-named directory of ANY worktree at or after `c358d494` and run it
from that worktree's root. Nothing below hard-codes a repository root.

| file | copy to | run |
|---|---|---|
| `rev-s01-p2-product-truth.test.ts` | `<worktree>/tests/unit/` | `pnpm exec vitest run tests/unit/rev-s01-p2-product-truth.test.ts` |
| `rev-s01-p2-product-truth-db.test.ts` | `<worktree>/tests/integration/` | `pnpm exec vitest run tests/integration/rev-s01-p2-product-truth-db.test.ts` |

Preconditions: `pnpm install` and `pnpm run generate:contract` in that worktree. The integration probe
starts the repo's own throwaway embedded Postgres via `tests/support/testDatabase.ts`, stops it in
`afterAll`, and reads under `SET ROLE debateai_runtime`, never as a superuser.

Measured at `c358d494`: unit **15/15**, integration **5/5**; the whole 21-file slice list is
**266/271** with the five named base-RED tests and **zero skipped**, identical in three ambient-locale
runs and three `LANG=LC_ALL=en_US.UTF-8` runs.

Which pass-1 finding each case measures (verdict
`docs/missions/free-public-debates/reviews/REV-S01-p2-product-truth.md`):

- `P2-1`, `P2-3`, `P2-4` — **P-B2 ADDRESSED**: the second answer-serving route now triggers, the
  projection routes do not, and the count of `AnswerSchema.parse(` send sites equals the count of
  trigger calls (SPEC-v3 §1's mechanical consequence (a), frozen as a test).
- `P2-7`, `P2-8` — **P-B3 ADDRESSED** in the part that was deterministic: the enqueue precedes the
  fallible attempt, and a raising `systemPublish` becomes an outstanding record.
- `P2-9` — **P-B3 RESIDUE (finding P2-N1)**: two calls still run before the enqueue; a throw there
  still leaves the run PRIVATE with nothing outstanding, and the route still swallows it.
- `P2-10`, `P2-11` — **P-N2 ADDRESSED**: an unbound run's BLOCKED answer causes no write at all.
- `PTDB2-4`, `PTDB2-5` — **P-N1 ADDRESSED**: the retry is no longer immediate; the delay grows and is
  capped at one hour, and a serve-time enqueue is still claimable at once.
- `PTDB2-1`…`PTDB2-3` — I-2 "leave them alone", unmoved since pass 1.
- `P2-5`, `P2-6`, `P2-12`…`P2-15` — acceptance steps 3b, 3c, 5, 11b, 14, 15 and the pass-1
  expectations that had to survive the fix.

`scratch/` holds the raw logs: `slice-ambient-run{1,2,3}.log`, `slice-utf8-run{1,2,3}.log`,
`p1-probes-at-c358d494.log` (the pass-1 probe re-run, five inverted cases),
`db-p2-run1.log`, `typecheck-c358d494.log`, `slice-list.txt`. They are evidence text, not probes.
