# PROG-10 — Opus reviewer A, round 1

Lane: `codex/eval-10-seatshare` (commit `0c17179`)
Worktree reviewed: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare`
Diff: `git diff dev...codex/eval-10-seatshare` — 6 files, +626/-5.
Binding docs: Architecture §6 / §7 tier-6B / §8; Requirements §8 (FR-8.0, FR-8.1, FR-8.2), ruling 8,
FR-0.1, FR-0.6 AC5; wayfinder ticket 10; goal packet `PROG-10-codex-seatshare.md`.

**VERDICT: REWORK** — four small, mechanical blockers. The allocator itself is correct
(I hand-computed M=1/2/3 and re-derived every committed expectation), darkness holds in
fact under a whole-repo grep, and the whole repository is green. The blockers are all in
the *proof* layer: the dark-launch guard does not cover half the workspace source roots,
and three architecture-mandated allocator behaviours have zero coverage, one of them
behind a test title that claims to cover it.

---

## 1. Verification actually run (not asserted)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm run typecheck` (`tsc --noEmit`) | clean, no output |
| Full suite | `npx vitest run` | **98 files / 700 tests passed** |
| Unit + architecture | `npx vitest run tests/unit tests/architecture` | 77 files / 537 passed |
| Integration (incl. FR-0.6 AC5 differential, lanes 04/05/06) | `npx vitest run tests/integration` | 14 files / 131 passed |
| Architecture audit | `pnpm run audit:architecture` | `{"edgeRowsChecked":27,"violations":[]}` |
| Source audit | `pnpm run audit:source` | `{"blocking":[]}` |
| Whole-repo call-site grep | `grep -rn "allocateEvaluatorSeatShare\|computeAndPersistShadowDecision\|PostgresEvaluatorSeatShareRepository\|EvaluatorSeatShare\|SEAT_SHARE" --exclude-dir=node_modules --exclude-dir=.git .` | hits only in the definition file, the 3 test files, README, checklist, migration `0023`, Architecture.md and two Hermes logs. **Zero call sites.** |

Differentials named in the packet are green inside that run:
`tests/integration/evaluator-database.test.ts` → *"FR-0.6 AC5 persisted panel-isolation
differential"* (line 1027) passes, as do the lane-04/05/06 evaluator suites
(`evaluator-database`, `evaluator-harvest-rework`, `evaluator-addon-database`,
`evaluator-profiles-database`, `evaluator-profiles-rework`).

---

## 2. Axis 1 — allocation formula vs ruling 8 (hand-computed)

Formula as implemented (`packages/evaluator/src/index.ts:2767–2875`): filter `healthy`,
sort by `prowessOrdinal` → comparable lower `relativeCost` → code-unit identity
(`compareProfileIdentity`); pick vector `BEST_ALSO_CHEAPER` > `PREMIUM` > `NORMAL`;
weights `[best, runnerUp, residual·(1/(i+3))/Σ]`; largest-remainder rounding;
runner-up preservation; freeze and return.

I recomputed every committed expectation by hand and then re-ran the allocator to confirm:

| Case | Weights | Quotas | Floors | Unallocated | Hand result | Test expects |
|---|---|---|---|---|---|---|
| M=1, 7 seats | — | — | — | — | `only: 7` | `only: 7` ✔ |
| M=2 premium, 10 seats | `[0.8, 0.2]` | `[8, 2]` | `[8, 2]` | 0 | `best 8 / runner 2` | same ✔ |
| M=3 normal, 10 seats | `[0.6, 0.3, 0.1·(1/3)/(1/3)=0.1]` | `[6, 3, 1]` | `[6, 3, 1]` | 0 | `6 / 3 / 1` | same ✔ |
| M=3 cheaper-best, 20 seats | `[0.8, 0.15, 0.05]` | `[≈16, ≈3, ≈1]` | `[15, 2, 0]` | 3 (all three get +1) | `16 / 3 / 1` | same ✔ |
| M=2 tie, 2 seats | `[0.6, 0.3]` renormalised over 0.9 | `[1.33, 0.67]` | `[1, 0]` | 1 → idx 1 | `a 1 / z 1` | same ✔ |

