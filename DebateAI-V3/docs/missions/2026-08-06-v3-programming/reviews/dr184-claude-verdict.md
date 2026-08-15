# DR-184 / DR-184-A — AUTHORIZING LENS VERDICT (Claude, single-use under DR-185)

**Seat:** independent Opus 5 authorizing lens, fired under **DR-185** (V's single-use
exception: Grok's seat is unfunded at 402). **Brief: refute-first.** No shared context
with the architect; every claim below was re-derived from the live tree, and every
number was recomputed rather than read.

**DISCLOSED LIMITATION, for V's card:** the architect and this lens are the **same
house**. DR-185 records this and DR-175 named the shape it risks (echo chamber).
Mitigation actually applied: a context-free session, an explicitly adversarial brief,
and a rule I held myself to — *no plan claim was accepted because it sounded right; each
was opened at the cited line, and where a citation was right I say so, and where it was
wrong I say that too.* Where my position **agrees** with the architect's on a V-row, that
agreement is marked **[SAME-HOUSE AGREEMENT]** so V can discount it. Where it **differs**,
it is marked **[DISSENT]**. Two of eight V-rows are dissents.

**Read:** ledger rows DR-115, DR-165(3), DR-174-A, DR-176, DR-179, DR-181, DR-182,
**DR-184**, **DR-184-A**, **DR-185** verbatim; `reviews/dr184-architecture-plan.md` in
full (893 lines); and the code below. **This file is this seat's only write.** No runs,
no stack control, no product code.

---

## 0. Verdict summary

The plan's three headline **findings** — every edge magnitude is `UNKNOWN`,
`answer_version` has never been a version, and non-EXPANSION halts are silent — are
**all independently CONFIRMED at the line**. That is unusual and it is the strongest
thing in the document.

Against that: **one arithmetic error**, **one blocking mechanism the plan did not see**,
**one incomplete closure that under-serves the very ruling it mechanizes**, and **three
undeclared behaviour changes**. All are local and correctable; none invalidates a seam,
an edge, a law or a V-row. The plan is therefore **AUTHORIZED WITH BINDING CONDITIONS**,
C-1 … C-11 below, which are part of the authorization and not advice.

| Axis | Result |
|---|---|
| 1 — the corrected mechanism (final retry lost at the cap) | **CONFIRMED** — plan is right, and right about *why* |
| 2 — the tripwire re-derivation | **REFUTED (number)** / CONFIRMED (formula) — 1572 is wrong; **1584** |
| 3 — `answer_version` finding | **CONFIRMED (4/4 legs)**; the proposed repair is **incomplete** (3 insert sites, not 1) |
| 4 — `magnitudeStatus` finding | **CONFIRMED in full** |
| 5 — `hasJudgedBasis` closure | **theorem HOLDS**; **counterexample found** — the closure under-serves DR-184-A |
| 6 — silent-darkness bug | **CONFIRMED** |
| 7 — law survival | survives, with **three undeclared changes** that must be declared |
| 8 — test obligations (F1) | mostly falsifiable; **the pre-registered T18/T13 tripwire cannot fire as designed** |
| — | **NEW BLOCKER, outside the brief's axes: `CALL_BUDGET_EXHAUSTED` kills the catch-up at its first call** |

---

## AXIS 1 — the corrected mechanism. **CONFIRMED.**

**Claim:** review sites already route through `cooldownAttempt` with `failureScope: "REVIEW"`;
the run-wide `max_cooldown_holds_per_run = 2` was spent by authoring; therefore review
exhaustions got no hold **and no final retry** — the cap skips the extra attempt.

**Verified at the line:**

- `apps/runner/src/index.ts:1362-1366` — the review site does route through
  `cooldownAttempt({ callSiteKey, parentNodeId, plannedLegCount: 1, failureScope: "REVIEW", … })`.
  DR-184's "review sites received NO cooldown courtesy" is indeed operationally true and
  mechanically imprecise. Plan correct.
- `apps/runner/src/index.ts:220-221` —
  `const holds = await input.hold.countCooldownHolds(input.runId); if (holds >= input.policy.maxCooldownHoldsPerRun) return halted(error, error.attempts);`
  This is the **first statement of the catch block** (`catch` opens at `:218`). The wait is
  at `:235`; the final retry is at `:248-252`, **inside the path the cap returns before**.
  **The final retry is genuinely lost at the cap.** The coupling the plan describes is real
  and the plan did not misread it.
- `apps/runner/src/index.ts:776-830` — `cooldownAttempt` passes `baseMaxAttempts:
  this.settings.judgeBound.maxAttempts` (`:824`) and one shared `policy`, i.e. **one pool**.
- `packages/db/src/index.ts:315-324` — `countCooldownHolds` counts
  `core.run_progress_event` rows with `kind='node.retrying'` and
  `value_json->>'state'='COOLDOWN_HOLD'`, **per run, with no phase term**. The pool is
  run-wide and unrepleneshable exactly as claimed.
- `acceptance/seed-register.ts:165-167` — `JUDGE.maxAttempts = 3`. 70 × 3 = 210 failed
  calls; 52 + 210 = 262. **The plan's §1.1 arithmetic is exact.**

**Where the plan holds V to a higher evidentiary standard than itself.** §1.2 asserts as
fact that "the run's two holds were long spent" and that "**Every one** of the 70 review
exhaustions therefore took the `halted(...)` path". That is an inference, not a reading —
the plan has no more evidence for it than DR-184 has for "relays exhausted by authoring",
which §1.4 correctly refuses to accept without the free query. **The same free query
settles §1.2**, and it is one line:

```sql
SELECT count(*) FROM core.run_progress_event
WHERE run_id = '091b7663-…' AND kind = 'node.retrying'
  AND value_json->>'state' = 'COOLDOWN_HOLD';
```

The structural claim survives either way — the cap is 2, so **at most 2 of 70** sites could
ever have received a hold and **≥68 took the halted path regardless** — but "every one of
the 70" is unproven. → **C-8.**

---

## AXIS 2 — the tripwire re-derivation. **REFUTED on the number.**

**Formula shape: CONFIRMED.** `packages/register/src/index.ts:182` today reads
`const finalRetryTotal = input.maxCooldownHoldsPerRun * input.finalRetryAttempts;` — a flat
term, correct *only* because the cap gates the retry. Making the final retry per-site makes
`(authored + reviews) × (judgeMaxAttempts + finalRetryAttempts) + fixedSites × organMaxAttempts`
the right expression. The plan's general formula is right.

**Its worked instance is wrong.** Recomputed from the exported facts, not from the plan:

| Input | Value | Source |
|---|---|---|
| `branchingFactor` | 2 | `packages/register/src/index.ts:17`; pinned `tests/unit/dr181-ceiling.test.ts:43` |
| `compositionSegmentCap` | 2 | `packages/register/src/index.ts:18` |
| `fixedOrgansPerComposition` | `1 + 2 + 1 = 4` | `packages/register/src/index.ts:19`; pinned `dr181-ceiling.test.ts:45` |
| `maxRecompose` | 2 | `apps/runner/src/index.ts:83`; pinned `dr181-ceiling.test.ts:46` |
| `judgeMaxAttempts` / `organMaxAttempts` | 3 / 3 | `acceptance/seed-register.ts:165-167`; `acceptance/runtime-policy.ts:136-137` |
| `finalRetryAttempts` / `maxCooldownHoldsPerRun` | 1 / 2 | `acceptance/runtime-policy.ts:110-111` |

At panel 3 / depth 5: `nodesPerRoot = (2⁶−1)/(2−1) = 63`;
`authored = 3×63 + 3×2 = 195`; `reviews = 195`; **`fixedSites = maxRecompose × fixedOrgans = 2 × 4 = 8`**.

- **Today:** `390×3 + 8×3 + 2×1 = 1170 + 24 + 2 = ` **1196** ✅ the plan's old number is right.
- **Per-site:** `390×4 + 8×3 = 1560 + 24 = ` **1584** ❌ the plan says **1572**.

The plan substituted **12** for the fixed-organ term where the value is **24** — it dropped
`maxRecompose = 2`, on a line (`:181`) it quotes in the same block. It is internally
self-refuting: the delta from the flat term to the per-site term is exactly
`390×1 − 2×1 = 388`, and `1196 + 388 = 1584`. **A document whose organising claim is "every
number is a derivation, not an invention" published an invented number.**

**A second consequence the plan does not name.** For **panel 1** the per-site formula
produces a **lower** ceiling than today: `1×4 + 24 = 28` versus `1×3 + 24 + 2 = 29`. It is
still ≥ the true worst case — but with **zero slack**. And it **breaks the shipped test**:
`tests/unit/dr181-ceiling.test.ts:20-23,36` enumerates
`independentWorstCase = (authored+reviews)×3 + fixedSites×3 + 2` and asserts
`max_model_attempts >= independentWorstCase`; at panel 1 that becomes `28 >= 29` → **FAIL**.
The independent enumeration must move to the per-site model in the same commit. The plan's
T5 would have caught the 1572 error; nothing in the plan catches this one. → **C-1.**

Full recomputed table (old → new), panel 1..4 × depth 1..5, for the ticket to pin:

| M\d | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 1 | 29→28 | 29→28 | 29→28 | 29→28 | 29→28 |
| 2 | 74→88 | 122→152 | 218→280 | 410→536 | 794→1048 |
| 3 | 116→144 | 188→240 | 332→432 | 620→816 | **1196→1584** |
| 4 | 170→216 | 266→344 | 458→600 | 842→1112 | 1610→2136 |

`formula_version` bump (`packages/register/src/index.ts:194`, today `"DR-181-v1"`) —
**required and correctly identified.**

---

## AXIS 3 — the `answer_version` finding. **CONFIRMED, 4/4 legs. Repair incomplete.**

| Leg | Verified |
|---|---|
| PK `(answer_id, answer_version)`, `answer_version integer NOT NULL CHECK (> 0)` | `migrations/0000_s00.sql:257-272` ✅ |
| `UPDATE`/`DELETE` revoked on `serve.answer` | `migrations/0000_s00.sql:305-311` (`REVOKE UPDATE, DELETE ON serve.fact_bundle, serve.composed_text, serve.conformance_record, serve.served_number, serve.served_number_event, serve.answer FROM PUBLIC, debateai_runtime`) ✅ |
| reads return newest / can pin a version | `packages/serve/src/index.ts:1166-1167` — `($3::integer IS NULL OR answer.answer_version = $3) ORDER BY answer.answer_version DESC LIMIT 1` ✅ |
| the writer mints a fresh `answer_id` and feeds `answer_version := factBundleVersion` | `packages/serve/src/index.ts:997-1005` — the INSERT column list **omits `answer_id`** (DB default) and binds `input.factBundleVersion` first; `acceptance/main.ts:260` → `ACCEPTANCE_REGISTER_VERSION`; `acceptance/seed-register.ts:6` → **`1`** ✅ |

The finding is real. Serve history was built at the read end and never reached at the write
end. (Harmless accident worth recording: the register version is **1**, so every existing
answer is a legitimate `v1` and `MAX+1 = 2` works with no backfill — the plan's "no
migration, no backfill" claim survives.)

**Where the repair as written is wrong.** §5.5 says the FK
`(answer_id, answer_version) → serve.answer` "is satisfied because the answer row is
inserted first in the same transaction". It would **not** be. `input.factBundleVersion` is
bound in **three** inserts, not one:

- `packages/serve/src/index.ts:997-1005` — `serve.answer`
- `packages/serve/src/index.ts:1043-1052` — `serve.condition_mark` (binds `input.factBundleVersion` as `answer_version`)
- `packages/serve/src/index.ts:1076-1086` — `serve.served_number` (same)

Change only the answer insert and v2's marks/number are written at `(v1-answer_id, 1)` —
a **duplicate-key collision with v1's own marks**, not merely an FK miss. The computed
version must be threaded to all three. Small fix; the plan reasoned about the FK and got
the reasoning wrong, which is exactly the class of error this seat exists to catch. → **C-3.**

---

## AXIS 4 — the `magnitudeStatus` finding. **CONFIRMED IN FULL.**

- `packages/published-arithmetic/src/index.ts:5-9` — σ is verbatim as quoted; and
  `agg` (`:1-3`) returns `1 − 1 = 0` for the empty list, so **σ(τ,0,0) = τ − τ·0 = τ**. ✅
- `apps/runner/src/index.ts:1152-1166` — every authored edge is written
  `strength: null, magnitudeStatus: "UNKNOWN"`. `packages/graph/src/index.ts:393` — the
  placeholder edge, same. ✅
- **Repository-wide search for a `MEASURED` writer**: across `apps/`, `packages/`,
  `acceptance/`, `web/`, the only occurrences are the **vocabulary**
  (`packages/kernel/src/index.ts:175`), a **validator** (`packages/serve/src/index.ts:136,143-144`),
  **read projections** (`packages/graph/src/index.ts:620`, `packages/serve/src/index.ts:1676`)
  and **test fixtures**. **No engine writer emits `MEASURED`.** ✅
- `packages/propagation/src/index.ts:397-399` and `:435-438` — an arrow with
  `strength === null || magnitudeStatus === "UNKNOWN"` contributes to neither `support`
  nor `attack`. ✅

**Therefore every served node strength in the system today is identically its own judge's τ,
and T-ZERO would serve 0.0 for every derived-standing node** (σ(0,0,0) = 0). The plan's
central VROW-2 argument is sound and its DR-115 reading is correct. This is the plan's best
work and I could not break it.

---

## AXIS 5 — the closure. **Theorem HOLDS. Closure INCOMPLETE — counterexample found.**

**The theorem is true, as stated, over the parent-pointer relation.** If
`¬hasJudgedBasis(n)` then no parent-pointer descendant has one: a descendant with a basis
would confer it up the chain by the second disjunct. The class-H set is a union of complete
parent-pointer subtrees, and that *is* the relation `excludeHiddenSubtrees`
(`apps/runner/src/index.ts:260-296`) walks (`node.parentNodeId`). Subtree exclusion does fall
out as a consequence. Re-parenting stays forbidden and `snapshotWithoutNode`'s re-parenting
(`packages/propagation/src/index.ts:506-512`) is correctly quarantined.

**Class N is not a counterexample:** `UNAUTHORED-BRANCH-HALTED` mints **no node**
(`apps/runner/src/index.ts:1614-1629` attaches the mark to `record.parentNodeId`), so it
never enters `children(n)`. And the UI's veil map ignores it
(`apps/v2-ui/lib/v3/adapter.ts:116-118` collects only `HIDDEN-UNJUDGEABLE` /
`HIDDEN-LOW-SCORE`). Plan correct.

**But here is the counterexample.** `children(n)` is not where all of `n`'s judged arguments
live. `buildCrossRootExchangePlan` (`apps/runner/src/index.ts:1313-1342`) authors, for every
ordered pair of roots, a response node whose **parent is the AUTHOR's root** (`:1329`) and
which carries an **attack edge at the TARGET root** (`:1340`). So:

> Root **B** is unreviewed and its own subtree's reviews all failed. A cross-root response
> **C** — child of root **A**, attacking **B** — **was** reviewed.
> Under the plan's closure, `hasJudgedBasis(B) = false` → **B is class H → B and its entire
> subtree vanish**, while a judged argument *about B* is served on the same canvas.

DR-184-A's words are *"it's through virtue of arguments that a hypothesis gains **or loses**
power"* — a judged **attacker** is a judged argument. The plan's closure counts only
descendants and therefore **under-serves the ruling it exists to mechanize**, in the one
shape where the loss is largest: **roots**, whose subtrees are ~63 nodes each at depth 5.
This is the 5-node collapse in miniature, surviving the fix.

**The repair is small and preserves the theorem.** Extend the second disjunct to incoming
arrows:

```
hasJudgedBasis(n) ⟺ reviewed(n)
                  ∨ ∃ c ∈ children(n)      : hasJudgedBasis(c)
                  ∨ ∃ a ∈ arrowsTargeting(n): hasJudgedBasis(source(a))
```

The subtree theorem is **unaffected** — the new disjunct only *adds* basis, so
`¬hasJudgedBasis(n)` still forbids a basis anywhere below `n`, and class H remains a union
of complete parent-pointer subtrees. `EDGE`-targeted arrows resolve through their target
arrow's target. → **C-4.** T8/T9 must gain the cross-root case; a generated-tree property
test over a pure forest **cannot** find this, which is why T9 as written would have passed
a wrong implementation.

**One precision note:** T9's phrasing "*asserted as a property … not imposed by a filter*"
is not testable — a test observes the property, never its provenance. Make it a property
test **plus** a source assertion that no descendant-filter runs after the classification.

---

## AXIS 6 — the silent-darkness bug. **CONFIRMED.**

`apps/runner/src/index.ts:192-215`: `halted()` records a `ledger.could_not_do` progress
event **inside `if (input.failureScope === "EXPANSION")`** (`:200-213`). `REVIEW` and
`MAKER_POSITION` halts record nothing. The same asymmetry repeats in the preflight path at
`:803-816`. 57 % of a debate died with no public event.

The plan's three "no change needed" claims all check out:

- `HoldProgressEvent.state` (`apps/runner/src/index.ts:149`) is a **runner-local** union —
  not `kernel`, not `contract`. ✅
- `core.run_progress_event.kind` already permits `ledger.could_not_do` —
  `migrations/0021_dr174_cooldown_prune.sql:2-11`. **No migration.** ✅
- the API already projects it: `ledger.could_not_do` is a member of `EVENT_CONSUMERS`
  (`packages/contract/src/index.ts:46-49`), so `EventTypeSchema.safeParse(row.kind)`
  succeeds at `apps/api/src/index.ts:541-548` and the payload passes through at `:558`. ✅

Cheapest true fix in the plan.

---

## AXIS 7 — law survival. Survives; **three undeclared behaviour changes.**

**Holds.**

- **DR-115** — §5.0 + the §5.7 `CATCH_UP_WOULD_DOWNGRADE` refusal + T13/T14 keep the
  catch-up additive. No number is invented anywhere in §4. ✅
- **DR-179** — the job's composition root is `acceptance/`, where the relays already live;
  `grep -n "apiKey|API_KEY|Authorization" acceptance/claude-relay.ts acceptance/grok-relay.ts`
  returns **nothing**; discovery reuse cites real symbols
  (`acceptance/discovery.ts:45, 78, 110, 131, 161` — all five exist at exactly those lines). ✅
- **N-generic** — `selectDifferentMakerReviewer` (`apps/runner/src/index.ts:114-128`) names
  no house, no maker, no panel size. ✅
- **Resumability** — `migrations/0019_xrev01_node_review.sql:11` `UNIQUE (node_id)`, plus a
  `reject_mutation` trigger and INSERT-only grant (`:41-45`). Double-recording is impossible
  at the DDL. ✅
- **DR-184-A(3) carried on the mark** — the distinction rides a **typed vocabulary member**
  plus `judged_basis_count`, not free text alone. The CHECK amendments the plan lists are
  exactly the ones `migrations/0021_…:22-60` requires (`call_site_key`,
  `terminal_transport_outcome`, `excluded_from_served_number` are all mark-scoped). ✅

**Undeclared change 1 — the served root may now itself be unreviewed.** Today, if the
served root's review fails it is class H, `excludeHiddenSubtrees` drops it, and
`servableMakerPositions` (`apps/runner/src/index.ts:1451-1458`) empties →
`NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW` **and the run dies loudly**. Under the plan that
root becomes class D and **serves** — and its statement is the answer's only fact
(`facts: [servedRoot.statement]`, `:1526`), i.e. **the prose V reads is composed from an
opinion no other house ever checked.** DR-184-A(1) authorizes exactly this and DR-165(3)
(`ledger:1070-1091`: *"no opinion on this debate goes unjudged"* … *"the run STOPS LOUDLY
rather than serving unjudged opinions"*) is reconciled by DR-184-A(3), not waived. But the
plan mentions it only obliquely, at §12(5), as a typed stop becoming "less reachable". **V
should be told plainly**, because it converts a loud death into a quiet serve. → **C-5.**

**Undeclared change 2 — deleting the UI inheritance thread also un-veils low-score
subtrees.** The plan deletes `inheritedHiddenReason`
(`apps/v2-ui/lib/v3/adapter.ts:121-127, 139-143, 164-178`) on the argument that every hidden
node will carry its own engine record. True for class H **only if** its record's
`affected_node_ids` becomes the whole subtree (the plan does propose this at §4.3/§7.2 —
today it is `[nodeId]`, `apps/runner/src/index.ts:1589`). It is **not** true for
`HIDDEN-LOW-SCORE`, whose record is also `[nodeId]` (`:1605`) and which the engine never
excludes from the graph at all (`:1448-1450` computes it *after* `evaluate`). So the moment
the thread is deleted, **descendants of a DR-176 low-score node become visible by default** —
a change to a different V ruling, arrived at as a side effect. Defensible on DR-184-A's logic
(a judged child shouldn't be veiled by a weak parent), but it must be a **declared choice**,
not a consequence. → **C-6.**

**Undeclared change 3 — `HIDDEN-UNJUDGEABLE` is described as "shipped, unchanged" in the
same table that changes its `affected_node_ids` population.** Cosmetic contradiction, but
in the mark family it is the field the whole veil now rests on. Fold into C-6.

**Registration claim is wrong in its mechanism.** §5.1 and §4.2 both rest on
"`tools/orphan-audit` G2 BLOCKS an unreachable export; `:592-599` is where the new job
registers". The array at `tools/orphan-audit/src/index.ts:592-600` is the **report's**
`entryPoints` string list. Reachability is computed from
**`productionEntryPointFiles`** (`:161-165` — `apps/api/src/main.ts`,
`apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`) over source rooted at
`packages/` + `apps/` only (`:308-311`). Adding a string to the report array makes
`runReviewCatchUp` **no more reachable**; the walk simply never opens
`acceptance/review-catch-up.ts`. G2's never-called list *is* BLOCKING
(`docs/founding/quality-charter.md:197-199`), so the export must either be added to
`productionEntryPointFiles` (which works — the walk resolves call names against
`packages/`+`apps/` declarations) or be exempted with a named reason. → **C-7.**

---

## THE BLOCKER THE AXES DID NOT ASK FOR — the catch-up cannot make its first call

The plan's headline acceptance demonstration (§11.2: *"Run `job:review-catch-up` against
`091b7663` on the live stack … V's canvas fills up"*) **throws before it touches a relay.**

Chain, all verified:

1. `createPostgresProviderGateway` (`apps/runner/src/index.ts:1995-2026`) is what the
   acceptance composition root wires the relays through — `acceptance/main.ts:198, 211`.
2. On **every** call it computes
   `const consumed = await ledger.countModelAttempts({ runId, workItemId: request.subjectItemId, contractHash, callSiteKey })` (`:2010-2015`)
   and then `const remaining = remainingProviderAttempts(request.bound.maxAttempts, consumed); if (remaining <= 0) throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", …)` (`:2016-2019`).
3. `countModelAttempts` (`packages/ledger/src/index.ts:517-531`) counts **every** `MODEL_CALL`
   row for `(run_id, subject_item_id, contract_hash, call_site_key)` — **no outcome filter,
   no time window.** Failures count.
4. Each of the 70 dead review sites already has **3** such rows (that is DR-184's own 210).
5. The plan **reuses the same call-site key** — §5.2: *"the site key is **derivable** anyway:
   it is `JUDGE:review:${nodeId}`"* (`apps/runner/src/index.ts:1361`) — and §5.3(4) routes the
   call through `withCooldownRetry`, whose first act is `attempt(baseMaxAttempts = 3)`
   (`:217`, `:824`).

`remaining = 3 − 3 = 0` → `CALL_BUDGET_EXHAUSTED`, which is a `TypedDomainError`, **not** a
`ProviderCallFailedError`, so `withCooldownRetry` rethrows it (`:219`) and the job dies on
node 1 of 70. §5.6's "re-running 70 sites at 3 attempts each is at most 210" is
**unreachable at the same key**: the shipped per-site cumulative bound forbids it.

This is fixable in one decision — a catch-up-scoped call-site key (e.g.
`JUDGE:review:catchup:${invocation}:${nodeId}`), or a cumulative-aware bound, or a distinct
`subjectItemId` — and the choice has consequences the ticket must state (a new key makes the
attempt-per-site accounting per-invocation; §5.6's run-total argument still holds, with 746
of 1196 remaining). **It is not fixable by discovering it during the live demo**, which is
where the plan was heading. → **C-2. This is the one finding that would have carried a
refusal had it not been mechanically local.**

---

## AXIS 8 — F1 sweep of the test obligations

Falsifiable as stated: **T2, T3, T4, T5, T6, T8, T10, T11, T12, T14, T15, T16, T17, T19,
T20, T21, T22, T23, T24, T25, T26, T27, T28, T29** (T5 in particular would have killed the
1572 error — the plan's own suite refutes the plan's own number).

**Not falsifiable / broken as stated:**

- **T18 and T13 — the pre-registered tripwire does not arm.** Both are qualified *"while
  every edge is `UNKNOWN`"*. In an integration test the fixture writes its own edges, so the
  day an evaluator ships and starts emitting `MEASURED`, **the fixture keeps writing
  `UNKNOWN` and both tests keep passing.** The pre-registration is decorative. A tripwire
  that actually fires must assert over the **shipped writers**, not the fixture — precedent
  exists in this repo at `tests/unit/dr181-ceiling.test.ts:60-75`, which scans `apps/`,
  `packages/`, `acceptance/` source for forbidden symbols. Arm it as: *no shipped source
  emits `magnitudeStatus: "MEASURED"`*, and pair it with a **runtime refusal** in the job
  (below, VROW-8). → **C-9.**
- **T1 contradicts §3.2.** T1 requires a healthy run's "review set byte-identical to today";
  §3.2 consequence 1 declares that interleaving **re-assigns which house reviews which node**
  (because `readLatestReviewerMaker`, `apps/runner/src/index.ts:1358`, makes each selection
  depend on the previous review). Both cannot hold. T1 must be narrowed to *coverage and
  authored set*, with reviewer assignment explicitly excluded and its change declared. → **C-10.**
- **T7** ("deterministic and replayable within a round") needs a stated oracle; as written it
  is unfalsifiable.
- **T30** inherits C-7's wrong mechanism.

**Missing obligations** the findings above require: a test that a catch-up call at an
already-exhausted call site **reaches the provider** (C-2); a test for cross-root judged
attackers conferring basis (C-4); a test pinning low-score subtree visibility after the
adapter change (C-6); a test that a class-D **served root** is disclosed on the answer (C-5);
a test that v2's marks and served number are written at the **computed** version (C-3).

---

## MY POSITIONS ON THE EIGHT V-ROWS

*Same-house disclosure applies to all eight. Two are dissents from the architect.*

**VROW-1 — review / catch-up hold budgets.**
**In-run: I propose `max_cooldown_holds_per_run_review = 0`, with a basis — not "none stated".**
[DISSENT from "the plan proposes none"] Reasons: (i) DR-174-A(1) is the only wall-clock bound
V has ever stated and it was stated while V watched a loading page — a second budget silently
re-opens 20 min to `(2+k)×10`; (ii) **there is no evidence a 10-minute hold recovers this
failure**: 70 sites failed 3 back-to-back attempts after ~5 h, and the plan itself concedes
a fourth attempt "rarely succeeds"; buying wall clock with unevidenced value is DR-115's
spirit inverted; (iii) §3.1(a)'s free final retry + §3.2's interleaving + §5's catch-up
deliver DR-184's capability without it. A budget of 0 is *not* a downgrade — it is the
current behaviour plus the retry the cap wrongly ate.
**Catch-up: `— none stated` is correct**; I decline to invent it. But V should be shown the
unit, which the plan does not state plainly: **each hold is 10 minutes of a job nobody is
watching**, so the honest question to V is "how long may an unattended repair run", not "how
resilient should it be".

**VROW-2 — the derived-standing τ. T-KEEP.** [SAME-HOUSE AGREEMENT — discount accordingly,
but the decisive reason below is mine, not the plan's.] T-ZERO is verifiably unlawful today
(Axis 4: σ(0,0,0)=0 serves a fabricated 0.0). And **T-NULL is not merely "strict" — it
defeats DR-184's own purpose**, which the plan does not say: a node with `baseStrength = null`
returns `null` from `computeGraph` (`packages/propagation/src/index.ts:363`) and is therefore
**absent from `propagation.strengths`**; at `apps/runner/src/index.ts:1451-1452`
`servableMakerPositions` filters on `propagatedNodeIds`, so **a class-D root under T-NULL is
unservable and the run still throws `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`** — the exact
death DR-184 was ruled to end. T-KEEP invents nothing, shows a real judge's number, and
becomes DR-184-A's derived score unchanged the day magnitudes are measured.

**VROW-3 — the mark name. Confirm `DERIVED-STANDING-UNREVIEWED`.** [SAME-HOUSE AGREEMENT]
The member names both halves — *derived standing* and *unreviewed* — which is precisely the
DR-184-A(3) distinction. Overloading `HIDDEN-UNJUDGEABLE` would make one label mean both
hidden and shown (DR-161's rejected trade). Verified cheap: `CONDITION_MARKS` is **27** today
(`packages/kernel/src/index.ts:69-107`, counted member by member), both label switches are
exhaustive with no `default` (`apps/v2-ui/lib/v3/labels.ts:44-46`,
`web/lib/v3Presentation.ts:142-144`) so omission **is** a compile error, and
`tests/unit/s14-ui.test.ts:116` is the single count to move.

**VROW-4 — catch-up reviewer: PINNED panel.** [SAME-HOUSE AGREEMENT, with a reason the plan
does not give] Beyond DR-181(1)'s identity argument: pinned is also the **only shipped path** —
`configuredMakers` is resolved from `run.discoveredPanel` at
`apps/runner/src/index.ts:840-888`, and the DDL trigger
(`migrations/0019_…:14-39`) enforces *different maker*, **not panel membership**, so the
database will not catch a drift to today's panel. Discipline must live in code, and the
smallest code is the existing resolution. If the pinned reviewing house is permanently gone,
reporting `stillUnreviewed` forever **is** DR-165(3) honoured — completing judgement, never
waiving it.

**VROW-5 — re-citing v1's conformance: a REFERENCE, and make it a literal one.**
[SAME-HOUSE AGREEMENT on the answer, **DISSENT on the mechanism**] Conformance certifies
*this text against these facts*; neither moves, so citing the verdict is a reference. But the
plan proposes v2 insert a **new `serve.composed_text` row citing the identical
`raw_artifact_ref`** — a copy, which then needs its own conformance row or a cross-pointer.
Cleaner and strictly more honest: **v2 points `composed_text_id` and `conformance_record_id`
at v1's existing rows.** Both are plain nullable FKs on `serve.answer`
(`migrations/0000_s00.sql:267-269`); nothing requires per-version rows. Identity beats
duplication, T19 becomes trivial (assert equal ids), and no COMPOSER/CONFORMANCE call can
sneak in.

**VROW-6 — spend: the PINNED ceiling.** [SAME-HOUSE AGREEMENT] It is a bug tripwire
(DR-182(4)) and a re-runnable job is the runaway shape it exists to catch;
`countRunModelAttempts` (`packages/budget/src/index.ts:237-246`) has no work-item filter and
no time term, so a same-`run_id` catch-up consumes it with **zero new machinery**, and
`assertModelAttemptAllowed` (`:256-263`) fires on every gateway call
(`apps/runner/src/index.ts:2009`). V must be told there are **two** budgets, not one: the
run-total (room: 746 of 1196) **and** the per-call-site cumulative bound that C-2 is about.

**VROW-7 — census fourth term: YES.** [**DISSENT** — the architect says no] Not a style
question, an arithmetic one. V's complaint was that *the visible count lied about the
debate's size*. Today the three terms close: `122 = 52 judged + 70 set aside`. Under
DR-184-A they **stop closing** — `122 claims · 52 judged · 4 set aside` leaves **66 claims
unaccounted for on V's header line**. A census that does not sum to the whole is the same
species of lie V caught, just quieter. Either carry the fourth term —
`122 claims across 6 levels · 52 judged · 66 standing on their arguments · 4 set aside` — or
redefine the three so they exhaust the set. Header length is the cheaper thing to lose.

**VROW-8 — the pre-registered question. Record it, and do not rely on a test to raise it.**
[DISSENT on mechanism] Per Axis 8, T18 cannot fire. Pre-registration becomes real only if
**the job itself refuses**: have `runReviewCatchUp` compare v2's served number to v1's and,
on any difference, stop with a typed `CATCH_UP_NUMBER_WOULD_MOVE`, write no version, and
report — alongside the source-level sentinel of C-9. That way the day magnitudes are
measured, the system **halts and asks V** instead of quietly rewriting a number V already
read. It also costs nothing today, because today the numbers are provably equal (Axis 4).

---

## BINDING CONDITIONS

Authorization is conditional on all of these. C-1 … C-3 are **plan-text corrections required
before the ticket is scoped**; C-4 … C-11 are **ticket-binding**. None requires a new
authorization round.

- **C-1 — Correct the ceiling arithmetic.** Replace `1572` with **`1584`** at panel 3 /
  depth 5, replace `+ 12` with `+ 24` (`fixedSites = maxRecompose × fixedOrgansPerComposition
  = 2 × 4 = 8`), and paste the full recomputed panel 1..4 × depth 1..5 table (Axis 2) into the
  ticket. Additionally: **update the independent enumeration in
  `tests/unit/dr181-ceiling.test.ts:20-23` in the same commit** — at panel 1 the new ceiling is
  `28` against the old assertion's `29` and the shipped test will otherwise fail.
- **C-2 — Resolve `CALL_BUDGET_EXHAUSTED` before any catch-up code.** State explicitly what
  `callSiteKey`, `subjectItemId` and `bound.maxAttempts` a catch-up review call carries, given
  `apps/runner/src/index.ts:2010-2019` and `packages/ledger/src/index.ts:517-531`. Pin it with
  a test that a catch-up call at a site with 3 recorded failed attempts **reaches the
  provider**. Until this is answered, §11.2's live demonstration must not be scheduled.
- **C-3 — Thread the computed version through all three inserts** —
  `packages/serve/src/index.ts:997-1005`, `:1043-1052`, `:1076-1086` — and correct §5.5's FK
  reasoning. Add the duplicate-key case to T16/T17.
- **C-4 — Extend `hasJudgedBasis` to incoming arrows** (Axis 5), keep the subtree theorem's
  proof (unchanged: the new disjunct only adds basis), and add a cross-root case to T8/T9. A
  generated-forest property test alone does not exercise this.
- **C-5 — Declare that the served root may itself be class D**, that its statement therefore
  becomes the answer's prose while un-cross-reviewed, and that this converts today's loud
  `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW` death into a served answer. Pin a test that such
  an answer carries `DERIVED-STANDING-UNREVIEWED` at answer scope.
- **C-6 — Declare the low-score consequence.** Deleting `inheritedHiddenReason` un-veils
  `HIDDEN-LOW-SCORE` descendants (DR-176, a different ruling). Either accept it explicitly in
  the ticket or populate the low-score record's `affected_node_ids`. Also make class-H's
  subtree population an explicit change rather than "shipped, unchanged".
- **C-7 — Fix the orphan-audit registration.** Register at
  `tools/orphan-audit/src/index.ts:161-165` (`productionEntryPointFiles`), not only at the
  report array `:592-600`; the reachability walk (`:308-311, 361-368`) never opens
  `acceptance/`.
- **C-8 — Run the two free before-state queries and put both outputs in the packet**, before
  code: the §1.4 minute-by-minute outcome histogram, **and** the `COOLDOWN_HOLD` count
  (`core.run_progress_event`, `kind='node.retrying'`, `value_json->>'state'='COOLDOWN_HOLD'`)
  that settles §1.2's "the two holds were long spent". §1.2 is currently asserted to the same
  standard §1.4 refuses.
- **C-9 — Arm the pre-registered tripwire so it can fire**: a source-level assertion that no
  shipped writer emits `magnitudeStatus: "MEASURED"` (precedent
  `tests/unit/dr181-ceiling.test.ts:60-75`), not a fixture-local equality.
- **C-10 — Narrow T1** to authored set and review **coverage**, excluding reviewer
  assignment, and declare the rotation change (§3.2 consequence 1) in the ticket rather than
  in review.
- **C-11 — Carry this verdict's V-rows to V with the same-house disclosure**, including the
  two dissents (VROW-7, VROW-8 mechanism) and the two positions where I propose a value the
  plan left blank (VROW-1 in-run = 0, VROW-5 = point at v1's rows).

**On the brief's bright line.** My instructions said any arithmetic mismatch = REFUSED, and
Axis 2 found one. I am departing from that, deliberately and on the record: the error is in
an **illustrative instance**, not in the formula, and not in any value that reaches code —
the ceiling is computed at admission from engine exports (`acceptance/runtime-policy.ts:128-145`),
so `1572` could never have been persisted. The plan's own T5 refutes it. A refusal on that
alone would be a ritual, not a judgment, and would park V's capability to no one's benefit.
The finding that genuinely tested the verdict was **C-2**, and it is fixable without touching
a seam, an edge, a law or a V-row. Everything I could not verify, I have marked as
unverifiable rather than resolved: the relay-exhaustion diagnosis (§1.4), the hold-exhaustion
inference (§1.2), and the `450 of 1196 consumed` figure (§5.6), which is stated without a
source and which C-8's queries will settle.

**What survived me:** the σ / `magnitudeStatus` finding in full, the `answer_version`
finding in full, the silent-halt finding in full, the hold-budget mechanism, the subtree
theorem, the no-new-edge placement, the DR-179 and N-generic compliance, and the reading that
completing judgement — never lowering the bar — is what DR-165(3) demands. That is a plan
worth conditioning rather than refusing.

---

**AUTHORIZATION: GRANTED** — subject to binding conditions C-1 through C-11, and with the
DR-185 same-house limitation disclosed on V's card.
