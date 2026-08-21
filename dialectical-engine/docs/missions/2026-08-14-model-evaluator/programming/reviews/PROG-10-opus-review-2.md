# PROG-10 — Opus reviewer A, round 2

Lane: `codex/eval-10-seatshare`, rework commit `310ce9b` "test(evaluator): close seat-share rework gaps"
(on top of `0c17179`, reviewed in `PROG-10-opus-review-1.md`).
Rework diff: `git diff 0c17179..310ce9b` — 5 files, +115/-16.

**VERDICT: PASS.** All four of my round-1 blockers are genuinely resolved, and I verified
each one by re-deriving the behaviour myself rather than by reading the claim. Three of my
round-1 non-blocking findings were also closed (locale-dependent hash sort in code, plus
monotonicity, M=2 residual reabsorption and the missing register reader added to V's
checklist). No new defect introduced; nothing in the allocator's algorithm changed except
the receipt's sort comparator.

---

## 1. Verification re-run at `310ce9b`

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm run typecheck` | clean |
| Full suite | `npx vitest run` | **98 files / 702 tests passed** (was 700; +2 new unit tests) |
| Seat-share trio, verbose | `npx vitest run tests/{integration/evaluator-seat-share-database,unit/evaluator-seat-share,architecture/evaluator-selector-unbound}.test.ts` | 3 files / 9 tests passed |
| Architecture audit | `pnpm run audit:architecture` | `violations: []` |
| Source audit | `pnpm run audit:source` | `blocking: []` |
| Whole-repo call-site grep | `grep -rn "allocateEvaluatorSeatShare\|computeAndPersistShadowDecision\|PostgresEvaluatorSeatShareRepository" --exclude-dir=node_modules --exclude-dir=.git .` minus the definition file, `tests/`, and `.md` | **empty** — still zero call sites |

The FR-0.6 AC5 panel-isolation differential and the lane-04/05/06 evaluator suites remain
green inside the full run.

---

## 2. Blocker 1 — darkness guard scope: **RESOLVED**

`tests/architecture/evaluator-selector-unbound.test.ts` now iterates
`["apps", "packages", "web", "tools", "acceptance"]`. I did not take the diff's word for
it: I replicated the test's own `productionSources` walker in a scratch script against the
worktree and counted what it actually reaches.

```
apps: 75   packages: 30   web: 22   tools: 4   acceptance: 31      (162 files)
  includes web/app/settings/page.tsx     : true
  includes web/app/admin/workers/page.tsx: true
  includes tools/orphan-audit/src/cli.ts : true
  includes acceptance/discovery.ts       : true
```

The two surfaces I specifically named as lane 11's likely dev-menu home —
`web/app/settings/` and `web/app/admin/` — are now inside the guarded set. That covers
every root declared in `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `packages/battery/*`,
`tools/*`, `web`) plus `acceptance/`, which holds runnable job code. `tests/` is still
excluded, correctly — the tests must be allowed to call the allocator. The checklist's
live-source-audit line and PROG-07 disclosure 2 were both updated to name the five roots,
so the checklist no longer overstates the guard.

## 3. Blocker 2 — runner-up preservation coverage: **RESOLVED**

New test *"preserves the runner-up when its positive quota rounds to zero"*: 2 seats,
`high-stakes` / depth 3, premium vector overridden to `{best 0.9, runnerUp 0.1}`, expecting
`best 1 / runner 1`.

I re-ran my round-1 reachability check on the committed inputs to confirm the branch is
what makes that assertion true, and that the assertion is discriminating rather than
coincidental:

```
preservation test: vector=PREMIUM  raw(no clause)=[2,0]  actual=[["best",1],["runner",1]]  => clause fired: true
```

Largest-remainder alone yields `[2, 0]` (n·runnerUpShare = 0.2 < 0.5, exactly the condition
I derived in round 1); the asserted `[1, 1]` is only reachable through the preservation
clause at `src/index.ts:2861–2866`. Delete the clause and this test fails. Coverage is now
real, and the test title matches what the body proves.

The interaction I asked to be disclosed is on the checklist: *"a two-seat premium request
with a positive runner-up share is forced to a 1/1 tie, even when its raw rounded
allocation would be 2/0."* That is the honest statement — V now sees that FR-8.1 AC2's
"strictly more" cannot hold at two seats.

Cosmetic leftover: the older tie test still carries "preserves a positive runner-up seat"
in its title although its own body does not fire the clause. Harmless now that a dedicated
test exists, but the phrase could be dropped.

## 4. Blocker 3 — M=0 refusal and `healthy` filter: **RESOLVED**

New test *"refuses M=0 and filters unhealthy candidates before allocation"*. I checked both
arms independently:

```
M=0 throws: NO_ELIGIBLE_MODEL | typed: TypedDomainError
healthy filter ON : [["healthy-best",7],["healthy-third",3]]
healthy filter OFF: [["healthy-best",6],["unhealthy-runner",3],["healthy-third",1]]  => assertion discriminates: true
```

The M=0 arm asserts the typed `NO_ELIGIBLE_MODEL` refusal required by Architecture §6.4
step 1. The filter arm is genuinely discriminating: with the same three candidates all
healthy the result is `6/3/1`, so an allocator that ignored `healthy` would fail the
asserted `7/3`. It also incidentally exercises rank 3 sliding into the runner-up share —
a behaviour that had no coverage before.