Every multiset sums to `requestedSeatCount` (FR-8.1 AC4). Premium M=2 gives the
better-ranked model strictly more (8 > 2) — FR-8.1 AC2 ✔. M=1 assigns all seats without
error — AC3 ✔. Output is a deterministic multiset with no RNG anywhere — AC1 ✔.
Float behaviour is benign: largest-remainder is self-correcting, and
`assertSeatShareVector`'s `1e-12` tolerance absorbs the `0.6+0.3+0.1 = 0.999…9` case.

**Cost signal genuinely comes from lane 08.** `EvaluatorSeatShareCandidate.relativeCost:
number | null` + `costComparability: "COMPARABLE" | "UNKNOWN"` is exactly
`RelativeCostCellV1.relativeCost` / `.comparability` (same file, line 3326+), and the
allocator re-asserts lane 08's own invariant (`null ⟺ UNKNOWN`, finite, ≥ 0) at
`:2806–2810`. The cheaper-best test only fires when **both** top candidates are
`COMPARABLE`, so an unmetered path can never be fabricated into "cheaper" (FR-6.2 /
FR-0.5). Correct and honest.

**Ruling-8 shape is not enforced in code — only in the register numbers.** I ran the
allocator with a hand-built policy row:

- `premium: {best: 0.2, runnerUp: 0.8}` → `best 2 / runner 8`. Accepted silently. A
  register vector can invert ruling 8's core clause ("most seats to the better-ranked
  model") and the allocator complies.
- `bestAlsoCheaper` **overrides** premium unconditionally, so with
  `premium {0.8/0.2}` and `bestAlsoCheaper {0.5/0.4/0.1}` a premium ask returns
  `8/2` when the best model is *expensive* but `6/4` when it is *cheap* — the opposite
  of "if the better model is also cheaper, both tiers mostly use it".

`assertSeatShareVector` only checks non-negative and sums-to-1. Architecture is explicit
that V ratifies the numbers, not the code, and checklist item 6 does disclose the
precedence — so this is **non-blocking**. But a shape assertion (`best ≥ runnerUp`, and
`bestAlsoCheaper.best ≥ premium.best`) would cost three lines and would make ruling 8
un-violatable by a bad register row. Recommended, plus one checklist line naming the
inversion hazard.

---

## 3. Axis 2 — DARKNESS

Strong parts, verified:

