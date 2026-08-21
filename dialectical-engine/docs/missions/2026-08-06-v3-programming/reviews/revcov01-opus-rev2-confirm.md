# REVCOV-01 — ADVERSARIAL OPUS LENS, REV 2 CONFIRMATION (t_f5bd09a5)

**Seat:** the same single independent Opus 5 adversarial lens that issued the rev1 **BLOCKING**
verdict, under **DR-186(9)** (Grok's seat unfunded — disclosed). **Scope of this pass, per P8:
confirm or refute my own three findings closed.** I am not re-reviewing the ticket; the rev1
verdict's CONFIRMED axes stand as recorded there.

**Isolation (DR-163):** every mutation ran in a throwaway clone at
`/private/tmp/revcov01-confirm-clone` (`cp -Rc` of the parent root). All four touched files
verified `cmp`-identical to the main tree afterwards, plus a `shasum -a 256` before/after on
each; the one scratch file I created was deleted and its absence verified. **The standing stack
(PG 55432 / API 8790 / shim 8791 / relay 8792 / UI 3000) was never touched** — no process
control, no live catch-up. That ceremony remains the orchestrator's.

---

## 0. Snapshot disclosure — the shared tree moved under me

This must be stated first, because it changes the numbers in the handoff's gate block and I do
not want anyone reading a parallel mission's arithmetic as REVCOV-01's.

At the time of my rev1 verdict and of the REVCOV-01 handoff, parent HEAD was `f065e7c` and the
suite was **87 files / 629 tests**. **During this confirmation pass** the parallel evaluator
mission landed `22a7140` ("PROG-04: eval-04-tagger merged"), which added:

- `tests/unit/evaluator-tagger.test.ts` — absent at `f065e7c`, **+8 tests**
- `tests/integration/evaluator-database.test.ts` — `it()` count **9 → 19**, **+10 tests**
- `migrations/0025_evaluator_domain_refusal_receipts.sql`

**629 + 18 = 647.** The delta is fully accounted for by the parallel mission, and **the
handoff's 629 is honest** for the tree it was written against.

One artefact of my own making, recorded so nobody inherits a false alarm: my first `cp -Rc`
caught the tree mid-checkout — it copied `.git` after `22a7140` but the working file
`0025_evaluator_domain_refusal_receipts.sql` before checkout wrote it. That torn snapshot
produced **2 failures in `tests/integration/evaluator-database.test.ts`**
(`TAGGER_REFUSED` / `TAGGER_EXECUTION_FAILED`). Restoring that single path in the clone made the
tree fully green. **Those two failures were my clone's tear, not a PROG-04 defect and not a
REVCOV-01 regression.** All results below are from the repaired snapshot at HEAD `22a7140`.

**Delta judged:** `git diff 52affbb` at the parent root, excluding
`docs/missions/2026-08-14-model-evaluator/**`, `.hermes/**` and the evaluator mission's code
(`packages/evaluator/**`, `packages/providers/**`, `apps/evaluator-worker/**`,
`migrations/0023-0025_evaluator_*`, `tests/**/evaluator-*`, `acceptance/*-relay*`). REVCOV-01's
own delta remains cleanly separable.

---

## 1. Verdict summary

| rev1 finding | Status |
|---|---|
| **F1 / B1** — C-2's binding test obligation unmet; suite blind to the blocker's return | **CONFIRMED-CLOSED** |
| **F2 / B2** — DR-186(5) census double-counts; four terms sum to 16 on 8 claims | **CONFIRMED-CLOSED** |
| **F3 / B3** — DR-186(7) sentinel scans two hard-coded files; a new writer stays green | **CONFIRMED-CLOSED** |
| A4 — mutation-ledger misattribution (T2 credited with cap-coupling) | **CORRECTED** |
| A5 — handoff conflates run-total with per-call-site budget | **CORRECTED** |
| A1 — `as "EXPANSION_HALTED"` type-lie at the persistence boundary | **FOLDED** (all four casts gone) |
| A3 — VROW-5 "reference, not copy" unasserted | **FIXED** |
| A2, A6, A7 | **HONESTLY DEFERRED** — named as still-advisory, no coverage claimed |
| A8 (`AGENTS.md` phantom gates) | out of ticket, disclosed again as unavailable-not-green |

Two of the three were closed **more thoroughly than my remedies required**. Nothing I ruled was
argued away.

---

## 2. B1 — the catch-up call budget crosses a real provider boundary

**CONFIRMED-CLOSED.**

**Test:** `tests/integration/database.test.ts` → *"DR-184 C-2 crosses the real provider boundary
after the in-run review key is exhausted"* (collected, `vitest list` line 20).

**The seam, verified by reading the fixture rather than accepting the claim.** My rev1 complaint
was that the shipped test computed its expectation with the function under test and never left
process. All three defects are gone:

- **Real embedded PostgreSQL** — `startTestDatabase()` + `migrate(database.pool)` in `beforeAll`;
  the test drives the production `createPostgresProviderGateway(database.pool, …)`.
- **A real HTTP-layer double** — `startProviderDouble` is a `node:http` `createServer`, and
  `provider.calls()` counts *actual HTTP requests reaching the socket*. There is **no `vi.fn()`
  reviewer anywhere on this path**; the mocked-reviewer tautology is gone.
- **The expected key is a hard-coded literal**, `expectedCatchUpKey =
  \`JUDGE:review:catch-up:${invocationId}:${nodeId}\``, independent of the function under test.

The legs: three `503`s exhaust `JUDGE:review:${nodeId}` (calls = 3) → a repeat throws
`CALL_BUDGET_EXHAUSTED` with calls still 3 → the catch-up key **resolves and calls → 4** → per-call-site
ledger counts read in-run 3 / catch-up 1 → run-total reads 4 → and a separate 2-attempt run gets
`RUN_COST_ENVELOPE_EXHAUSTED` with no extra relay call. That is my rev1 real-PG probe, now shipped
as a regression test.

### Mutations

**MB1 — my exact rev1 M1 reinstated.** `reviewCatchUpCallSiteKey` → `` `JUDGE:review:${nodeId}` ``
(the exhausted in-run key — the literal blocker C-2 exists to kill):

```
FAIL  tests/integration/database.test.ts > DR-184 C-2 crosses the real provider boundary …
AssertionError: promise rejected "TypedDomainError: …" instead of resolving
Serialized Error: { code: 'CALL_BUDGET_EXHAUSTED' }
Test Files  1 failed (1) | Tests  1 failed | 58 skipped (59)
```

In rev1 this same mutation left **all 628 tests green**. It now dies on the exact error my
out-of-band probe produced. Restored; sha256 identical.

**MB1b — my own escalation, beyond the remedy I prescribed.** I wanted to know whether the test
pins only *"reaches the provider"* or also *"under the ruled key"*. Mutated the key to
`` `JUDGE:catchup-opus:${nodeId}` `` — fresh, therefore it **does** reach the provider and the
`resolves` leg passes:

```
AssertionError: expected +0 to be 1
  371|   runId, workItemId, contractHash, callSiteKey: expectedCatchUpK…
```

RED anyway, on the independent literal. The tautology is dead in both directions: the test pins
that the call crosses the boundary **and** that it crosses under VROW-6's ruled key shape.

### Ledger corrections (A4 / A5)

- **T2** now reads *"it does **not** kill authoring cap coupling"*; **T4** now carries it
  (*"Its maker/expansion cases also kill the authoring cap-coupling mutation"*). That is exactly
  what M2 proved in rev1. **Corrected.**
- The **C-2 disposition** now names the two counters separately and correctly —
  `ledger.countModelAttempts(runId, workItemId, contractHash, inRunCallSiteKey)` (per call site,
  throws `CALL_BUDGET_EXHAUSTED`) versus `BudgetRepository.countRunModelAttempts(runId)` (run
  total, governed by the pinned ceiling). The conflation that let F1 hide is gone. **Corrected.**

---

## 3. B2 — the census partition

**CONFIRMED-CLOSED.**

**The partition is stated.** Handoff §"Rework round 1 — B2": reviewed low-score nodes remain
`judged` because DR-176 dimming is presentation-only; class D alone is `derivedStanding`; class H
(`HIDDEN-UNJUDGEABLE`) alone is `setAside`. That is remedy **(a)** of the two I offered. I said
the choice was V's because it changes what the header means, and the choice is now on the record
rather than implicit — which is the part that mattered.

**Every node is counted exactly once by construction — and it is enforced twice.**

*At the source*, `projectJudgedStanding` (`apps/runner/src/index.ts:361-366`):

- `hiddenNodeIds` = nodes whose basis set is **empty**. A reviewed node seeds its own basis with
  itself, so a reviewed node always has basis ≥ 1 — **`judged ∩ setAside = ∅` by construction.**
  This is where my rev1 double-count actually dies: at the projection, not at the display.
- `derivedStandingNodeIds` = `!reviewed && basis > 0`. Disjoint from both.
- Total: basis = 0 → hidden; basis > 0 ∧ reviewed → judged; basis > 0 ∧ ¬reviewed → derived.
  No fourth cell.

*At the boundary*, the logic is extracted to `apps/v2-ui/lib/v3/census.ts::projectCanvasCensus`,
which recomputes membership per node and increments **exactly one** counter or throws
`CENSUS_PARTITION_INVALID`. So `judged + derivedStanding + setAside === claims` holds by
construction, and a future violation is loud rather than quiet.

**The new arithmetic test feeds from REAL projection output.** `RESIL-01 rev2 R2 keeps a healthy
tau-0.30 graph servable…` (`vitest list` line 59) runs the real runner against real embedded
PostgreSQL, takes `readAnswerProjection`'s actual result — not a hand-fed literal — and asserts:

```ts
expect(census).toEqual({ claims: 8, judged: 8, derivedStanding: 0, setAside: 0 });
expect(census.judged + census.derivedStanding + census.setAside).toBe(census.claims);
```

**This is the very fixture on which rev1 measured `sumOfTerms: 16, overlapJudgedAndSetAside: 8`.**
V's sum law now holds on it, asserted explicitly and separately from the value assertion. The
rev1 complaint *"there is no test of the census arithmetic at all"* is answered.

**MB2 — my exact rev1 double-count reinstated.** `record.mark === "HIDDEN-UNJUDGEABLE"` →
`record.mark.startsWith("HIDDEN-")` (which is what the shipped code did in rev1):

```
FAIL  … RESIL-01 rev2 R2 keeps a healthy tau-0.30 graph servable …
TypedDomainError: Node f8116860-0ecc-4b2e-843d-44565d3e4155 must belong to exactly one of
judged, derived-standing, or set-aside      → CENSUS_PARTITION_INVALID
```

Restored; sha256 identical.

**Two things I checked because remedy (a) could have made the fourth term decorative:**

1. **`setAside` is not structurally dead.** If class-H nodes were dropped from
   `answer.nodes`, the term could never be non-zero and VROW-7's fourth term would be theatre.
   They are not: `tests/integration/database.test.ts:1977` proves a class-H node is present in
   `answer.nodes` with `final_strength: null` and `condition_marks: ["HIDDEN-UNJUDGEABLE"]`.
2. **The catch-up cannot re-open the double-count after the ceremony.** `runReviewCatchUp`
   (`apps/runner/src/index.ts:672-712`) **drops** every prior `HIDDEN-UNJUDGEABLE` /
   `DERIVED-STANDING-UNREVIEWED` record and rebuilds them from freshly recomputed standing. A
   node reviewed in v2 therefore cannot keep a stale class-D record and land in two buckets on
   V's canvas after the catch-up. This was the failure mode I most expected to find and it is
   closed.

---

## 4. B3 — the shipped-source sentinel

**CONFIRMED-CLOSED.**

`tests/unit/dr184-judged-standing.test.ts:86-105`. The two hard-coded file paths are gone. The
test now walks **`apps`, `packages`, `acceptance` recursively** (`readdir` with `withFileTypes`,
every `.ts`/`.tsx`), and the **only** exclusion is the exact annotation pattern

```
/^\s*readonly\s+magnitudeStatus\s*:\s*["']MEASURED["']\s*\|\s*["']UNKNOWN["']\s*;\s*$/
```

— a line pattern, not a file and not a directory. That is the narrowing C-9 asked for and rev1
demanded. Independently confirmed: across the whole shipped walk exactly one line matches the
writer regex today (`packages/serve/src/index.ts:136`), and it is the declaration.

**MB3a — my exact rev1 M13 scenario.** New shipped file
`packages/propagation/src/opus-future-evaluator.ts` returning
`{ strength: 0.42, magnitudeStatus: "MEASURED" }`:

```
FAIL  … T13/C-9 fails when any shipped writer emits a measured edge
AssertionError: expected [ …(2) ] to deeply equal []
+ "packages/propagation/src/opus-future-evaluator.ts:1:…"
+ "packages/propagation/src/opus-future-evaluator.ts:2:return { strength: 0.42, magnitudeStatus: \"MEASURED\" };"
```

**In rev1 this identical file left the sentinel GREEN.** It now trips RED and names the exact
path and line. Scratch file deleted; absence verified.

**MB3b — pattern-not-file, proved rather than assumed.** I appended
`export const opusProbeEdge = { strength: 0.9, magnitudeStatus: "MEASURED" as const };` at module
scope of `packages/serve/src/index.ts` — **the very file that carries the excluded annotation**:

```
AssertionError: expected [ Array(1) ] to deeply equal []
+ "packages/serve/src/index.ts:2028:export const opusProbeEdge = { … magnitudeStatus: \"MEASURED\" … };"
```

The exclusion blesses the declaration line, **not the file**. Restored; sha256 identical.
Sentinel green on the clean tree (6/6 in that file).

*Residual nit, not a finding:* the scan is line-based, so a value split across two lines would
slip past. Irrelevant to the hazard C-9 named — *"the day an evaluator ships and starts emitting
`MEASURED`"* — which is now genuinely caught.

---

## 5. Advisories — folded or honestly deferred?

- **A1 — FOLDED, exactly as prescribed.** `RunLifecycleEventValue.state`
  (`packages/db/src/index.ts:295`) is now the same five-member union as `HoldProgressEvent.state`
  (`apps/runner/src/index.ts:150`). `grep -rn 'as "EXPANSION_HALTED"'` over all shipped source
  and tests returns **nothing** — all four laundering casts (`acceptance/main.ts`,
  `acceptance/review-catch-up.ts`, two in `tests/integration/database.test.ts`) are deleted, and
  `typecheck` exits 0 with the widened union. The type no longer lies at the persistence boundary.
- **A3 — FIXED.** `tests/integration/database.test.ts:2058-2059` assert v2's `composed_text_id`
  and `conformance_record_id` are `toBe` v1's. VROW-5 "reference, not copy" is now pinned
  directly instead of incidentally via a DDL coverage-mode constraint.
- **A2, A6, A7 — HONESTLY DEFERRED.** The handoff names each as *remaining advisory* and claims
  no coverage for any of them. That is the right disposition: none is a ruled value, each is a
  strengthening, and the worker did not dress absence as presence.
- **A8 — unchanged and re-disclosed** as unavailable-not-green. Still the orchestrator's to repair.

---

## 6. Gates (repaired clone, HEAD `22a7140`, real embedded PostgreSQL)

| Gate | Result |
|---|---|
| `pnpm exec vitest run` | **88 files / 647 tests passed**, 31.1 s |
| `pnpm run typecheck` (`tsc --noEmit`) | **exit 0** |
| `pnpm run lint` — architecture | `{ "edgeRowsChecked": 27, "violations": [] }` |
| `pnpm run lint` — source | `{ "blocking": [] }` |
| `pnpm exec vitest list \| wc -l` | **647** (= REVCOV-01's 629 + the parallel mission's 18) |
| Integration incl. migration 0025 on real PG | ✅ `migrate()` applies both 0025 files; class-D `judged_basis_count` constraint proven in both directions inside the green run |
| Post-mutation restore | ✅ full suite re-run **88 / 647 green**; all four touched files `cmp`-identical to the main tree |

The three rework tests are all collected and named (`vitest list` lines 20, 59, 224).

---

## 7. New this round — for V's merge attention, not gates

**N1 — the migration number 0025 is now taken twice.** The main tree carries **both**
`0025_dr184_derived_standing.sql` (REVCOV-01, untracked) and
`0025_evaluator_domain_refusal_receipts.sql` (parallel evaluator mission, committed at `22a7140`
*during* this review). I checked whether this breaks anything and it does not, provably:

- `migrate()` (`packages/db/src/index.ts:123-152`) keys the applied set on the **full filename**
  (`name text PRIMARY KEY`) and sorts by full filename. **Both apply**, deterministically,
  `…dr184…` first.
- They touch **disjoint tables**: `serve.condition_mark` vs `evaluator.domain_admission`.
- The full suite is green on real PostgreSQL with both applied.

So: mechanically harmless, **not a blocker, and not REVCOV-01's error** — REVCOV-01 took 0025
first and disclosed the collision risk. But the handoff's disclosure ("this tree already contains
`0024_evaluator_domain_seed.sql`, so this change is `0025`") is now *understated*. V should
renumber one of them during reconciliation, or at minimum record the ordering deliberately.

**A9 — the census guard throws at the render boundary.** `projectCanvasCensus` raises
`CENSUS_PARTITION_INVALID` inside a `useMemo` in `DebatePageClient`, so an invariant violation
would blank V's canvas rather than degrade it. I could not construct a reachable violation — the
partition is total and disjoint at the runner source (§3) and the catch-up rebuilds rather than
carries records — and loud-over-quiet is the rule VROW-7 itself invoked. **Advisory only:**
catching at the render boundary and disclosing "census unavailable" would be strictly better than
an unmounted page during the ceremony.

---

## 8. What this round did to my three findings

All three are closed, and two beyond what I asked for. B1 does not merely reach the provider —
it pins the ruled key shape against an independent literal, so a *fresh but wrong* key dies too.
B2 does not merely fix the display arithmetic — the disjointness is a property of
`projectJudgedStanding` itself, with the UI guard as a second line, and the closure is asserted
against real projection output on the exact fixture where rev1 measured 16-on-8. B3's exclusion
is the annotation pattern, and I proved it by tripping the sentinel from inside the excluded
file.

The two ledger misattributions I named are corrected in the worker's own words. The one advisory
I cared about — the type-lie at the persistence boundary — is folded, not waived. The rest are
deferred with the absence stated rather than papered over, which is the behaviour the protocol
wants.

Nothing that was CONFIRMED in rev1 was disturbed by the rework: the ceiling arithmetic, the
incoming-arrow closure, the three-insert threading, the migration, zero in-run review holds,
DR-115 / DR-165(3) / DR-179 / N-generic — all still stand, and the full suite that pins them is
green.

I went looking for a reason to hold this a second time. I did not find one.

---

**VERDICT: APPROVE**
