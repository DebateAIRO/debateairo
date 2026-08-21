# REVCOV-01 — ADVERSARIAL OPUS LENS, REVIEW 1 (t_f5bd09a5)

**Seat:** single independent Opus 5 adversarial lens under **DR-186(9)** (Grok's seat
unfunded — disclosed). **Brief: refute-first.**

**Same-house note, inverted.** DR-185's echo-chamber risk does **not** apply here: Codex
coded, and this lens is the rival house. But it applies to the *contract* I am judging
against — C-1…C-11 are a Claude verdict, and I am Claude. Where I found the prior lens's
condition under-specified I say so rather than treating it as scripture (see F3 and A4).

**Isolation (DR-163):** every mutation ran in a throwaway clone at
`/private/tmp/revcov01-opus-clone` (`cp -Rc` of the parent root). All ten touched files
verified `cmp`-identical to the main tree afterwards; clone deleted. **The standing stack
(PG 55432 / API 8790 / shim 8791 / relay 8792 / UI 3000) was never touched** — no process
control, no live catch-up. That ceremony remains the orchestrator's.

**Delta judged:** working tree vs `f065e7c` plus 6 untracked files. Excluded as
parallel-mission territory: `docs/missions/2026-08-14-model-evaluator/**`, `.hermes/**`,
and their code (`packages/evaluator/**`, `migrations/0024_evaluator_domain_seed.sql`,
`tests/unit/evaluator-*`, `acceptance/*-relay*`). REVCOV-01's own delta is cleanly
separable; the worker did not touch evaluator dirt, as claimed.

**Baseline reproduced in the clone:** `87 files / 628 tests passed` in 30.79 s on real
embedded PostgreSQL — matches the handoff exactly. `generate:contract` **zero drift**
(sha256 before == after), `typecheck` exit 0, `lint` `edgeRowsChecked: 27, violations: []`
and `source blocking: []`.

---

## 0. Verdict summary

The engineering is good and, on the two hardest mechanisms, **correct**. I independently
re-derived the ceiling and got the worker's number. I replayed the prior lens's C-2 blocker
on real PostgreSQL and the fix genuinely works. The closure counterexample is fixed exactly
as ruled, the migration is right and the worker was right to override the plan.

Against that: **three ruled values or binding conditions are provably not delivered** — and
in each case what is missing is the *proof*, not the mechanism, except for the census, where
the arithmetic itself breaks. All three are small and local.

| Axis | Result |
|---|---|
| C-1 ceiling v2 (1584 / panel-1 → 28) | **CONFIRMED** — recomputed independently, cell by cell |
| C-2 catch-up call budget | **MECHANISM CONFIRMED on real PG** / **TEST OBLIGATION UNMET** → F1 |
| C-3 three-insert threading | **CONFIRMED** — red on real PG when reverted |
| C-4 incoming-arrow closure | **CONFIRMED** — the prior lens's exact counterexample is the test |
| C-5 / C-6 declared behaviour changes | **CONFIRMED** (C-5 with a minor gap, A6) |
| C-7 orphan-audit registration | **CONFIRMED** — registered at `productionEntryPointFiles` |
| C-8 before-state evidence | **CONFIRMED** as recorded (holds = 2, unreviewed = 70) |
| C-9 sentinel | **UNDER-ARMED** — a new shipped writer leaves it green → F3 |
| C-10 narrowed T1 | **CONFIRMED**, with a ledger imprecision (A4) |
| C-11 V-row carriage | **CONFIRMED** — all eight rows + both dissents carried |
| Migration (epoch-2 override) | **CORRECT** — the worker's handback was right; DDL proven both directions and replay-safe |
| DR-186(5) census "sums to truth" | **REFUTED** — double-counts low-score nodes → F2 |
| DR-186(7) typed refusal + sentinel | refusal ✅ / sentinel ❌ → F3 |
| DR-115 / DR-165(3) / DR-179 / N-generic | **HOLD** |

---

## 1. Mutation table — every mutation run, named test red, restored green

