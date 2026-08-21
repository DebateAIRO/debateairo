# PROG-10 Codex agent report — dark seat-share allocator

- Worker: Codex GPT-5.6 Sol
- Session: `01a005d5-c78e-7f61-9af1-4b52358de202`
- Assignment: first pass, PROGRAMMING tier 6B
- Branch: `codex/eval-10-seatshare`
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare/DebateAI-V3`
- Commit: `0c171798c33dad3a2d6197227f7055a50d094c60`
- Comments read through: goal packet and declared upstream artifacts, 2026-08-15
- Board mutations: none, as required
- Push/merge: none

## Delivered

- Added a pure deterministic seat-share allocator over exact model identities,
  health, domain prowess ordinal, normalized comparable relative cost, risk tier,
  depth, requested seats, and a register-provenanced formula policy.
- Fixed the algorithm described by Architecture §6.4: prowess rank, comparable
  lower-cost tie break, code-unit identity tie break; premium/normal/cheaper-best
  vector selection; largest-remainder rounding; positive runner-up preservation;
  and reciprocal-rank residual distribution for ranks 3+.
- Added typed refusal for no eligible model, malformed cardinality/depth/ranks,
  inconsistent cost evidence, duplicate identities, invalid policy provenance,
  incomplete share vectors, and `SELF_ROUTING_FORBIDDEN`.
- Added `PostgresEvaluatorSeatShareRepository.computeAndPersistShadowDecision`.
  It computes against a real admitted run and writes only an idempotent,
  append-only `evaluator.shadow_decision` with `binding_state='UNBOUND'` and
  `FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED`. It constructs no provider gateway
  and writes no routing decision or session assignment.
- Expanded the selector dark-launch source test across all production apps and
  peer packages. The only allocator calls are its definition and internal
  shadow repository call; there is no composition-root or live-dispatch caller.
- Added the V-facing bind-readiness checklist with formula ratification,
  FR-8.0/PANEL-01 and `agent_count` blockers, register isolation-set sourcing,
  Seat-B N5 pool constraint, FR-0.6 AC5, rollback proof, and all nine PROG-07
  disclosures plus contradiction sparsity.

## Formula examples pinned by tests

- M=1: 7 requested seats -> sole eligible model receives 7.
- M=2 premium: 10 seats with the test vector -> best 8, runner-up 2.
- M=3 normal: 10 seats -> best 6, runner-up 3, rank-three residual 1.
- Cheaper-best override: 20 seats -> best 16, runner-up 3, rank-three residual 1.
- Numeric values are test/register inputs only. They are not a live V-ratified
  formula and cannot dispatch while this lane is dark.

## RED -> GREEN evidence

- Initial RED:
  `pnpm exec vitest run tests/unit/evaluator-seat-share.test.ts tests/architecture/evaluator-selector-unbound.test.ts`
  -> 4 allocator failures, each `allocateEvaluatorSeatShare is not a function`;
  the zero-caller architecture guard already passed.
- Contract-hardening RED:
  `pnpm exec vitest run tests/unit/evaluator-seat-share.test.ts`
  -> malformed normal vector totaling 1.1 was accepted instead of refusing.
- GREEN focused gate:
  `pnpm exec vitest run tests/unit/evaluator-seat-share.test.ts tests/integration/evaluator-seat-share-database.test.ts tests/architecture/evaluator-selector-unbound.test.ts --maxWorkers=1`
  -> 3 files, 7 tests passed.
- The database fixture pins its admission clock, inserts a real `core.run`, uses
  the actual migration/write path, proves repeat delivery returns the same
  shadow id, inspects complete persisted input/output receipts, sums seats to the
  request, and proves zero `scorecard.routing_decision` writes for the session.

## Verification

- `pnpm exec vitest run --maxWorkers=1`
  - PASS: 98 files, 700 tests.
- Serialized evaluator integration differential sweep
  - PASS: 6 files, 46 tests, including FR-0.6 AC5 and prior evaluator lanes.
- Evaluator unit/architecture sweep
  - PASS before final hardening: 8 files, 48 tests; final focused gate included
    the additional policy-vector refusal.
- `pnpm generate:contract && pnpm typecheck`
  - PASS.
- `pnpm lint`
  - PASS: architecture audit checked 27 edge rows with zero violations; source
    audit reported zero blockers.
- `bash tests/render-templates.sh` and `bash tests/lint-templates.sh` from the
  harness root
  - PASS.
- `git diff --check`
  - PASS.
- Recursive source grep
  - PASS: no allocator/shadow call beneath `apps/` or any peer package; no exact
    `BOUND` state and no API-key material added.

## Files changed

- `packages/evaluator/src/index.ts`
- `packages/evaluator/README.md`
- `packages/evaluator/BIND-READINESS-seat-share.md`
- `tests/unit/evaluator-seat-share.test.ts`
- `tests/integration/evaluator-seat-share-database.test.ts`
- `tests/architecture/evaluator-selector-unbound.test.ts`

## Scope and risks

- No lane-09 consumer-reader file changed.
- No shared schema/type migration was needed; the existing append-only
  `shadow_decision` table supports the receipt.
- No provider gateway, external call, live bind, panel integration, `BOUND`
  state, push, merge, or board mutation occurred.
- Live integration remains intentionally blocked on FR-8.0/PANEL-01 panel shape,
  explicit V formula ratification/bind, and every checklist item.
- Comments read through: goal packet 2026-08-15.

READY FOR PEER REVIEW: codex/eval-10-seatshare

Correction to the immediately preceding rework section: the full rework commit
hash is `310ce9b6ea27c83c959882cc6b4e10f63ac97170`.

READY FOR PEER REVIEW: codex/eval-10-seatshare

## Rework round 1 — 2026-08-15

- Triggering reviews: `PROG-10-opus-review-1.md` (REWORK) and
  `PROG-10-opus2-review-1.md` (PASS with shared locale-hash finding).
- Rework commit: `310ce9bc2a16cc2190b4167baea6eb5c385ef700`.
- Extended the dark-launch regression guard across every workspace source root:
  `apps/`, `packages/`, `web/`, `tools/`, and `acceptance/`.
- Added a real runner-up-preservation case: two premium seats with a `.9/.1`
  vector produce raw `[2,0]` and corrected `[1,1]`.
- Added M=0 refusal coverage with an all-unhealthy pool and a health-filter case
  proving an unhealthy rank-2 model is removed and rank 3 inherits its share.
- Replaced the empty admin-pool routing-row assertion with
  `has_table_privilege` proof that `debateai_evaluator_worker` cannot insert into
  either `scorecard.routing_decision` or `scorecard.session_assignment`.
- Replaced receipt-array `localeCompare` ordering with locale-independent Unicode
  code-point ordering, preserving `ON CONFLICT` idempotency across mixed locales.
- Expanded the bind-readiness checklist with the two-seat premium 1/1 consequence,
  monotonic vector constraint, M=2 residual reabsorption, all source roots, and
  the missing `evaluatorSeatSharePolicy` register reader.

### Reproduce-first evidence

- Darkness blind spot: a temporary forbidden allocator call under `web/` left
  `tests/architecture/evaluator-selector-unbound.test.ts` green (1/1 passed),
  proving the false negative. The temporary fixture was then removed.
- Locale idempotency: the real PostgreSQL write-path test simulated the opposite
  host collation through `String.prototype.localeCompare`; before the fix the
  identical input produced a different `shadow_decision_id` and the test failed.
  After the code-point sort, the same test returns the original id with
  `inserted=false`.

### Rework verification

- Focused rework gate: 3 files, 9 tests passed.
- Serialized evaluator integration differential sweep: 6 files, 46 tests passed,
  including the FR-0.6 AC5 persisted panel-isolation differential.
- Full suite: 98 files, 702 tests passed.
- `pnpm generate:contract && pnpm typecheck`: passed; final `pnpm typecheck`
  rerun after test hardening also passed.
- `pnpm lint`: passed (27 architecture edges, zero violations; zero source
  blockers).
- Harness-root `bash tests/render-templates.sh` and
  `bash tests/lint-templates.sh`: passed.
- `git diff --check`: passed. No push, merge, board mutation, bound wiring,
  provider gateway, or lane-09 consumer-reader edit occurred.

READY FOR PEER REVIEW: codex/eval-10-seatshare

Authoritative rework commit hash correction: the rework commit is
`310ce9b6ea27c83c959882cc6b4e10f63ac97170`; the hash on the earlier
`Rework commit` bullet was a transcription error.

READY FOR PEER REVIEW: codex/eval-10-seatshare

## Continuation verification after client termination — 2026-08-15

- Confirmed the original session's branch is `codex/eval-10-seatshare`, HEAD is
  `310ce9b6ea27c83c959882cc6b4e10f63ac97170`, and the worktree is clean.
- Focused PROG-10 gate passed: 3 files, 9 tests.
- Serialized evaluator integration differential sweep passed: 6 files, 46
  tests, including the persisted FR-0.6 AC5 differential and the seat-share real
  PostgreSQL write path.
- Evaluator unit/architecture differential sweep passed: 8 files, 51 tests.
- Repository `pnpm typecheck` passed (`tsc --noEmit`, exit 0).
- No uncommitted work remained, so no continuation commit was necessary. No
  push, merge, board mutation, bound wiring, or cross-lane edit occurred.
- Comments/reviews read through: `PROG-10-opus2-review-1.md`, timestamp
  2026-08-15 18:03:13; no newer PROG-10 review artifact was present.

READY FOR PEER REVIEW: codex/eval-10-seatshare
