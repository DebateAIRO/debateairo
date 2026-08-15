# Self-report — Opus reviewer A, PROG-10 (`codex/eval-10-seatshare`)

Seat: Opus reviewer A, PROGRAMMING lane 10 (tier 6B), model-evaluator mission.
Rounds completed: 2.

- Round 1 — commit `0c17179` → **REWORK** (4 blockers).
  Review: `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-10-opus-review-1.md`
- Round 2 — commit `310ce9b` → **PASS**.
  Review: `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-10-opus-review-2.md`

## Round 1 (0c17179) — REWORK

Read the binding docs myself (Architecture §6.1/6.2/6.4, §7 tier-6B, §8; Requirements
FR-0.1, FR-0.6 AC5, FR-6.2, FR-8.0/8.1/8.2; ruling 8; ticket 10; goal packet), read the
full diff and surrounding source, ran typecheck + the whole suite + both audits, grepped
the whole repo for call sites, hand-computed every M=1/2/3 expectation before looking at
the asserted values, and probed the allocator directly with `tsx` scripts.

Allocator found correct: premium M=2 gives the better-ranked model strictly more (8/2),
M=1 takes all seats, M=3 residual by descending reciprocal rank, every multiset sums to the
requested count, no RNG, cost genuinely wired to lane 08's `relativeCost`/`comparability`
with the null⟺UNKNOWN invariant re-asserted, no gateway constructed at all.

Blockers raised — all in the proof layer, not the algorithm:

1. Darkness guard walked only `apps/` + `packages/`, missing `web/`, `tools/`,
   `acceptance/` (51 source files, including `web/app/settings/` where ticket 11's dev menu
   may land).
2. The runner-up-preservation branch (Architecture §6.4 step 4) had zero coverage behind a
   test title that claimed it; I derived that it fires iff `n·runnerUpShare < 0.5` and
   showed every committed case was far above that line.
3. M=0 `NO_ELIGIBLE_MODEL` refusal and the `healthy` filter had zero coverage.
4. The "no dispatch" assertion (`count(*) = 0` on an always-empty
   `scorecard.routing_decision`, run on the admin pool) was vacuous and proved nothing
   about the grant isolation the checklist promises V.

Non-blocking: unguarded ruling-8 vector shape (a register row can invert best/runner-up —
probe gave 2/8; cheaper-best overriding premium can dilute concentration, 8/2 vs 6/4),
unpinned `localeCompare` deciding the `input_hash` idempotency key, M=1 receipt labelled
`NORMAL`, undocumented M=2 residual reabsorption, a dead guard, a README overstatement.

## Round 2 (310ce9b) — PASS

Verified each blocker by re-deriving the behaviour, not by reading the claim:

1. **Resolved.** Replicated the test's own walker: it now reaches 162 files across
   `apps/packages/web/tools/acceptance`, including `web/app/settings/page.tsx` and
   `web/app/admin/workers/page.tsx` — the exact surfaces I named. Checklist and PROG-07
   disclosure 2 updated to match.
2. **Resolved.** New test at 2 seats with `{0.9, 0.1}`; I confirmed raw largest-remainder
   gives `[2,0]` and the asserted `[1,1]` is reachable only through the preservation clause,
   so the assertion is discriminating. The n=2 forced-tie caveat is on V's checklist.
3. **Resolved.** M=0 throws typed `NO_ELIGIBLE_MODEL`; the filter arm discriminates (7/3
   with the filter vs 6/3/1 without).
4. **Resolved.** Replaced with `has_table_privilege('debateai_evaluator_worker', …,
   'INSERT') = false` on both `scorecard.routing_decision` and `scorecard.session_assignment`
   — load-bearing, since PostgreSQL errors on an unknown role.

Also closed from my non-blocking list: locale-dependent hash sort replaced with a
code-point comparator plus a genuinely discriminating test (mocks `String.prototype.
localeCompare` to reverse ordering and asserts the same shadow id / `inserted: false`); and
checklist items added for vector monotonicity, M=2 residual reabsorption, and the missing
`evaluatorSeatSharePolicy` register reader.

Re-run at `310ce9b`: typecheck clean, **98 files / 702 tests pass**, architecture audit
`violations: []`, source audit `blocking: []`, whole-repo grep still shows **zero call
sites** outside the definition, tests and docs.

Six advisory notes carried into the review (M=1 receipt label, dead guard, README wording,
dormant cheaper-best under thin metering, missing positive control on the grant assertion,
stale phrase in the older tie test's title). None blocking.

## Constraints honoured

Read-only outside my two output files (scratch scripts lived in the session scratchpad; no
file created or modified inside the repo or worktree). No commits, no pushes, no board
mutations. Did not read any other reviewer's file for this ticket.
