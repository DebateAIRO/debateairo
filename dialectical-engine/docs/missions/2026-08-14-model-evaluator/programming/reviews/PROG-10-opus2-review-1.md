# PROG-10 peer review 1 — opus2 seat (second independent reviewer, Grok substitute per V)

- **Lane:** `codex/eval-10-seatshare` @ `0c17179` ("feat(evaluator): add dark seat-share allocator")
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare`
- **Reviewer:** opus2 (independent; no `PROG-10-*-review-*.md` file read; judged from the diff and the binding docs)
- **Date:** 2026-08-15
- **Verdict: PASS** (8 non-blocking findings; 4 of them belong on the bind-readiness checklist before V sees it)

Diff surface: `packages/evaluator/src/index.ts` (+290), `packages/evaluator/BIND-READINESS-seat-share.md` (new, 78),
`packages/evaluator/README.md` (+18), `tests/unit/evaluator-seat-share.test.ts` (new),
`tests/integration/evaluator-seat-share-database.test.ts` (new),
`tests/architecture/evaluator-selector-unbound.test.ts` (guard widened). No non-evaluator behavior touched;
lane 09's consumer-reader files untouched.

---

## 1. What I ran (all first-hand; nothing taken on the lane's report)

| Check | Result |
|---|---|
| `pnpm typecheck` (`tsc --noEmit`, whole repo) | exit 0 |
| Full repository suite `npx vitest run` | **98 files / 700 tests passed**, exit 0, 40.0s |
| Lane's own three files (unit + architecture + real-Postgres) | 7/7 passed |
| `pnpm run audit:architecture` | `{ edgeRowsChecked: 27, violations: [] }` |
| `pnpm run audit:source` | `{ blocking: [] }` |
| My own allocator harness — 33 hand-computed assertions + a 3,888-case invariant grid | all matched my arithmetic |
| My own real-Postgres harness — twin embedded instances, shadow-ON vs shadow-OFF differential | see §3 |
| My own structural leak hunt — FKs, triggers, views, rewrite rules, role grants, cross-locale hashes | see §4 |
| `BOUND` literal / unpinned-clock / gateway-construction hunt over the diff | clean |
| Worktree after my run | clean (`git status --porcelain` empty; every scratch file lived outside the repo) |

My harnesses were written from scratch against the binding docs, importing the lane's source by absolute
path from outside the worktree — no file was created inside the repo, and none of the lane's fixtures or
expected values were reused.

---

## 2. Formula verified by hand, not by re-running the lane's tests

I recomputed the allocation independently for each case (quota = seats x weight / sum(weights), floor,
then largest remainder with index as the tiebreak) and compared to the implementation. **All 33 matched.**

### 2.1 (rank, cost, tier) scenarios

| # | Scenario | My hand computation | Actual |
|---|---|---|---|
| A1 | M=2, high-stakes, depth 3, 7 seats, best dearer. premium .8/.2 → quotas [5.6, 1.4] → floors [5,1], rem [.6,.4] → best | best 6, runner 1 | match |
| A2 | M=2, high-stakes but **depth 2 < premiumMinimumDepth 3** | vector = NORMAL (not premium) | match |
| A2b | same, 10 seats. NORMAL .6/.3/.1 with no rank-3 → renormalised over .9 → quotas [6.67, 3.33] | best 7, runner 3 | match |
| A3 | **cheaper-model-is-better**, casual tier, 20 seats: best is rank 1 *and* cost .1 < .9 | BEST_ALSO_CHEAPER, best 17 / runner 3 | match |
| A3b | same inputs at high-stakes depth 9 | **identical multiset** — ruling 8's "both tiers mostly use it" holds | match |
| A4 | premium, best dearer (.9 vs .1), 10 seats | PREMIUM, best 8 / runner 2 (FR-8.1 AC2: strictly more) | match |
| A5 | M=4 NORMAL, 24 seats. residual denom 1/3+1/4=.5833 → w3=.05714, w4=.04286; quotas [14.4, 7.2, 1.371, 1.029] → floors sum 23, largest rem .4 → best | 15 / 7 / 1 / 1, sums to 24 | match |

### 2.2 Degenerate cases — every one is well-defined or a typed refusal; **no NaN, no silent fallback**

| # | Case | Behavior |
|---|---|---|
| B1 | **M=1** with a premium request, 7 seats | all 7 to the sole model (FR-8.1 AC3). Receipt says `NORMAL` — see finding 5 |
| B2 | **M=0** (all unhealthy) | `TypedDomainError("NO_ELIGIBLE_MODEL")` |
| B3 | **All ranks tied at ordinal 1**, all cost UNKNOWN, 5 seats | deterministic code-unit identity order → alpha 4 / mid 1 / zebra 0; all integers |
| B4 | **Missing cost signal on one model** (UNKNOWN + null) | cost tiebreak skipped, `bestAlsoCheaper` false, NORMAL 7/3 — defined, no NaN |
| B5 | `costComparability: "COMPARABLE"` but `relativeCost: null` | refuses `EVALUATOR_SEAT_SHARE_RELATIVE_COST_INVALID` |
| B6 | `relativeCost: NaN` | same typed refusal — NaN cannot reach the arithmetic |
| B7 | **1 seat, M=3** | best 1, others 0; sums to 1 |
| B8 | seats 0 / -1 / 2.5 / NaN | `EVALUATOR_SEAT_COUNT_INVALID` in all four |
| B9 | duplicate exact identity | `EVALUATOR_SEAT_SHARE_CANDIDATE_DUPLICATE` |

### 2.3 Determinism (FR-8.1 AC1 — "not a random draw")

- 500 repeat invocations of the same M=3 input: **1 distinct output**.
- Three candidate-array permutations of the same M=3 input: **1 distinct output** (order-independent).
- 3,888-case grid (M 1–6 x seats 1–24 x 3 tiers x 3 depths x 3 cost modes, both a well-formed and a
  malformed policy): **zero** sum/integer/non-negative violations. Counts always sum to the request (AC4).

---

## 3. Byte-identity of a real admission, shadows ON vs OFF (real embedded PostgreSQL, DR-121)

Two independent embedded-Postgres instances, identical migrations, **pinned clock** (`as_of` fixed at
`2026-08-15T12:00:00Z`), admissions driven through the **real** write path `RunRepository.startRun`
(not a hand-rolled INSERT). Instance A never touches the allocator; instance B computes and persists
shadow decisions. I dumped every base table in `core`, `ledger`, `serve`, `scorecard`, `register` as text,
normalising only gen_random_uuid values and `clock_timestamp()` columns, then compared.

| Comparison | Result |
|---|---|
| D1 — same DB, before vs after two shadow compute+persist calls | **only `ledger.sequence_allocator` moved** (32 → 34). Every `core`/`serve`/`scorecard`/`register` row byte-identical |
| D1b — idempotency | second call returned the same `shadow_decision_id`, `inserted: false` |
| **D2 — the admitted run's own persisted state, shadow-ON DB vs shadow-OFF DB** | **byte-identical** across `core.run`, `core.run_progress_event`, `core.question_liveness_event`, everything else. Only `ledger.sequence_allocator` differs |
| D3 — a *subsequent* admission | `created_at_seq` 32 vs 34, and its `at_seq` values shift by the same 2 |
| D4 — same as D3 with sequence numbers normalised away | **differing tables: NONE** |

**The claim the goal packet asked me to prove holds:** a real admission's persisted run state is
byte-identical whether or not the allocator computed shadows for it. The single coupling is the shared
monotone counter `ledger.sequence_allocator` — it shifts sequence values handed to *later* writers.
That is the established evaluator-wide pattern (16 pre-existing `allocateSequence` call sites in
`packages/evaluator/src/index.ts`, granted to `debateai_evaluator_worker` by lane 02's
`0023_evaluator_foundation.sql:444`), no code anywhere assumes contiguity, and sequence numbers are
ordering tokens with no routing meaning. Recorded as disclosure finding 2, not a lane-10 regression.

---

## 4. Adversarial hunt for any path from allocator/shadow output to live dispatch

I attacked this from six independent directions. **I found none.**

| Attack | Evidence |
|---|---|
| **Code call graph** | Repo-wide grep over every `*.ts` / `*.tsx` / `*.sql` outside `node_modules` for `allocateEvaluatorSeatShare`, `computeAndPersistShadowDecision`, `EvaluatorSeatShareRepository`, `selectJudgesByBiasRank`, `shadow_decision`: **8 files, all of them the definition, its three test files, the migration, `schema.ts`, and two sibling evaluator tests.** Zero callers in `apps/**`, `packages/**`, `web/`, `tools/`, `acceptance/`, `deploy/` |
| **Direct DB reads by dispatch code** | Zero `evaluator.` references in `apps/runner`, `apps/api`, `apps/scheduler`, `packages/serve`, `packages/settlement`, `packages/providers` |
| **Role authority (the real gate)** | I set role and tried the writes. `debateai_runtime` and `debateai_settlement_watch` both get **`permission denied for schema evaluator`** on `shadow_decision`, `rank_snapshot`, and `relative_cost_cell` — the runtime that dispatches cannot read evaluator data *at all*, so even a future accidental code path fails at the database |
| **Write path back into routing** | As `debateai_evaluator_worker`: INSERT `scorecard.routing_decision` refused, INSERT `scorecard.session_assignment` refused, UPDATE `core.run` refused, INSERT `core.run` refused (all permission denied). Only `packages/settlement` writes `routing_decision` |
| **Structural leaks** | `pg_constraint`: 14 cross-schema FKs touch evaluator and **every one points outward** (evaluator → core/ledger/scorecard); nothing outside evaluator references an evaluator table. No non-evaluator view or matview reads `shadow_decision`. No rewrite rules on it |
| **BOUND state** | The diff contains no `BOUND` literal. `binding_state` is CHECK-pinned to `'UNBOUND'`; my direct INSERT with `'BOUND'` was rejected by `shadow_decision_binding_state_check`. UPDATE and DELETE both rejected by the append-only `reject_mutation` trigger. Every row also carries `not_consumed_reason = 'FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED'` |

The widened guard in `tests/architecture/evaluator-selector-unbound.test.ts` now walks `apps/**` *and*
`packages/**` for all three entry points, excluding only the definition file — a real improvement over
PROG-07's `apps/**`-only guard, and it passes.

**Binding wiring constraints (ticket 10):** the allocator constructs no `ProviderGateway` and no pool
(the only `ProviderGateway` references in the file are the pre-existing tagger/add-on types at lines 476
and 1447), so the Seat-B N5 nested-checkout deadlock is structurally impossible here. PROG-04 F3 is on the
checklist and correctly **not** wired.

---

## 5. Merge-gate ledger

| Gate | Status |
|---|---|
| No live call site (grep + test) | met — §4, two independent proofs plus a DB-role proof |
| Shadow-decision persistence tests | met — real embedded Postgres, real admitted `core.run`, idempotency asserted |
| M=1/2/3 formula tests with hand-computable expectations | met — I recomputed all of them independently |
| FR-8.0 blocker named in outputs | met — checklist header, README, and the persisted `not_consumed_reason` on every row |
| All differentials green | met — full suite 98/700, incl. the FR-0.6 AC5 panel-isolation differential |
| Typecheck | met — exit 0 |
| Pinned clocks | met — the DB fixture pins `admittedAt`; no `Date.now()`/`new Date()` without an argument in the diff |
| Real write paths in fixtures | met — the shadow write is the production repository against real Postgres; the raw `core.run` insert matches every sibling evaluator integration test |
| No vacuous assertions | met — unit tests assert exact seat multisets, not shapes |
| FR-8.1 AC1–AC4, FR-8.2 AC1–AC2 | met — §2 |
| Checklist carries register-sourced isolation set + FR-8.0 panel-shape items | met — see §6 |

**Bind-readiness checklist (`BIND-READINESS-seat-share.md`) audit.** It carries: FR-8.0 / PANEL-01
resolution with an approved panel-shape version, `agent_count` identity, distinct root-authorship proof,
reviewer rotation, producer-grading guards; V's bind order with provenance, formula/derivation versions,
rollback target, panel-shape version, register source receipt (matches architecture §6.1's five required
fields); **PROG-04 F3 register-sourced isolation set before any bind**; FR-0.6 AC5 (`configuredProviderSet`,
`agent_count`, `envelopeBasis`); Seat-B N5 gateway pooling; self-routing and maker/lineage guards; a
live-source audit; append-only UNBOUND shadow receipts with no `routing_decision` / `session_assignment`
write path; rollback to baseline `resolveDiscoveredPanel`; all nine PROG-07 disclosures verbatim; and the
Seat-B contradiction-sparsity disclosure. Nothing required is missing.

---

## 6. Findings (all non-blocking; 1, 3, 4 and 6 should reach the checklist before V reads it)

1. **The shadow receipt's hash is locale-dependent.** `seatShareInputReceipt` sorts both the candidate and
   producer arrays with `JSON.stringify(left).localeCompare(right)` (`packages/evaluator/src/index.ts`,
   the two `.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))` calls).
   `localeCompare` uses the host's default locale. I demonstrated this on the **real write path**: the same
   logical input with candidates `istanbul-7b` (rank 1) and `Istanbul-7b` (rank 2) persisted
   `input_hash=52583c34…` under `LC_ALL=en_US.UTF-8` and `input_hash=26035987…` under `LC_ALL=tr_TR.UTF-8`.
   Since `input_hash` is the `ON CONFLICT (run_id, kind, input_hash, formula_version)` idempotency key, two
   evaluator workers on differently-configured hosts write duplicate shadow rows for one decision.
   The allocator's own ordering already does this correctly — `compareProfileIdentity` uses code-unit
   `<`/`>` — and the repo has a standing architecture test named "avoids locale-dependent collation in
   propagation" (`tests/architecture/s03-contract.test.ts`), so this is against house norm.
   *Why not a blocker:* the allocation multiset is unaffected (verified: order-independent, 500-run
   identical), nothing consumes the receipt under FR-0.1, and the worst case is duplicate append-only dark
   rows. *Fix is one line:* replace both `localeCompare` sorts with the same code-unit comparison used by
   `compareProfileIdentity`.

2. **Shared-sequence coupling, including on the no-op path.** `await allocateSequence(client)` is evaluated
   as an argument to the INSERT, so **every** call consumes a `ledger.sequence_allocator` value even when
   `ON CONFLICT … DO NOTHING` inserts nothing (my D1: two calls, one insert, counter +2). Consequence per
   §3: a later admission's `created_at_seq` shifts. Pre-existing evaluator-wide pattern and semantically
   inert — record it as a checklist disclosure rather than reworking it, and consider allocating the
   sequence only on the insert path.

3. **No ordering constraint on the register-owned share vector.** `assertSeatShareVector` requires finite,
   non-negative shares summing to 1, but not `best >= runnerUp >= residual`. With the lane's fixture vectors
   the allocator is **perfectly monotone across all 3,888 grid cases** (zero rank inversions). With a
   register vector where `residual > runnerUp` (e.g. NORMAL `.5/.2/.3`) I reproduced **14 cases where rank 2
   receives zero seats while rank 3 is seated** — e.g. M=3, 2 seats → `[1, 0, 1]` — and the runner-up
   preservation guard cannot repair it, because its donor search requires some seat count `> 1`. I also
   confirmed an inverted PREMIUM vector `.2/.8` is accepted and hands the runner-up 8 of 10 seats, silently
   inverting FR-8.1 AC2. V ratifies these numbers at bind, so this is a checklist item ("the vector must be
   non-increasing"), ideally backed by an assertion.

4. **M=2 silently reabsorbs the residual share.** With no rank-3 candidate the weights renormalise over
   `best + runnerUp`, so the NORMAL vector `.6/.3/.1` actually allocates ~2/3–1/3 at M=2 (verified: 10 seats
   → 7/3, not 6/3). Deterministic and defensible, but the checklist tells V "M=2 uses deterministic
   largest-remainder rounding over best and runner-up" without saying the residual is redistributed — and V
   is being asked to ratify exactly those numbers. One sentence fixes it.

5. **M=1 receipt misstates the tier branch.** The early return hard-codes `selectedVector: "NORMAL"`, so a
   premium high-stakes request against a sole eligible model persists a shadow receipt claiming the NORMAL
   vector (verified B1). Allocation is right; the audit trail is not. A `SOLE_ELIGIBLE` marker would be honest.

6. **`evaluatorSeatSharePolicy` has a row key but no register reader.** The constant is declared and the
   policy's `rowKey`/`registerVersion`/`sourceRef` are validated, but nothing reads `register.register_row`
   — the policy is entirely caller-supplied, exactly like PROG-07 disclosure 3. Architecture §6.4 lists
   "policy shares and formula version from the register" among the allocator's inputs. Not required to wire
   pre-bind (correctly so), but the checklist should say the reader does not exist yet, so it is not
   mistaken for done at go-live.

7. **Risk tier union re-declared inline.** `riskTier: "casual" | "standard" | "high-stakes"` is written out
   rather than importing `RiskTier` / `RISK_TIERS` from `@debateai/kernel`. I verified the three values match
   the `core.run` CHECK in `0000_s00.sql:48-49` exactly; this is drift risk only.

8. **Guard scope.** The widened dark-launch guard walks `apps/**` and `packages/**`; `acceptance/`,
   `tools/`, and `web/` are not scanned, and it also recurses into `node_modules` directories (harmless
   under pnpm, since package-level entries are symlinks). My repo-wide grep confirms zero callers in those
   trees today. Worth extending when convenient.

---

## 7. Verdict

**PASS.** The formula is deterministic, hand-verifiable, and matches ruling 8 and FR-8.1 on every case I
computed — including the cheaper-model-is-better case, which correctly collapses premium and normal onto
the same multiset. Every degenerate input either produces a well-defined allocation or a typed refusal;
I could not produce a NaN, a silent fallback, or a non-summing multiset in 3,888 attempts. The dark-launch
posture is the strongest in the mission so far: no code caller anywhere in the repository, no cross-schema
FK inward, no view or rule, a CHECK-pinned `UNBOUND` state, append-only triggers, and — decisively — a
dispatch runtime role that cannot read the evaluator schema at all. A real admission's persisted state is
byte-identical with shadows computing or disabled. The bind-readiness checklist carries the
register-sourced isolation set, the FR-8.0 panel-shape items, and all nine PROG-07 disclosures.

None of the eight findings can affect dispatch, and none contradicts a merge gate or an acceptance
criterion. Findings 1, 3, 4 and 6 should be folded into `BIND-READINESS-seat-share.md` (and finding 1 is a
one-line code fix worth taking now) before this packet goes in front of V at go-live.