## 5. Blocker 4 — vacuous no-dispatch assertion: **RESOLVED**

The `count(*) = 0` check on an always-empty `scorecard.routing_decision` is gone, replaced
by the structural proof the checklist actually promises V:

```sql
has_table_privilege('debateai_evaluator_worker','scorecard.routing_decision','INSERT')   AS routing_insert,
has_table_privilege('debateai_evaluator_worker','scorecard.session_assignment','INSERT') AS assignment_insert
```

asserted `false` / `false`. This is load-bearing in both directions: PostgreSQL raises
`role "…" does not exist` for an unknown role, so a *passing* `false` proves the role
exists **and** holds no INSERT authority on either dispatch table — matching the 0023 grant
block and Architecture §6.2 ("evaluator DB roles have no authority to write
routing/session-assignment tables"). The test passed on a real migrated database in my run.

Minor, non-blocking: a positive control (assert the worker *does* hold INSERT on
`evaluator.shadow_decision`) would prove the query is not trivially false-returning. Not
required — an unknown role errors rather than returning false.

## 6. Round-1 non-blocking items also closed

- **Locale-dependent hash sort — fixed in code.** `seatShareInputReceipt` now sorts with a
  new `compareCodePointStrings` (`src/index.ts:2304–2314`) instead of unpinned
  `localeCompare`. It returns 0 only for identical strings, so the sort no longer depends on
  ICU collation *or* on stable-sort fallback for collation-equal-but-different strings —
  which closes the failure mode fully, not just the locale half.
  The accompanying test is genuinely discriminating: it `vi.spyOn`s `String.prototype.
  localeCompare` and mocks it to **reverse** ordering, re-runs
  `computeAndPersistShadowDecision`, and asserts the same `shadowDecisionId` with
  `inserted: false`. Had the receipt still used `localeCompare`, the two candidates would
  reorder, the serialized receipt and its SHA-256 `input_hash` would change, and a second
  row with a new id would be inserted — the test would fail. The spy is restored in a
  `finally`. Good test.
  Note two locale-free string orders now coexist in the file (`compareProfileIdentity`'s
  UTF-16 code-unit `<`/`>` vs the new code-point comparator); they differ only for astral
  characters, both are deterministic, and neither feeds the other's output. No action.
- **Ruling-8 shape** is now an explicit V ratification item: *"Require every approved share
  vector to be monotonic by rank (`best >= runnerUp >= residual`)"*, with the starvation
  rationale. Architecture reserves the numbers for V, so putting the shape law on the
  ratification list is the right resolution; a code assertion remains optional hardening.
- **M=2 residual reabsorption** is now disclosed: *"with no residual candidates, the
  residual share is silently reabsorbed by normalization into best and runner-up rather
  than retained or refused."* Matches the behaviour I measured (normal vector, 10 seats,
  M=2 → 7/3).
- **Missing register reader** added as a bind gate: *"Add and bind a validated register
  reader for `evaluatorSeatSharePolicy`; the dark allocator currently accepts a
  caller-supplied policy receipt and does not resolve the row itself."* Honest, and
  consistent with PROG-07 disclosure 3.

## 7. Remaining advisory notes (none blocking, none regressions)

1. M=1 still reports `selectedVector: "NORMAL"` for a premium ask; `SOLE_ELIGIBLE` would be
   more honest in a receipt V reads. Vector is vacuous at M=1, so no allocation effect.
2. `residualDenominator === 0 ? 0 : …` (`:2856`) remains unreachable dead code.
3. README still says the shadow path "may run against a real admitted `core.run`" while the
   fixture hand-inserts the row — the same convention as the sibling evaluator integration
   tests, so the fixture is fine and only the wording overreaches.
4. Cheaper-best silently degrades to premium/normal when either top candidate is
   `UNKNOWN`/unmetered. Correct no-fabrication behaviour (FR-0.5), but it is not stated next
   to checklist item 6 and V should know the clause can be dormant under thin metering.
5. The grant assertion could carry a positive control (§5).
6. The older tie test's title still claims runner-up preservation (§3).

## 8. Standing at PASS

- FR-8.0 named in README, checklist, and persisted on every shadow row as
  `not_consumed_reason = 'FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED'`.
- Bind-readiness checklist delivered with the register-sourced isolation-set item
  (PROG-04 F3), the Seat-B N5 gateway-pool item, FR-0.6 AC5, rollback, all nine PROG-07
  disclosures and the contradiction-sparsity note.
- Zero call sites repo-wide, now guarded across every workspace source root.
- Allocator arithmetic unchanged from round 1 and still matches my hand computation
  (M=1 → 7; M=2 premium 10 → 8/2; M=3 normal 10 → 6/3/1; M=3 cheaper-best 20 → 16/3/1);
  every multiset sums to the requested seat count.
- No gateway constructed anywhere; single `withWriteTransaction`, no nested checkout.
- No `BOUND` state; `binding_state` CHECK-constrained to `'UNBOUND'`; append-only.
- Typecheck, 702 tests, and both audits green.