Each row: mutation applied in the clone → the *named* test that died → file restored and
re-verified `cmp`-identical.

| # | Mutation | Named test that went RED | Restored |
|---|---|---|---|
| M1 | `reviewCatchUpCallSiteKey` → `JUDGE:review:${nodeId}` (reinstates the C-2 blocker) | **NONE — all 628 tests stayed GREEN** | ✅ → **F1** |
| M2 | cap branch → `halted(error, error.attempts)` (restore cap-coupling) | `T4 … MAKER_POSITION`, `T4 … EXPANSION` — `expected [[3]] to deeply equal [[3],[4]]` | ✅ |
| M3 | disable the `failureScope === "REVIEW"` zero-hold branch | `T3 gives reviews zero in-run holds …` — `countCooldownHolds` called 1 time | ✅ |
| M4 | halt state hard-coded to `EXPANSION_HALTED` (restore silent darkness) | `T4 … MAKER_POSITION`, `T4 … REVIEW` | ✅ |
| M5 | ceiling formula reverted to flat `maxCooldownHoldsPerRun × finalRetryAttempts` | `dr181-ceiling` (`expected 74 >= 88`), `T5` (`expected 29 to be 28`), `register-s09` | ✅ |
| M5b | `formula_version` → `DR-181-v1` | `T5` — `expected 'DR-181-v1' to be 'DR-184-v2'` | ✅ |
| M6 | drop the incoming-arrow disjunct from `projectJudgedStanding` | `T8/C-4 … cross-root attacker` (`expected ['root-a'] to include 'root-b'`), `T10/T14` | ✅ |
| M7 | revert C-3 threading at `condition_mark` + `served_number` (real PG) | `T33 serves over the judged graph …` — `expected Set{'answer'} to equal Set{'answer','mark','number'}` | ✅ |
| M9 | remove the positive-`judgedBasisCount` validation in `serve` | `T10/T14 …` — `expected function to throw an error, but it didn't` | ✅ |
| M10 | delete the fourth census term from the sticky control | `DR-184 T28 renders the immutable four-term standing census` | ✅ |
| M11 | remove the `judged_basis_count` CHECK from migration 0025 (real PG) | `T33 …` — `promise resolved … instead of rejecting` | ✅ |
| M12 | a scanned writer emits `magnitudeStatus: "MEASURED"` | `T13/C-9 fails when any shipped writer emits a measured edge` | ✅ |
| M13 | a **new** shipped file (`packages/propagation/src/opus-future-evaluator.ts`) emits `magnitudeStatus: "MEASURED"` | **NONE — sentinel stayed GREEN** | ✅ → **F3** |
| M14 | apply migration 0025 **twice** on real PG (replay-safety probe) | no error; exactly 1 `judged_basis` constraint; column present | ✅ |
| M15 | v2 **copies** v1 composition/conformance instead of referencing | `T33 …` — but only incidentally, via `conformance_record_coverage_mode_check` | ✅ → A3 |

**Verdict on the ledger:** the worker's P1 T1–T30 table is honest and, with the exceptions
named in F1/F3 and A3/A4, its rows do kill what they claim to kill.

---

## 2. C-condition audit

### C-1 — ceiling arithmetic. **CONFIRMED, recomputed from source, not read.**

`packages/register/src/index.ts:173-183` now computes
`(authored + reviews) × (judgeMaxAttempts + finalRetryAttempts) + fixedSites × organMaxAttempts`.
Recomputed independently at panel 3 / depth 5: `nodesPerRoot = (2⁶−1)/(2−1) = 63`;
`authored = 3×63 + 3×2 = 195`; `reviews = 195`; `fixedSites = 2 × 4 = 8`;
`390 × 4 + 24 = ` **1584** ✅. Spot-checked panel 2/d1 = 88, panel 2/d5 = 1048,
panel 3/d1 = 144, panel 4/d5 = 2136 — every cell of the shipped table matches my own
arithmetic. `formula_version` = `DR-184-v2` ✅.

