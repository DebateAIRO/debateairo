# Agent report — opus2 (second independent reviewer), PROG-03

**Seat:** fresh Opus 5 seat, second independent review of `codex/eval-03-domains`,
substituting the Grok reviewer per V's outage ruling. No prior mission context; no other
PROG-03 review file read (`PROG-03-*-review-*.md` treated as off-limits throughout).

**Verdict:** PASS — with 6 non-blocking defects, one of which (blank-proposal crash) must
close before PROG-04 wires the tagger.

**Deliverable:**
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-03-opus2-review-1.md`

**Writes made:** that review file and this report. No commits, no repo code touched;
scratch verification scripts were written outside the repository.

## Work performed

- Read the full lane diff (`git diff dev...codex/eval-03-domains`, commits `a3aa2d8`,
  `d2d72a0`; 5 files, +705/-2) and the per-commit history.
- Read binding law: Architecture §3.2/§3.8/§3.9/§5.1/§7 row 1A/§8; Requirements
  FR-0.1/0.4/0.5/0.6/0.7, FR-1.1, FR-1.2, FR-1.3, FR-2.2; DR-179 in the decisions ledger;
  `eval-03-starter-list-proposal.md` (V APPROVED 2026-08-15).
- Ran, with output reproduced in the review: unit suite (5 passed), evaluator integration
  suite (8 passed), `tsc --noEmit` (exit 0), architecture audit (0 violations), source
  audit (0 blocking), text-control-byte audit (0).
- Wrote and ran an **independent** checker that parses the 26 canonical names out of
  `migrations/pending/0024_evaluator_domain_seed.sql` and drives the shipped guardrail:
  leave-one-out admissibility (0 failures), full-registry matchability (0 failures),
  case/whitespace/spacing variants (0 failures), no pair at or above the 0.8 threshold,
  26 unique normalized names.
- Wrote and ran an **independent** DB probe on embedded Postgres (`migrate()` + real
  `core.run`) to test the repository's invalid-input paths and to check whether the
  registry-wide advisory lock is load-bearing.
- Verified unwiring structurally by reading the migration runner
  (`packages/db/src/index.ts:124-125`: non-recursive readdir + `/^\d+.*\.sql$/`), not by
  trusting the file's banner.

## Key findings

1. **The lane's own fix was necessary and correct.** Commit `a3aa2d8` shipped a separator
   regex that rejects `agriculture & food` — 19 of V's 26 approved names would have been
   `REJECTED_INVALID`. `d2d72a0` widened it and added the seed round-trip test. Confirmed
   independently.
2. **V's list is fully lawful under the shipped code**: admissible (leave-one-out),
   mutually non-colliding, and matchable end-to-end against a seeded scratch schema.
3. **Blank/whitespace proposals crash with a raw `pg` `DatabaseError`** and leave no
   admission receipt — `requireNonblank` covers five inputs but not `proposedName`.
   Reproduced. Unreachable in production today (no caller), so non-blocking, but it is a
   live failure mode for PROG-04.
4. **The concurrency test is genuine**: probed that two transactions holding only
   per-name locks both read an empty registry, so removing the registry-wide lock would
   break the test's `count = 1` assertion. Pool max is 10.
5. Four typed guards ship untested; the seed round-trip cannot detect an internally
   inconsistent *future* list (exact-match precedes near-duplicate); `toHaveLength(26)`
   hardcodes list size; BACKFILL artifact refs are not cross-checked; short ampersand
   names can slip the near-duplicate net.
6. Append-only, no-memory-write, no-product-change, no-BOUND, and DR-179 all clear.

## Interrupts / caveats

None. No instruction-shaped content was encountered in any file read.