- **Zero call sites, repo-wide** (my own grep, above; not just the lane's test).
- Shadow decisions persist without any dispatch coupling: `evaluator.shadow_decision`
  (`migrations/0023_evaluator_foundation.sql:268`) has `binding_state text NOT NULL
  CHECK (binding_state='UNBOUND')`, `not_consumed_reason` NOT NULL, an append-only
  `reject_mutation` trigger, `REVOKE UPDATE, DELETE` from every evaluator role, and the
  `ON CONFLICT (run_id,kind,input_hash,formula_version)` target matches the declared
  `UNIQUE NULLS NOT DISTINCT` constraint exactly. The evaluator worker role holds **no**
  grant on `scorecard.routing_decision` or `scorecard.session_assignment` (0023 grant
  block), so §6.2's structural claim is real at the DDL level.
- **FR-8.0 is named in three places**, including the strongest possible one — it is
  persisted on every shadow row as `not_consumed_reason =
  'FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED'` (`SEAT_SHARE_NOT_CONSUMED_REASON`), plus the
  README section and the checklist header/gate.
- **Bind-readiness checklist delivered** (`packages/evaluator/BIND-READINESS-seat-share.md`)
  and it carries **the register-sourced isolation-set item** ("The composition root
  sources the evaluator isolation set from the register before any bind (PROG-04 F3)"),
  the Seat-B N5 gateway-pool item, FR-0.6 AC5, rollback, and all nine PROG-07 disclosures
  plus the contradiction-sparsity note required by ticket 10.

**Blocker 1 — the darkness guard walks only half the workspace.**
`tests/architecture/evaluator-selector-unbound.test.ts` walks `apps/` and `packages/`.
`pnpm-workspace.yaml` declares `apps/*`, `packages/*`, `packages/battery/*`, **`tools/*`**
and **`web`**; `acceptance/` also holds runnable job code (`pnpm job:review-catch-up`).
That is **51 unscanned `.ts`/`.tsx` files** in `web/` + `tools/` + `acceptance/` — and
`web/app/settings/page.tsx` and `web/app/admin/` are exactly where ticket 11's dev menu
may land. Darkness is true today (my grep proves it), but the regression guard the merge
gate leans on is blind to the surface the next lane builds on. One-line fix: add the
three roots to the walked list.

---

## 4. Axis 3 — no gateway over the lock pool

Clean. The allocator is pure deterministic code and constructs **no** `ProviderGateway`
at all; `PostgresEvaluatorSeatShareRepository` takes a `Pool` and does a single
`withWriteTransaction(this.pool, …)` with no nested checkout and no lock held across a
model call. Seat-B N5 cannot fire here, and the constraint is carried forward onto the
bind-readiness checklist for the future bound adapter, exactly as ticket 10 asked.
No finding.

---

## 5. Axis 5 — test honesty

**Blocker 2 — the runner-up preservation branch has zero coverage, behind a test title
that claims it.** `src/index.ts:2861–2866` implements Architecture §6.4 step 4 ("if at
least two seats and the runner-up share is positive, preserve one runner-up seat"). For a
two-bucket largest-remainder split the branch fires iff `n · runnerUpShare < 0.5`. Every
committed multi-candidate case is far above that line (premium `10 × 0.2 = 2`; tie
`2 × 0.333`; both M=3 cases), so `seats[1]` is never 0 and the `if` never executes — yet
the test is named *"is deterministic on identity ties, **preserves a positive runner-up
seat**, and refuses self-routing"*. I confirmed reachability directly (policy
`{best 0.9, runnerUp 0.1}`): raw largest-remainder gives `[2,0] [3,0] [4,0] [5,0]` for
n = 2,3,4,5 and the clause correctly corrects them to `[1,1] [2,1] [3,1] [4,1]`. The code
is right; the claim of coverage is not. Add the case (and note on the checklist that at
n=2 preservation forces a 1/1 premium tie, i.e. "strictly more" cannot hold at two seats).

**Blocker 3 — M=0 refusal and the `healthy` filter are untested.** Architecture §6.4 step 1
mandates "M=0 refuses as no eligible model", and `healthy` is a declared allocator input.
No committed test ever passes `healthy: false`. I verified both work
(`NO_ELIGIBLE_MODEL` typed refusal; an unhealthy runner-up is dropped and rank 3 slides
into the runner-up share), so this is two cheap assertions, not a redesign.

**Blocker 4 — the "no dispatch" DB assertion is vacuous.**
`tests/integration/evaluator-seat-share-database.test.ts:85–87` asserts
`SELECT count(*) FROM scorecard.routing_decision WHERE session_id='session:seat-share'`
is `0`. The table is empty for the whole test database and nothing in the test could ever
write to it, so the assertion is true by construction regardless of the code under test.
It also runs on the test's admin pool, not `debateai_evaluator_worker`, so it proves
nothing about the grant isolation the checklist claims ("structurally unable to write
`scorecard.routing_decision` or `scorecard.session_assignment`"). Replace with a
privilege assertion (`has_table_privilege('debateai_evaluator_worker',
'scorecard.routing_decision', 'INSERT') = false`, same for `session_assignment`), which
is what the checklist actually promises V and is genuinely load-bearing.

Honest parts worth recording: clocks are pinned (`new Date("2026-08-15T19:00:00.000Z")`;
the allocator has no clock and `shadow_decision` has no timestamp column, so there is no
unpinned-clock surface); the shadow write goes through the real `withWriteTransaction` +
real SQL against a real migrated PostgreSQL; idempotency is proven by a genuine second
call returning `inserted: false` with the same id; and the persisted `input_json` /
`output_json` are compared to the returned receipt rather than to `expect.any(Object)`.

---

## 6. Non-blocking findings

1. **Ruling-8 shape unguarded** (detail in §2): register vectors can invert
   best/runner-up, and `bestAlsoCheaper` overriding `premium` can *reduce* concentration
   for a premium ask when the best model is cheaper. Add shape assertions + a checklist
   line.
2. **`localeCompare` decides the idempotency hash.** `seatShareInputReceipt`
   (`:2753`, `:2771`) sorts the receipt with
   `JSON.stringify(left).localeCompare(JSON.stringify(right))` — no pinned locale — and
   that serialized receipt is what `createHash("sha256")` consumes as `input_hash`, the
   `ON CONFLICT` idempotency key. This repo explicitly bans locale-dependent collation
   (`tests/architecture/s03-contract.test.ts:21` asserts propagation
   `not.toContain("localeCompare")`) and pins `"en-US"` elsewhere in this very file
   (`:936`, `:956`). Use code-unit comparison, as `compareProfileIdentity` (`:2298`)
   already does 400 lines above. Consequence today is at worst a duplicate shadow row, so
   non-blocking — but it is the wrong precedent in a hash input.
3. **M=1 receipt is mislabelled.** A premium M=1 request returns
   `selectedVector: "NORMAL"` (verified) although no vector was applied. In a receipt V
   reads at bind, `SOLE_ELIGIBLE` would be honest.
4. **M=2 residual absorption is undocumented and untested.** With the normal vector
   `{0.6, 0.3, 0.1}` and no third model, the residual is renormalised into best/runner-up:
   10 seats → `7/3` (verified). Sensible, but neither README nor checklist says where the
   residual goes when M=2, and no test covers it.
5. **Dead guard.** `residualDenominator === 0 ? 0 : …` (`:2856`) is unreachable — an
   empty residual list produces no weights at all.
6. **README overstates the fixture.** It says the shadow path "may run against a real
   admitted `core.run`"; the test hand-inserts the run row. That matches sibling evaluator
   integration tests (`evaluator-profiles-database:26`, `evaluator-addon-database:34`), so
   the fixture is fine — the wording is what overreaches. `evaluator-database.test.ts`'s
   `admitAndReadPersistedRun` shows a real-admission helper exists if wanted.
7. **Cheaper-best silently degrades under unmetered coverage.** If either of the top two
   is `UNKNOWN`, the clause never fires and the ask falls back to premium/normal. That is
   the correct no-fabrication behaviour, but V should see it on the checklist next to
   item 6.

---

## 7. Scope, law, and hygiene

- No `BOUND` state anywhere; `binding_state` is CHECK-constrained to `'UNBOUND'`.
- No lane-09 consumer-reader files touched; the only shared edit is widening
  `ProfileIdentity` to `export` — additive, no behaviour change, typecheck clean.
- No push, no board mutation, no migration added (reuses lane-02's `0023` table).
- DR-179: no key material in the diff.
- FR-8.2 AC3 honoured — the numeric vectors live in test fixtures and a register-owned
  policy row, not in library code.

## 8. What a re-review needs

1. Darkness guard extended to `web/`, `tools/`, `acceptance/`.
2. A test that drives `seats[1] === 0` and asserts the preserved runner-up seat.
3. M=0 `NO_ELIGIBLE_MODEL` and an unhealthy-candidate filter assertion.
4. Grant-privilege assertion replacing the empty-table row count.

Everything else above is advisory. The formula, the receipts, the FR-8.0 naming and the
bind-readiness pack are in good shape and I found no correctness defect in the allocator.