**The panel-1 consequence — how the worker treated the shipped test.** This was the part of
C-1 the prior lens flagged as uncaught by any obligation, so I looked hardest here. At panel 1
the new ceiling is `1×4 + 24 = 28` against the old assertion's `29`. The worker moved the
**independent enumeration** in `tests/unit/dr181-ceiling.test.ts:23` from
`(authored + reviews) * 3 + fixedSites * 3 + 2` to `(authored + reviews) * (3 + 1) + fixedSites * 3`
in the same change.

I checked whether this destroyed the test's independence, which would be the cheap way to
make a failing assertion pass. **It does not.** The enumeration still derives `authored` from
real `buildMultiMakerExpansionPlan` / `buildCrossRootExchangePlan` output rather than the
closed form — that is where the independence lives, and it is untouched. Only the per-site
attempt multiplier now mirrors the implementation, which is unavoidable: it *is* the ruled
change. `toBeGreaterThanOrEqual` holds at panel 1 with **zero slack** (28 vs 28), exactly as
the prior lens predicted and accepted. M5 confirms the enumeration still bites: reverting the
formula fails it with `expected 74 >= 88`.

One thing I verified rather than assumed: the cap-coupling fix now grants a final attempt at
**every** authoring site, not just two per run. That is only lawful if the ceiling provisions
it. It does — and organs are correctly *not* provisioned a final retry, because
`cooldownAttempt` is reachable from exactly three call sites (`:1434` MAKER_POSITION, `:1586`
EXPANSION/MAKER_POSITION, `:1757` REVIEW). `COMPOSER:` and `CONFORMANCE:` (`:2251`, `:2302`)
bypass `withCooldownRetry` entirely, so `fixedSites × organMaxAttempts` is right and there is
no under-provision. **The formula and the code agree.**

### C-2 — the catch-up call budget. **MECHANISM CONFIRMED. TEST OBLIGATION UNMET.** → F1

I replayed the prior lens's scenario on real embedded PostgreSQL rather than trusting either
document. Seeded a run + work item, wrote **3 `MODEL_CALL` ledger rows** at
`JUDGE:review:node:opus-c2`, then drove `createPostgresProviderGateway` twice:

```
LEG 1  callSiteKey = JUDGE:review:node:opus-c2      → CALL_BUDGET_EXHAUSTED, provider calls = 0
LEG 2  callSiteKey = JUDGE:review:catch-up:…:node:opus-c2 → reached the relay, provider calls = 1
       run-total after       = 4   (pinned ceiling still counts the catch-up)
       in-run key cumulative = 3   (untouched by the catch-up)
       catch-up key          = 1
LEG 3  same call under a 2-attempt pinned ceiling   → RUN_COST_ENVELOPE_EXHAUSTED, calls = 0
```

**The blocker is genuinely dead and both budgets behave as VROW-6 requires** — the
invocation-scoped site key clears the per-call-site cumulative bound while the pinned
run-total ceiling still governs and still refuses a runaway. `subjectItemId` correctly stays
the original work item; `bound.maxAttempts` stays the ruled JUDGE 3.

That is the good news. See F1 for what is missing.

### C-3 — three-insert threading. **CONFIRMED.**

`answerVersion` is computed once from `MAX(answer_version)+1` and threaded through
`serve.fact_bundle`, `serve.answer`, `serve.condition_mark` and `serve.served_number`.
M7 (reverting the mark + number bindings) goes **red on real PG**. Worth recording: the
failure mode is *worse* than the duplicate key the prior lens predicted — `condition_mark`'s
PK is `condition_mark_id`, so v2's marks are written silently **into v1's version**, mutating
served history. The test catches it via both the version-set assertion and the `v1After ==
v1Before` byte-identity check. Good.

### C-4 — the incoming-arrow closure. **CONFIRMED — the counterexample is the test.**

