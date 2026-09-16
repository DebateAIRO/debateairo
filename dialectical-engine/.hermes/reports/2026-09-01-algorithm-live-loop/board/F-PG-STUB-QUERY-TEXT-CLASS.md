# [claude@opus-5] F-PG-STUB-QUERY-TEXT-CLASS · two more fake `pg` clients answer a lease query the product no longer issues (xrev01 red; load01 red and hanging)

```yaml
state:
  ticket: F-PG-STUB-QUERY-TEXT-CLASS
  risk_tier: low
  status: done # 09:47 2026-09-09 dispatched to the lane/stub-class Opus seat (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/stub-class-worker.md); codex review after
  owner: { agent: claude, session: stub-class-worker }
  contract: { allowed: [tests/unit/xrev01-node-review.test.ts (the fake client's query dispatch only — its assertions stay), tests/unit/load01-run-projection.test.ts (the same — its assertions stay)], readonly: [tests/unit/pro01-runner-tree.test.ts (the landed fix at :206), tests/architecture/s6-content-encryption-contract.test.ts (:52–57 pins the try-lock form), packages/db/src/index.ts (:266–:340 the lease), /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/known-reds/finding-01-xrev01-class-sibling.log, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/known-reds/finding-02-load01-class-sibling.log], forbidden: all_others, verification: [RED first for each file (xrev01's UNEXPECTED_CLIENT_QUERY failure; load01's 120 s timeout); after: both files green with their assertions unchanged, the stale pg_advisory_lock branch gone so an unmodelled query still fails loudly; a bounded sweep of every `sql.includes(` double under tests/ against the query texts the product issues today, each site named as matching or stale; product untouched], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-stub-class, branch: lane/stub-class, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: known-reds-2026-09-09
```

**Filed from the known-reds seat's out-of-contract finding (report 2026-09-09 09:13; orchestrator the same morning).** The pro01 defect fixed on lane/known-reds is a class: a fake `pg` client that dispatches on `sql.includes("<a product query's text>")` where the product changed that text. Commit `7b3a3063` (2026-08-28) changed the run content lease's first query from the blocking `SELECT pg_advisory_lock(hashtextextended($1,0))` to `SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` (`packages/db/src/index.ts:302`, with a contention retry at `:305–314`) and updated no stub. The seat enumerated five sites; two are still stale at 0b2ca886:

| site | what it answers | effect | evidence |
|---|---|---|---|
| `tests/unit/xrev01-node-review.test.ts:100` | `pg_advisory_lock` only | red: `UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock…` at `:126` (the same gateway and the same `RUN_COST_ENVELOPE_EXHAUSTED` expectation as pro01) | `finding-01-xrev01-class-sibling.log` EXIT 1, 1 failed / 5 passed |
| `tests/unit/load01-run-projection.test.ts:10` | `pg_advisory_lock` with `{ rows: [] }` | red AND hanging: the try-lock matches no special branch and falls through to the DEFAULT run row at :18–:26, which has no `acquired` field, so the lease reads contention, releases, sleeps 10 ms and retries without limit; the test times out after 120 s with no causal message (codex known-reds r1 N2/N4 — the seat's "returns { rows: [] }" wording was wrong) | `finding-02-load01-class-sibling.log` EXIT 1, `Test timed out in 120000ms` at `:6` |

Both were already red on dev at 169941c6 (`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-merge/16-full-suite-dev-169941c6.log:6586` and `:2639`) and are in the known set. `tests/unit/evaluator-addon.test.ts:280–281` already answers both forms with `acquired: true` (it survived `7b3a3063` by that tolerance); `tests/integration/s6-content-encryption-database.test.ts:388` counts the owner-admission lock, a different lease that is still the blocking form (`packages/db/src/index.ts:888`).

**Outcome:** both stubs answer the query the product actually issues — `pg_try_advisory_lock` with `{ rows: [{ acquired: true }] }` (the value is load-bearing: anything else is contention and loops) and the unlock — with the stale branch removed, so a query the stub does not model still reaches `UNEXPECTED_CLIENT_QUERY` loudly; every assertion unchanged. Then the sweep: every `sql.includes(` fake-client dispatch under `tests/` compared against the query texts the product issues today, each site named as matching or stale, the stale ones fixed the same way or ticketed by name. RED first per file. Same-class landed pattern: `tests/unit/pro01-runner-tree.test.ts:206` and its comment naming the contract test.

## 2026-09-16 continuation
Moved `working` → `done` by RECORDS(CONT-T19). The 2026-09-09 comment above dispatched this to
`lane/stub-class` on the LAPTOP and that lane never merged there. The branch was landed HERE by **Task 8**
of the 2026-09-16 continuation: merge `810dc19d` (of `origin/lane/stub-class` at `bf235c9f`) inside the
range `cd9d546a..496b10f9`. Both remaining fake `pg` clients now answer the try-lock the content lease
actually issues, and `load01`'s catch-all is gone — **`load01` fell from 120 008 ms to 1 ms**, so the row
that hung two minutes in every full suite no longer does. Orchestrator's review: *"spec ✅ outcomes 1, 2,
3-N1 and the third member; quality approved"* (SDD ledger :51). STRENGTH: entailed.