`projectJudgedStanding` (`apps/runner/src/index.ts:131-208`) propagates basis along
`childrenByParent` **and** `incomingByTarget`, with EDGE-targeted arrows resolved through
`resolveTargetNode` (cycle-guarded). `tests/unit/dr184-judged-standing.test.ts:31` is
literally the prior lens's scenario: `root-b` unreviewed, its whole subtree unreviewed, a
reviewed cross-root `attacker` (child of `root-a`) attacking `root-b` → `root-b` gains basis,
`hidden`/`hidden-child` stay class H. M6 kills it.

I re-checked the subtree theorem under the new disjunct: the fixed point only *adds* basis,
so an empty-basis node still forbids basis anywhere below it, and `hiddenNodeIds` remains a
union of complete parent-pointer subtrees — which is why replacing `excludeHiddenSubtrees`'
transitive closure with a flat `snapshotWithoutNodes` is sound. `judgedBasisCount` counts
**distinct reviewed node ids**, so it is positive for every class-D node by construction.

### C-5 / C-6 — the declared behaviour changes. **CONFIRMED.**

C-5: the two RESIL-01 tests were rewritten, on real PG, to assert the *inverse* of what they
asserted before — `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW` is gone and the run completes
with `DERIVED-STANDING-UNREVIEWED` in the answer's marks and ≥2 class-D records. That is the
loud-death→quiet-serve conversion, declared and pinned. Minor gap at A6.

C-6: `inheritedHiddenReason` is deleted from `apps/v2-ui/lib/v3/adapter.ts` and veil state is
node-local (`const hiddenReason = ownHiddenReason`), pinned by T15. The class-H record's
`affected_node_ids` is now the real subtree via `classHSubtree()` rather than `[nodeId]`, so
class-H veiling survives the deletion — which is precisely the condition C-6 attached to it.

### C-7 — orphan-audit registration. **CONFIRMED.**

`acceptance/review-catch-up.ts` is registered in **`productionEntryPointFiles`**
(`tools/orphan-audit/src/index.ts:161-165`), not merely in the report array — the exact
mechanism error the prior lens caught. `lint` reports `source blocking: []`.

### C-8 — before-state evidence. **CONFIRMED as recorded.**

`COOLDOWN_HOLD = 2`, 70 unreviewed nodes, run `091b7663-…`, histogram in the progress log.
Read-only; no stack control. I did not re-run the queries (that would touch the standing
stack, which is forbidden to me too).

### C-9 — the pre-registered tripwire. **RUNTIME HALF ARMED, SOURCE HALF UNDER-ARMED.** → F3

`CATCH_UP_NUMBER_WOULD_MOVE` is implemented, load-bearing and tested (refuses before
`persist()`; M-probe confirms `persist` is not called). That is VROW-8's ruled mechanism and
it is writer-agnostic. The source sentinel is the problem — see F3.

### C-10 — narrowed T1. **CONFIRMED.**

Interleaving is real: `reviewPendingAuthoredNodes()` runs after root authoring, at every
expansion round boundary (`activeExpansionRound`), after expansion, and after the cross-root
exchange, with `reviewScheduledNodeIds` preventing double review. Reviewer assignment is
expressly excluded from the invariant and the rotation change is declared. See A4 for a
ledger imprecision.

### C-11 — V-row carriage. **CONFIRMED.** All eight rows carried in the handoff with the
same-house disclosure and both dissents (VROW-7, VROW-8 mechanism) named as dissents.

---

## 3. Migration proof — and the epoch-2 discrepancy

**The worker was right to override the plan, and epoch 2 was right to authorise it.**

The plan's "no migration, no backfill" line was only ever about `answer_version`, and *that*
claim survives (register version is 1, so every existing answer is a legitimate v1 and
`MAX+1 = 2` needs no backfill — the prior lens verified this at Axis 3 and I re-read it).
But `DERIVED-STANDING-UNREVIEWED` requires a **`judged_basis_count`** column that does not
exist, and migration 0021's CHECK constraints scope `call_site_key`,
`terminal_transport_outcome` and `excluded_from_served_number` to an enumerated mark list that
does not include the new member. The mark was therefore **unpersistable** without DDL.
The worker's alternatives — encoding the count in `reason` text or repurposing another column —
would have broken the typed-record law that DR-184-A(3) rests on. The `CODEX BLOCKED` handback
at 10:10 is exactly the behaviour the protocol wants, and it stopped before writing product code.

**Numbering.** `0025` is correct. This main tree already contains
`migrations/0024_evaluator_domain_seed.sql` (the parallel evaluator mission, landed at
`f065e7c`), so 0024 was taken. Epoch 2's instruction — take the main tree's next number and
note the cross-mission collision — was followed, and the collision is flagged in the handoff
for V's merge attention. Correct call; **V must still order both during reconciliation.**

**Proofs run on real embedded PostgreSQL:**

| Property | Result |
|---|---|
| Replay-safe (apply twice) | ✅ no error; exactly **1** `judged_basis` constraint; column present (M14) |
| Constraint law present | ✅ M11 (removing it) turns `T33` red |
| Valid class-D record | ✅ inserts |
| Class D **without** `judged_basis_count` | ✅ **refused** by `condition_mark_judged_basis_count_check` |
| Non-D **with** `judged_basis_count` | ✅ **refused** (same constraint, second leg) |
| Prior-mark semantics preserved | ✅ `HIDDEN-LOW-SCORE` keeps `excluded_from_served_number = false`; 0021's other constraints re-added verbatim plus the new member |
| Mark-without-record | ✅ `CONDITION_MARK_RECORD_REQUIRED` — the member is in `REQUIRED_CONDITION_MARK_RECORDS` |
| Record-without-mark | ✅ `CONDITION_MARK_RECORD_WITHOUT_MARK` |

Pattern is the house's own `DROP CONSTRAINT IF EXISTS` + replacement. Clean.

---

## 4. DR-186 values, verbatim

| # | Ruled value | Delivered? |
|---|---|---|
| (1) | **T-KEEP** — derived-standing node keeps its own tau in the number | ✅ class-D `baseStrength` survives projection (T10/T14 pins `0.6`); M6 kills it |
| (2) | Mark `DERIVED-STANDING-UNREVIEWED` | ✅ 27 → 28, closed switches in both label tables, `s14-ui` count moved |
| (3) | Catch-up uses the **PINNED** panel | ✅ CLI resolves `run.discoveredPanel` from `readFrozenHead`; probes before spend |
| (4) | Catch-up spends inside the **PINNED** ceiling | ✅ proven on real PG — `RUN_COST_ENVELOPE_EXHAUSTED` still fires (my leg 3) |
| (5) | Census fourth term, **sums to truth** | ❌ **REFUTED** → **F2** |
| (6) | v2 **references** v1 conformance | ✅ implemented (`priorAnswer?.composed_text_id`/`conformance_record_id`); weakly tested (A3) |
| (7) | Typed refusal **+ sentinel** | refusal ✅ / sentinel ❌ → **F3** |
| (8) | **ZERO in-run review holds** | ✅ the `REVIEW` branch returns before `countCooldownHolds` — T3 proves the counter is never even consulted and no hold event is emitted; M3 kills it |
| (9) | Fleet scope disclosed | ✅ |

---

## 5. Laws

- **DR-115 (the catch-up fabricates nothing).** ✅ `prepareVersion` recomputes propagation
  from recorded judgements; every strength cites its own node's `reducedJudgementRef`,
  `sourceRef` and `wayOfKnowing` via `readJudgementLineage`, and an unmapped node is a loud
  `STRENGTH_LINEAGE_UNRESOLVED`. No number is invented; `CATCH_UP_NUMBER_WOULD_MOVE` refuses
  drift before any write.
- **DR-165(3) (the serves-on-arguments'-authority distinction rides the mark).** ✅ carried
  three ways: the typed member itself, the positive `judged_basis_count` (DDL-enforced), and
  reason text that names the distinction in V's own terms — *"it serves on the authority of
  its judged arguments, not on its own unreviewed assertion."* Judgement is completed, never
  waived: unreachable reviewers yield `stillUnreviewed`, not a lowered bar.
- **DR-179.** ✅ `grep -Ei 'apikey|api_key|authorization|bearer|secret|token'` over
  `acceptance/review-catch-up.ts` and `apps/runner/src/index.ts` returns nothing but
  `tokenCeiling`. The CLI takes explicit `--relay providerRef=baseUrl` mappings and
  `DATABASE_URL`.
- **N-generic.** ✅ `selectDifferentMakerReviewer` is unchanged and names no house, maker or
  panel size; the catch-up reuses it.
- **Append-only / no re-parenting.** ✅ v1 rows proven byte-identical after v2 on real PG;
  `snapshotWithoutNodes` removes, never re-parents; T9/T11/T12 assert the original graph is
  intact.

---

## 6. Findings

### BLOCKING

**F1 — C-2's binding test obligation is unmet, and the shipped suite cannot detect the
blocker's return.**

C-2 is explicit: *"Pin it with a test that a catch-up call at a site with 3 recorded failed
attempts **reaches the provider**."* The shipped test does not do this. It asserts

```ts
expect(reviewer.review).toHaveBeenCalledWith(expect.objectContaining({
  callSiteKey: reviewCatchUpCallSiteKey("catch:1", "node:1"), …
```

— computing the expected key with **the same function under test**, against a `vi.fn()`
reviewer that never reaches `createPostgresProviderGateway`, `ledger.countModelAttempts`, or
`remainingProviderAttempts`. It is a tautology.

Proven (M1): rewriting `reviewCatchUpCallSiteKey` to return the exhausted in-run key
`JUDGE:review:${nodeId}` — i.e. *reinstating the exact blocker the whole condition exists to
kill* — leaves **all 87 files / 628 tests GREEN**. My real-PG probe fails immediately with
`CALL_BUDGET_EXHAUSTED`.

The implementation is right; I proved that myself. What is missing is the guard C-2 named.
On this ticket, C-2 is *the* blocker, and "until this is answered, §11.2's live
demonstration must not be scheduled" — the live ceremony is the orchestrator's very next
step. Shipping the fix with no regression test on the mechanism that would kill that ceremony
is not acceptable.

*Remedy (small; I wrote and ran it).* An integration test on real embedded PG that seeds 3
`MODEL_CALL` rows at `JUDGE:review:${nodeId}` for `(runId, workItemId, contractHash)`, then
asserts (a) the in-run key throws `CALL_BUDGET_EXHAUSTED` with 0 provider calls, and (b) a
`reviewCatchUpCallSiteKey(...)` call reaches the provider double. Add a third leg pinning
`RUN_COST_ENVELOPE_EXHAUSTED` so the pinned-ceiling half of VROW-6 is also guarded.

---

**F2 — DR-186(5) "the census sums to truth" is violated whenever a DR-176 low-score node
exists. The four terms double-count.**

`canvasCensus` (`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:747-760`) computes

- `judged` = nodes with `review !== null`
- `setAside` = union of `affected_node_ids` over **every** record whose mark
  `startsWith("HIDDEN-")` — which includes **`HIDDEN-LOW-SCORE`**

A DR-176 low-score node is hidden *for its score*, not for want of judgement: it **keeps its
own review** and it is computed from `propagation.strengths` (`apps/runner/src/index.ts:1947`)
**after** class-H removal, so it is always a reviewed-or-class-D surviving node. It is
therefore counted **twice** — once in `judged`, once in `setAside`.

Measured on a real run (the RESIL-01 tau-0.30 fixture, real embedded PG):

```
[OPUS CENSUS] {"claims":8,"judged":8,"derivedStanding":0,"setAside":8,
               "sumOfTerms":16,"overlapJudgedAndSetAside":8}
AssertionError: expected 16 to be 8
```

The header would read *"8 claims across N levels · 8 judged · 0 standing on their arguments ·
8 set aside."* Eight claims; the terms add to sixteen. VROW-7's entire argument was arithmetic
closure — *"a census that does not sum to the whole is the same species of lie V caught, just
quieter"* — and DR-186(5) ratified it in those words.

The census **does** close today on V's standing run, because that run has zero low-score nodes
(DR-184's own evidence). So this is not currently visible on V's canvas. But DR-176 is active
law with a configured threshold, and the census is ruled to sum to truth, not to sum to truth
on one fixture.

**There is no test of the census arithmetic at all.** The shipped render test hand-feeds
`meta={{claims:3, judged:1, derivedStanding:1, setAside:1}}` and asserts the rendered string;
it never exercises `canvasCensus`. The handoff's T28 claim — *"toggle does not change totals.
Kills visible-subset counting"* — is unbacked.

*Remedy.* Either (a) `setAside` counts only nodes that are neither judged nor derived-standing
(i.e. class H alone, with low-score hiding reported separately — it is presentation-only by
DR-176 and arguably not "set aside" at all), or (b) `judged` excludes set-aside nodes. **Which
one is V's call**, because it changes what the header means; the arithmetic law is not.
Whichever is chosen, pin it with a test that asserts closure on a fixture containing a
low-score node.

---

**F3 — DR-186(7)'s sentinel does not arm against the scenario it was written for.**

C-9 asked for *"a source-level assertion that no shipped writer emits `magnitudeStatus:
"MEASURED"`"*, citing `tests/unit/dr181-ceiling.test.ts:60-75` — which walks **`apps/`,
`packages/`, `acceptance/` recursively**. What shipped scans **two hard-coded files**:

```ts
const shipped = (await Promise.all([
  "apps/runner/src/index.ts",
  "packages/graph/src/index.ts"
].map((file) => readFile(file, "utf8")))).join("\n");
```

Proven (M13): a new shipped file — `packages/propagation/src/opus-future-evaluator.ts`
returning `{ strength: 0.42, magnitudeStatus: "MEASURED" }` — leaves the sentinel **GREEN**.
That new-file case is *precisely* the hazard C-9 named: *"the day an evaluator ships and starts
emitting `MEASURED`."* A tripwire that covers only today's two known writers, and not tomorrow's
unknown one, is the decorative pre-registration C-9 exists to replace.

I found the reason for the narrowing and it is legitimate: a naive recursive scan matches the
**type annotation** at `packages/serve/src/index.ts:136`
(`readonly magnitudeStatus: "MEASURED" | "UNKNOWN";`), which is a validator, not a writer. So
the worker traded correctness for a passing test rather than sharpening the regex.

**Why this is blocking and not advisory.** DR-186(7) names *both* guards — "typed refusal
**+** sentinel". The refusal half is real and writer-agnostic, and it does protect V's number,
which is why I weighed this carefully before ruling. But the sentinel is the half that is
supposed to catch the change *before* anyone runs a catch-up, and as shipped it cannot. The
fix is a few lines.

*Remedy.* Restore the recursive `apps/` + `packages/` + `acceptance/` walk and exclude type
positions — e.g. skip lines matching `readonly\s+magnitudeStatus\s*:` , or require the literal
to sit in value position, or carry an explicit named allowlist of the known declaration sites
so a *new* declaration still trips the wire.

### Advisory

- **A1 — a declared-type lie at the persistence boundary.** `HoldProgressEvent.state`
  (`apps/runner/src/index.ts:150`) is now a 5-member union, but
  `RunLifecycleEventValue.state` (`packages/db/src/index.ts:295`) is still the 3-member
  original. Four `as "EXPANSION_HALTED"` casts launder the difference
  (`acceptance/main.ts:242`, `acceptance/review-catch-up.ts:115`, and two in
  `tests/integration/database.test.ts`). I verified this is **not** a runtime break —
  `core.run_progress_event.value_json` has no CHECK on `state`, and the API passes the payload
  through as an opaque record without enum validation, so `REVIEW_HALTED` really does reach
  the surface and the darkness fix is genuine. But the casts hide the widening from the type
  system in a codebase whose disclosure discipline rests on typed vocabularies. Fix: widen
  `RunLifecycleEventValue.state` and delete all four casts.
- **A2 — the silent-darkness fix has no end-to-end proof.** T4 asserts the runner *calls*
  `hold.record` with the right state; nothing asserts a `REVIEW_HALTED` or
  `MAKER_POSITION_HALTED` row actually lands in `core.run_progress_event` and appears in the
  API's event projection. This is V-visible behaviour (57 % of a debate died silently) and
  deserves an integration assertion.
- **A3 — VROW-5 "reference, not copy" is implemented but not asserted.** No test compares
  v2's `composed_text_id` / `conformance_record_id` to v1's. M15 (making v2 copy) is caught
  only *incidentally*, by a `conformance_record_coverage_mode_check` DDL constraint. The
  handoff's T19 — *"v2 references v1 composed/conformance ids"* — should be one `toBe(...)`
  pair.
- **A4 — mutation-ledger imprecision on T2.** The handoff credits T2 with killing
  "cap-coupled loss of final attempt". It cannot: the `REVIEW` branch returns *before* the
  cap check, so T2 never observes cap coupling. M2 proves the killer is **T4**
  (MAKER_POSITION / EXPANSION). The mutation is covered — the attribution is wrong.
- **A5 — the handoff conflates the two budgets on C-2.** *"The test starts with three
  recorded run attempts"* describes `countRunModelAttempts` (the run-total, used only to
  report `attemptsSpent`), not `ledger.countModelAttempts(runId, workItemId, contractHash,
  callSiteKey)` — which is the counter that throws `CALL_BUDGET_EXHAUSTED`. This is exactly
  the two-budget conflation VROW-6 warned against, and it is how F1 went unnoticed.
- **A6 — C-5's prose leg is unpinned.** No test asserts that the *served root's* statement
  becomes the answer's only fact while un-cross-reviewed. The substance (loud death → served
  answer, with the mark at answer scope) is pinned by the second C-5 test, where both roots'
  reviews die and the run must serve a class-D root.
- **A7 — class-D disclosure depends on a `hiddenReviewRecords` entry.** A class-D node
  without one would serve with no `DERIVED-STANDING-UNREVIEWED` record. I could not reach it:
  in-run, every authored node is review-attempted before projection; in the catch-up,
  `transportFields()` refuses loudly with `CATCH_UP_DISCLOSURE_MISMATCH`. Worth an explicit
  invariant assertion (`classDNodeIds ⊆ hiddenReviewRecords`) so it stays unreachable.
- **A8 — `AGENTS.md` names gates that do not exist.** `tests/render-templates.sh` and
  `tests/lint-templates.sh` are absent from the checkout. The worker disclosed this honestly
  as *unavailable, not green*, which is the right call. Not this ticket's defect — the
  orchestrator should repair `AGENTS.md` or add the scripts.

---

## 7. What survived me

The ceiling arithmetic and its panel-1 consequence, including the shipped-test move, which is
the place a worker could most easily have cheated and did not. The C-2 fix itself, which I
replayed on real PostgreSQL rather than reading — both budgets behave exactly as VROW-6
requires. The incoming-arrow closure, tested with the prior lens's own counterexample and with
the subtree theorem intact. The three-insert threading, whose reversion I confirmed corrupts
v1 on real PG. The migration, the epoch-2 handback that produced it, and the numbering call.
Zero in-run review holds, where the counter is provably never even consulted. DR-115, DR-165(3),
DR-179 and N-generic. And the honest reporting of the missing `AGENTS.md` gates and the
cross-mission migration collision, neither of which the worker had to volunteer.

Three fixes stand between this and approval, and none of them touches a seam, an edge, a law
or a V-row. F1 and F3 are test-side; F2 is a definitional choice for V plus the test that
should have caught it.

---

**VERDICT: BLOCKING**
