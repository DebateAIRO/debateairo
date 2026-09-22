REWORK READY FOR REVIEW — T17B (V-authorized post-cap: V-S09-CODEX-S09B-1 + S09B-2) · comments read through: s09-codex-s09b-2026-09-02
report sha256: eabb419a0b4a158d4b774bfc87c25c22456964a3ff59262f53a2b40d2eda36e4

# S09 — T17 · cost envelope for the live topology (DR-184-v3)

| field | value |
|---|---|
| seat | `claude@opus-s09-w9` |
| lane | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09` |
| branch | `lane/s09`, base `e040b1ee` (TINT1 + T6 + S06), never pushed, never merged |
| filed tip | `265581b2` · tree `adbf8382e92c859d2c63cbd91f96b712b6865f78` |
| commits | `44834a6c` · `0412689d` · `4bbb13e5` (r2) · `8aa1357c` (r3) · `e973b7c8` · `047b1d36` · `265581b2` (**S09B**) |
| round | rework rounds EXHAUSTED at r3; this filing is **micro-ticket S09B**, judge-authorized (V may veto) |
| mode-change count vs base | **0** (`git diff --summary e040b1ee..HEAD \| grep -c "mode change"`, J16(b)) |
| logs | `logs/s09/` |

---

## 0. S09B — three items, judge-authorized after the rounds were exhausted

codex r3 confirmed the arithmetic independently: `8×4 + 8×4 + 8×3 + 7×3 = 109`, with the old 88
omitting the panel leg and over-billing the serve leg. S09B closes three things.

### (1) J28 — the run did not merely MISREPORT itself; it destroyed its own answer

r3 filed F-S09-8 as a measured boundary and declined to choose. The consequence was worse than
the report said. At `consumed == max` the runner does not just record EXHAUSTED:

```ts
if (!result.conditionMarks.includes("DEFECT") && !result.conditionMarks.includes("ENVELOPE_EXHAUSTED")) {
  const finalEnvelopeDecision = await evaluateEnvelope();
  if (finalEnvelopeDecision.kind === "HARD_STOP" && servedRoot.restatementStatus === "PASS") {
    result = await makeEnvelopeTerminal(finalEnvelopeDecision);   // <- REPLACES the served answer
```

The envelope terminal **replaces the answer the serve chain has already produced**. So a lawful
maximum-path run completed, served, and then lost its answer for the offence of spending exactly
the envelope it was permitted.

J28's default, applied: the REPORTING comparison follows the PERMISSION comparison.
`assertModelAttemptAllowed` permits exactly `max` (it refuses at `consumed >= max`), so
`decideBudgetPressure` now reports WITHIN while `consumed <= max`. **Nothing about what is
allowed changes.** V-S09-8 records the alternative reading as V's.

The integration test asserts the ruled state and, non-vacuously, that the answer survives: the
`serve.answer` row EXISTS, its terminal is the chain's own `DOWNGRADED`, and it carries no
`ENVELOPE_EXHAUSTED` mark. `tests/unit/budget-s09.test.ts` pinned HARD_STOP at exactly `max` —
the equality case J28 rules WITHIN — and now pins **both sides**: WITHIN at `max`, HARD_STOP at
`max + 1`.

### (2) The split receipt was accepted in contradictory forms

The serve leg is disclosed twice — as the selected count (`call_sites.serve`) and as the arms it
was chosen from (`serve_leg`) — and nothing made them agree. `parseCostEnvelopeBasis` now refuses
a basis whose serve count disagrees with its selected arm, and one whose composition arm is not
its own disclosed decomposition (`sites − perRun` must be a whole multiple of `perRound`).

**Both shared fixtures were caught by it immediately**: `fixtureStructuralCeiling` and the
obs-l3 double both declared `call_sites.serve: 8` against a `composition_sites: 7` arm — exactly
the contradiction the refinement exists to reject. The fixtures were wrong, not the parser.

The one-field deletion matrix gains `composition_sites_per_round` and `post_compose_sites_per_run`
— r1 B3's gap repeated on the two fields r3 added — so it now covers **all eleven** members v3
requires, not nine.

### (3) The generated sweep — five sentences that contradicted my own logs

| # | claim | reality |
|---|---|---|
| 1 | GREEN logs "at the filed tip `4bbb13e5` / tree `f77b804a`" | superseded twice since; now `265581b2` / `adbf8382` |
| 2 | paired proof "filed tip `4bbb13e5`" | same |
| 3 | campaign "tip `4bbb13e5`, tree `f77b804a`" (a leftover paragraph beside the r3 one) | removed |
| 4 | M8's passed-count recorded one too high | under M8 the integration file is a **collection** failure, so its test leaves the count entirely rather than passing — the total is one less than the cluster's. Re-measured at this tip: `31 failed \| 67 passed (98)` against a 99-test cluster |
| 5 | fixture docstring: "Panel and serve-organ legs answer first time" | the r2 double's behaviour; the implementation has driven every namespace to its last allowed attempt since r3 |

(5) was in committed source, not just the report — the same class as N1 last round.

---

## 0a. REWORK r3 — the serve leg was an OVER-count, measured from the ledger

codex r2: three blocking, one non-blocking; two of the four were the orchestrator's and are
corrected in DECISIONS (D35 CORRECTION, D27 ADDENDUM-2). Mine were B1, B2 and N1.

| # | finding | disposition |
|---|---|---|
| B1 | the ledger run was a BRACKETING run — serve organs had a zero failure budget, one composition round | **FIXED, and it found the second unmeasured premise.** 7 serve sites measured, not 8 |
| B2 | the stale-stamp transcript was directory-sensitive; the paired base arm lacked a base tree and base-side porcelain | **FIXED** — corrected form, §6b |
| N1 | committed comments still stated the retracted `2*judge + final` | **FIXED** — swept, §0b |
| B3 | the packet/D35 quoted 92 as a maximum | orchestrator's; corrected in DECISIONS. **92 is not quoted as a maximum anywhere below** |

### B1 — the second shared premise, of exactly the same class as the first

r2 corrected the cooldown term after the ledger refuted it. The same reading exposed a second
constant multiplied without ever being counted:

`ENGINE_FIXED_ORGANS_PER_COMPOSITION` is `1 + segmentCap + 1` — composer, conformance per
segment, and post-compose R9 — and the formula multiplied all of it by `maxRecompose`. But the
chain (`packages/serve/src/index.ts:505-580`) runs the composer and conformance **inside** the
recompose loop and post-compose R9 **once after it**. Multiplying bills an R9 per round that the
chain never makes.

**Measured**, driving every reachable serve namespace to its last allowed attempt with both
composition rounds forced:

```
COMPOSER:1=3        COMPOSER:2=3
CONFORMANCE:1:0=3   CONFORMANCE:1:1=3   CONFORMANCE:2:0=3   CONFORMANCE:2:1=3
POST_COMPOSE_R9:2=3
```

**Seven sites, 21 attempts — not eight sites.** R9's key is `POST_COMPOSE_R9:2`, keyed by the
LAST composition round, which is itself the evidence that it follows the loop rather than
belonging to a round. The term is now
`maxRecompose * (1 + compositionSegmentCap) + 1`, with a loud
`STRUCTURAL_CEILING_COMPOSITION_SHAPE_INCOHERENT` stop if the sealed row's
`fixedOrgansPerComposition` ever disagrees with that shape, and the receipt discloses both
halves (`composition_sites_per_round`, `post_compose_sites_per_run`).

**So DR-184-v2 was wrong in BOTH directions**, and this lane's story is no longer "v2
undercounted":

| leg | v2 | measured | delta |
|---|---|---|---|
| panel | 0 | `(M−1) × materializedNodes` | **+24** at M=2/d=1 |
| serve | `maxRecompose × 4` = 8 sites | 7 sites | **−3** |
| per-site attempts | `judge + final` | `judge + final` | unchanged (r2's retraction) |

M=2/depth=1: 88 → **109**. The full maximum-path run spends exactly 109.

### 0b. N1 — the retraction sweep

`tests/unit/t17-envelope.test.ts:15-28` still described three missing legs, called the cooldown
limb a second undercount, and stated `2 * judgeMaxAttempts + finalRetryAttempts` "not
`judge + final`" — the opposite of the gateway, the formula, D35 and M2b. Rewritten to state the
cumulative per-key accounting, to name the panel leg and the serve over-count as the two
corrections, and to record the retraction explicitly so a maintainer sees why. The nearby "both
provider sequences" phrasing now says the two sequences SHARE one allowance. The unit
enumerator no longer copies `maxRecompose * fixedOrgansPerComposition`: it walks the chain's
sites, so it is a check on the formula rather than a restatement of it.

---

## 0a. REWORK r2 — the cooldown retraction (retained for the record)

Four blocking findings, all accepted; none disputed. B1 is the one that earned
its keep: **writing the test it asked for refuted my own correction.**

| # | finding | disposition |
|---|---|---|
| B1 | the maximum-path test compared the closed form to a second IN-MEMORY model, never a ledger | **FIXED — and it refuted the cooldown term.** New `tests/integration/t17-envelope-ledger.test.ts` |
| B2 | no case was actually OVER-BOUND, and depth 6 was admitted | **FIXED** — `maxDepth` sealed in the T16 row; depth 6 is a typed `AskRefusal` at admission |
| B3 | 3 of 9 new disclosure members missing from the refusal matrix | **FIXED** — all nine, one at a time |
| B4 | the paired proof named a tip 24 lines behind the filed one | **FIXED** — refiled at the exact tip; stale-stamp check in §6 |

### B1 refuted the cooldown term — the correction was wrong

r1 claimed `withCooldownRetry` gives each of its two sequences a fresh
allowance, so a cooldown site's worst case was `2*judge + final` = 7, and that
DR-184-v2 "undercounted every cooldown site by `judge`". **That was wrong, and
the in-memory enumerator agreed with it because both were models of the same
mistaken reading — exactly the escape B1 names.**

The ledger measured 4 attempts at a site the formula had modelled at 7:

```
T17 DIAG ledger: [{"call_site_key":"JUDGE","attempts":"4","outcomes":"FAILED"}]
```

Cause, in the shipped gateway (`apps/runner/src/index.ts:3565-3577`):

```ts
const consumed  = await ledger.countModelAttempts({ runId, workItemId, contractHash, callSiteKey });
const remaining = remainingProviderAttempts(request.bound.maxAttempts, consumed);
if (remaining <= 0) throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", ...);
return http.call({ ...request, bound: { ...request.bound, maxAttempts: remaining } });
```

Attempts are counted **cumulatively per call-site key**. Sequence 1 spends
`judgeMaxAttempts` (3); sequence 2 is invoked with `maxAttempts = judge + final`
(4) but `consumed` is already 3, so it gets `remaining = 1`. The site's true
allowance is `judgeMaxAttempts + finalRetryAttempts` — **exactly what DR-184-v2
had.** Term corrected; every pinned grid moves.

**What this means for F36 and for this lane's claim.** The entire real
correction is the **panel leg**. v2's per-site attempt terms were right; it
counted `(M-1)` calls per materialized node at ZERO. At M=2/depth=1 the ceiling
went 88 → 112 in r2; r3's serve correction takes it to **109** (§0).
The r1 report's "second undercount" claim is **retracted on the record**.

---

## 1. THE DERIVED PER-ROUND ROLE COUNT — **2** (one SYNTHESIZER + one EVALUATOR)

Derived from the UNMERGED lane/s07 tip `8a58594e`, file
`dialectical-engine/packages/serve/src/synthesis.ts`, function `runSynthesisLoop`:

```
for (let round = 1; round <= maxRounds; round += 1) {          // :484
  const synthesizerRequest = buildSynthesizerRequest({...});    // :485
  candidate = await dependencies.synthesize(synthesizerRequest);// :492   <- role call 1
  ...
  const evaluatorRequest = buildEvaluatorRequest({...});        // :495
  const verdict = assertEvaluatorVerdict(await dependencies.evaluate(evaluatorRequest)); // :502  <- role call 2
  ...
  if (verdict.satisfied) { prior = null; break; }               // :510-513
}
```

Both calls are **unconditional within the body**; the only early exit is `break` on
`verdict.satisfied`, which ends the loop rather than skipping a call. `maxRounds` is
`controls.evaluatorLoopMaxRounds`, the sealed T16 row (value **3**). So the serve leg after T9
is `rounds × 2 roles = 3 × 2 = 6` role call sites — which is exactly what T16's already-sealed
`envelopeFormulaInputs` row states as `synthesizerMaxRounds: 3` + `evaluatorMaxRounds: 3`. The
independent derivation and the sealed row agree.

Corroborating the retirement side (same lane, `apps/runner/src/index.ts` diff): the
`conform` (per-segment CONFORMANCE) and `postComposeR9` provider limbs are DELETED and their
schemas retired; `runServeGateChain` no longer receives `maxRecompose`. The two serve chains
are therefore **mutually exclusive** — composition organs before T9, the loop after.

> **This term is derived from an UNMERGED shape and MUST be re-verified after T9 merges.** If
> the merged `evaluatorLoopMaxRounds` reader, the loop body, or the role count changes, the
> sealed row and this formula both move. The receipt's `serve_leg.selected` field exists so a
> stored basis can be audited for exactly this: after T9, a basis still reporting `COMPOSITION`
> was minted against a retired chain.

---

## 2. WHAT WAS WRONG — one leg missing, one leg over-billed, one claim retracted

`computeStructuralCeilingBasis` at `packages/register/src/index.ts` (DR-184-v2) computed:

```
(authored + reviews) * (judgeMaxAttempts + finalRetryAttempts) + maxRecompose*fixedOrgans*organMaxAttempts
```

### (a) The PANEL leg was counted at ZERO — F36's charge, and worse than F36 states

F36 says the serve-leg term is wrong. It is, but the larger defect is the panel. I initially
read `panelSize * (panelSize - 1)` in `authored` AS the panel term. **It is not.** The mission's
own independent enumeration in `tests/unit/dr181-ceiling.test.ts` spells it out:
`authored = panelSize + expansion.length + exchange.length`, where
`buildCrossRootExchangePlan(M).length === M(M−1)`. That term is the cross-root exchange NODES.

The real panel leg, measured:

- `runNodePanel` (`apps/runner/src/index.ts:1797`) passes **every** configured maker to
  `runJudgePanel` as a member.
- `runJudgePanel` (`packages/judgement/src/s04.ts:224-252`) skips the author
  (`PRODUCER_GRADING_FORBIDDEN`, `:233-236`) and calls the rest → **exactly `M − 1` model calls**.
- It runs at **every materialized node**, not just roots: `:2105` for the primary root and
  `:2299` inside `authorPosition`, which authors expansion children (`:2577`), additional roots
  (`:2445`) and cross-root exchange nodes (`:2619`).

DR-184-v2 provisioned **none** of these. At M=2/depth=1 that is 8 uncounted model call sites.

### (b) RETRACTED — the cooldown term was NOT undercounted

r1 claimed a cooldown site's worst case is `2*judge + final`, because
`withCooldownRetry` (`apps/runner/src/index.ts:250-338`) runs two sequences. **The ledger test
refuted it: the site spends 4, not 7.** The gateway counts attempts CUMULATIVELY per call-site
key (`apps/runner/src/index.ts:3565-3577`) and hands the second sequence only
`remaining = maxAttempts − consumed`, so the allowance is
`judgeMaxAttempts + finalRetryAttempts` for the SITE — what v2 already had. See §0.

Panel member calls are **not** cooldown-wrapped
(`member.judge.assess({... bound: this.settings.judgeBound })`) and each has its own call-site
key, so each spends `judgeMaxAttempts`. That leg — not the retry accounting — is the whole
correction.

### (c) The SERVE leg was OVER-counted, and had no synthesis term

Two things. The synthesis term is covered in §1. The over-count is r3's finding, in §0: the
chain runs composer + conformance per recompose round but post-compose R9 **once after the
loop**, so `maxRecompose × ENGINE_FIXED_ORGANS_PER_COMPOSITION` bills an R9 per round that never
happens — 8 sites billed against 7 measured. Both the formula and the "independent" enumerator
had copied that expression, which is why neither could see it; the enumerator now walks the
chain's sites instead.

### (d) NOT a term: "repair"

`buildRepairPacket` is consumed **inside** the per-site attempt loop
(`packages/providers/src/index.ts:326`, `:426-427` — the repair packet becomes the *next*
attempt within the same `maxAttempts` bound). A repair is one of the attempts the site already
provisions, so no separate multiplier is lawful. Disclosed rather than silently omitted.

---

## 3. THE RECOMPUTED FORMULA (DR-184-v3)

```
nodesPerRoot      = (b^(depth+1) − 1) / (b − 1)                       [unchanged]
materializedNodes = M === 1 ? 1 : M*nodesPerRoot + M*(M−1)            [roots + expansion + exchange]

cooldownSiteAttempts = judgeMaxAttempts + finalRetryAttempts   [cumulative per call-site key]

authorSites   = materializedNodes
panelSites    = M === 1 ? 0 : (M−1) * materializedNodes
reviewerSites = M === 1 ? 0 : reviewerCallsPerNode * materializedNodes
compositionSites = maxRecompose*(1 + compositionSegmentCap) + 1   [MEASURED: composer+conformance
                                                                   per round, post-compose ONCE]
serveSites    = max(compositionSites, synthesizerMaxRounds + evaluatorMaxRounds)

max_model_attempts = (authorSites + reviewerSites) * cooldownSiteAttempts
                   + panelSites * judgeMaxAttempts
                   + serveSites * organMaxAttempts
```

`M === 1` keeps the S2-2 walking-skeleton case exactly as before: one node, no panel, no
cross-maker review.

**Why `max` and not `+` for the serve leg.** The two chains cannot both run in one tree. `max`
is the tight cover in both worlds (exact before T9: 8 sites; 8 ≥ 6 after). The sum (14) would
be slack in both. Risk tier is high in *both* directions — too small refuses lawful runs, too
large hides cost defects — so the tighter combinator is the honest one, and
`serve_leg.selected` puts the choice on the receipt.

Recomputed grid (judge=3, organ=3, final=1, maxRecompose=2, fixedOrgans=4, synth=3, eval=3,
reviewerPerNode=1, b=2), rows M=1..4, columns depth=1..5:

| M | d=1 | d=2 | d=3 | d=4 | d=5 | (was, DR-184-v2) |
|---|---|---|---|---|---|---|
| 1 | 25 | 25 | 25 | 25 | 25 | 28 — **LOWER: no panel at M=1, and v2's extra R9** |
| 2 | **109** | 197 | 373 | 725 | 1429 | 88 … 1048 |
| 3 | 231 | 399 | 735 | 1407 | 2751 | 144 … 1584 |
| 4 | 429 | 701 | 1245 | 2333 | 4509 | 216 … 2136 |

The M=1 row is the corrected formula's own cross-check, and it now moves DOWN: at M=1 there is
no panel and no cross-maker review, so the only difference from v2 is the serve over-count —
28 → 25, exactly the 3 attempts of one surplus post-compose organ. Every rise at M≥2 is the
panel leg net of that same −3.

---

## 4. NO NEW POLICY VALUE — T16 had already sealed the row

**Every new term already existed as a sealed T16 row, with no production consumer.**
`packages/register/src/algorithm-policy.ts:241` seeds `envelopeFormulaInputs`:

```
{ kind: "ENVELOPE_FORMULA_INPUTS", branchingFactor, compositionSegmentCap,
  fixedOrgansPerComposition, maxRecompose, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3,
  panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE" }
```

and `readEnvelopeFormulaInputs` (`:551`) reads it. Before this lane the reader had **zero**
production callers — it was seeded for T17 and never wired. So I declared **no new constant and
re-declared none**; I wired the existing reader into both entry points. The readers are the
claim-time loud stops:

- `apps/api/src/main.ts:~149` — `await readEnvelopeFormulaInputs(pool, environment.REGISTER_VERSION)`
  at boot. A deployment that never sealed the row **cannot boot the API**, so no ask is ever
  admitted against an invented envelope. `readFamily` throws `ENVELOPE_FORMULA_INPUTS_UNRESOLVED`
  naming the missing row key (goal 39-40).
- `acceptance/runtime-policy.ts` — `readAcceptanceRuntimePolicy` reads the row into
  `AcceptanceRuntimePolicy.envelopeFormulaInputs`; the acceptance deployment cannot resolve a
  runtime policy without it.

Net effect on constants: this lane **removed** four re-declarations. `apps/api/src/main.ts` no
longer imports `ENGINE_BRANCHING_FACTOR`/`ENGINE_COMPOSITION_SEGMENT_CAP`/
`ENGINE_FIXED_ORGANS_PER_COMPOSITION`/`ENGINE_MAX_RECOMPOSE`, and `acceptance/runtime-policy.ts`
no longer imports the four `RUNNER_*` mirrors — both now read the sealed row, which seeds those
values from `engine-shape.ts` in the first place.

**One member was ADDED to the sealed row in r2 (codex B2): `maxDepth: 5`.** Before it, the
contract accepted `depth_params` as an arbitrary record, the formula checked only "positive
integer", and an ask with depth 6 minted a POSITIVE depth-6 ceiling and **passed admission** —
stopping later in `resolveExpansionDepth` or when the stored basis was parsed, after the asker
had been admitted. That violates the DoD's "refuses loudly **at admission**". The formula now
throws `STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM` above the sealed value, which
`markAskRefusal` turns into a typed `AskRefusal` on the 422 face.

The value lives in the sealed row and not in code, per the packet's step 4, and it is seeded the
same way its siblings are (`reviewerCallsPerNode: 1`, `evaluatorLoopMaxRounds: 3`). I did **not**
touch either existing 1..5 literal — `apps/runner` `resolveExpansionDepth:1317` and
`packages/budget:47` — because J6 puts `packages/budget`'s copy on **T1's** surface and T1 is
unmerged. That leaves the value stated in three places; see finding F-S09-6.

`panelCallsPerNodeBasis` is deliberately **not** a formula input: the row's own
`z.literal("PANEL_SIZE_MINUS_ONE")` (`algorithm-policy.ts:331`) is already the loud stop for any
other basis, so the `(M−1)` derivation is the row's and not this file's. Carrying it as a
fourth member would have been a second guard on a fact the register already validates.

---

## 5. RED → GREEN

**RED log:** `logs/s09/RED-t17-envelope.log` — at base `e040b1ee`, tree `2131932e`,
porcelain showing the new test file as the only add.

```
command: pnpm exec vitest run tests/unit/t17-envelope.test.ts
 × is not the DR-184-v2 undercount: M=2 depth=1 needs 160 attempts, not 88
   → expected 88 to be 160 // Object.is equality
 ...
 Test Files  1 failed (1)
      Tests  14 failed (14)
EXIT=1
```

The first frame is the arithmetic one: a DESIRED number against the baseline's actual 88, on an
input the baseline formula accepts — the failure is the NUMBER, not a type guard. **The desired
number in that frame was 160, corrected to 112 in r2 and to **109** in r3** (§0): the RED direction was right —
88 undercounts — and its magnitude was wrong. The RED evidence is preserved verbatim rather than
re-cut, so the correction is legible on the record instead of being tidied away. The assertion
was never flipped: it asserted "more than 88" then and it asserts "more than 88" now.

The log's header names the filed tip first and then the BASE commit it actually ran at, since
RED evidence must fail on the baseline (goal 29-31).

**GREEN logs:** `logs/s09/s09b-GREEN-S09-C1-run{1,2,3}.log` at the filed tip `265581b2` / tree
`adbf8382`.

**Cluster S09-C1** — rows: both T17 DoD rows. ONE verification command:

```
pnpm exec vitest run tests/unit/t17-envelope.test.ts tests/unit/dr181-ceiling.test.ts \
  tests/unit/dr184-review-resilience.test.ts tests/unit/register-s09.test.ts \
  tests/unit/budget-s09.test.ts tests/unit/api.test.ts tests/unit/pro01-runner-tree.test.ts \
  tests/unit/xrev01-node-review.test.ts acceptance/runtime-policy.test.ts \
  tests/integration/t17-envelope-ledger.test.ts
```

(r2 adds the ledger test to the cluster, so the cluster's ONE command now covers the DoD's
own clause rather than only the closed form.)

File surface: `packages/register/src/index.ts`, `packages/budget/src/index.ts`,
`apps/api/src/main.ts`, `acceptance/runtime-policy.ts`, `acceptance/run-acceptance.ts`,
`acceptance/{panel01,xrev01}-depth1-proof.ts`, `tests/unit/t17-envelope.test.ts`,
`tests/support/discoveredPanel.ts`, and the four pinned-number tests.

### Three-run law — worst run is the verdict

| run | result | failures |
|---|---|---|
| 1 | `2 failed \| 97 passed (99)` | the 2 pre-existing, named below |
| 2 | `2 failed \| 97 passed (99)` | same 2 |
| 3 | `2 failed \| 97 passed (99)` | same 2 |

**Worst = best = `97/99`.** No flake, no ordering sensitivity. The cluster has grown each round
as the assertions it is the review unit for have: 83 tests at r1, 93 at r3, 99 at S09B.

---

## 6. Suites, named individually

| gate | result | log |
|---|---|---|
| root `pnpm run typecheck` at the filed tip | **exit 0** | `s09b-GATE-typecheck.log` |
| cluster S09-C1 ×3 | `97/99` worst run | `s09b-GREEN-S09-C1-run{1,2,3}.log` |
| stamp check (D27 ADDENDUM-3 final form) | printed **nothing**; all 7 in-scope logs carry `commit=<filed tip>` | §6b, verbatim |
| `tests/unit` zone, set-equality by name | **SET-EQUAL** — `7 failed \| 1047 passed (1054)`, NEW 0 · VANISHED 0 | `s09b-ZONE-unit-HEAD.log` |
| mode-change count vs base | **0** | inline above |
| D14 / D16 surface gates | **do not trigger** — see below | — |

**The paired base↔HEAD proof** (`logs/s09/s09b-PREEXISTING-paired-base-head.log`) now carries what
r2's lacked: base commit `e040b1ee5322b3343987632659509e963d0ccd05` AND base tree
`2131932e0ce3bd12a40ea045b2bdd3910b8e9050`, the worktree tree actually produced by the base
checkout (`a92beced` — the base tree plus this lane's files that a pathspec checkout cannot
remove, with the disposition stated: the two selected tests neither import nor are imported by
them), base-side porcelain, the exact commands, and the HEAD arm's commit, tree and clean
porcelain. Identical failure signature on both arms; cause-change NONE.

**Zone set-equality (packet step 5).** `pnpm exec vitest run tests/unit` at the filed tip:
`Test Files 6 failed | 99 passed (105)` · `Tests 7 failed | 1047 passed (1054)`, EXIT=1, and **0 mutant tokens** in the log (the contamination check F-S09-9 exists to make routine). The failing
NAMES are exactly the 7 `tests/unit/` names in the D15 batch-b8 authority's 23-name stable-red
set — **NEW 0, VANISHED 0**:

```
tests/unit/load01-run-projection.test.ts > LOAD-01 … prioritizes terminal failure
tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > … runs ZI-1..ZI-4
tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > passes all 15 required falsification mutants
tests/unit/pro01-runner-tree.test.ts > PRO-01 … RUN_COST_ENVELOPE_EXHAUSTED path
tests/unit/s6-content-encryption.test.ts > S6 per-run private content encryption > …
tests/unit/v2ui-node-runner.test.ts > HYG-01 v2-ui Node test gate > …
tests/unit/xrev01-node-review.test.ts > XREV-01 … model-call envelope is exhausted
```

**The two failures inside my cluster are PRE-EXISTING, and named:**

1. `tests/unit/pro01-runner-tree.test.ts > PRO-01 depth-driven pro/con expansion > stops a
   defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
2. `tests/unit/xrev01-node-review.test.ts > XREV-01 cross-maker node review > stops a review
   loudly when the ratified model-call envelope is exhausted`

Both are members of the **D15 batch-b8 authority's 23-name stable-red set**
(`logs/integration-suite-b8.log`, lines 40914 and 40986). They are not absorbed under a blanket
claim: `logs/s09/PREEXISTING-paired-base-head.log` carries the **paired base↔HEAD payload**
(T1-B2 lesson / J12 treatment). Base `e040b1ee` (pristine tree `e526e5b4` checked out over the
worktree) and filed tip `265581b2` both produce `2 failed | 13 passed (15)` with the **identical
failure signature**:

```
AssertionError: expected Error: UNEXPECTED_CLIENT_QUERY:SELECT pg_… to match object { code: 'RUN_COST_ENVELOPE_EXHAUSTED' }
+   "message": "UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
```

**Cause-change: NONE.** Their fake pool matches `sql.includes("pg_advisory_lock")`, which does
not match the real `pg_try_advisory_lock` the content-provision path issues — a fixture defect
that predates this lane and is untouched by it. Filed as a finding (§7, F-S09-3).

**D14/D16 do not trigger, with evidence.** The diff touches no `web/` or `apps/ui` file
(17-file diffstat in §9), and neither Next app consumes `@debateai/register` or
`@debateai/budget` — `grep -rn "@debateai/register\|@debateai/budget" apps/ui web` returns
**empty**. D16 extends D14 to lanes changing `packages/contract` or `packages/kernel`; this lane
changes neither. Recorded rather than silently skipped.

---

## 6b. THE STALE-STAMP CHECK — D27 ADDENDUM-3 final form, output verbatim

Two earlier forms of this check were defective, both the orchestrator's: r2's resolved `HEAD`
against the MAIN checkout instead of the lane, and r3's `grep -m1 -oE '[0-9a-f]{40}'` stops at
the first matching LINE but prints EVERY hash on it, so a header carrying
`commit=<40hex> tree=<40hex>` emits two and the field comparison misreads. Re-run in the FINAL
standing form — commit field extracted specifically, scoped to THIS round's logs by prefix so
superseded sets do not report as stale, resolved TIP printed above the output:

```
$ LANE=/Users/.../.worktrees/lane-s09
$ LOGS=/Users/.../reports/2026-09-01-algorithm-live-loop/logs/s09
$ TIP=$(git -C "$LANE" rev-parse HEAD); echo "TIP=$TIP"
TIP=265581b27250094bfc3c5f12e65d1338bf3e7f0c
$ for f in "$LOGS"/s09b-*.log; do \
    c=$(grep -m1 -oE 'commit=[0-9a-f]{40}' "$f" | head -1 | cut -d= -f2); \
    [ "$c" = "$TIP" ] || echo "STALE $f -> ${c:-NO-STAMP}"; done
$
```

All **7** in-scope logs lead with `commit=265581b27250094bfc3c5f12e65d1338bf3e7f0c`, confirmed
positively and not merely by the absence of a STALE line:

```
s09b-GATE-typecheck.log                265581b2…
s09b-GREEN-S09-C1-run1.log             265581b2…
s09b-GREEN-S09-C1-run2.log             265581b2…
s09b-GREEN-S09-C1-run3.log             265581b2…
s09b-MUTANTS-t17.log                   265581b2…
s09b-PREEXISTING-paired-base-head.log  265581b2…
s09b-ZONE-unit-HEAD.log                265581b2…
```

The 8 superseded r1–r3 logs are out of scope by prefix, as the ruling requires, and
`s09b-ZONE-unit-HEAD.CONTAMINATED.superseded` (F-S09-9) is retained rather than deleted and is
not a `.log`.

**The check earned its keep on first use.** It flagged `s09b-MUTANTS-t17.log` as `NO-STAMP`: my
mutation harness wrote `campaign tip: <hash>`, not the `commit=` FIELD the comparator extracts.
The tip in that log was correct — but a comparator that cannot read a fact is not evidence of
it, which is the lesson D27 ADDENDUM-3 was written from. Editing the log to insert a stamp would
have been fabricating evidence, so the harness header was fixed and the campaign **re-run in
full** against the same tree. All twelve verdicts reproduced identically (M1 15, M2 14, M2b 12,
M7 12, M8 31, M6 6, M3 4, M4 7, M5 4, M9 4, M10 4 caught; N1 at the floor), which is itself a
reproducibility check the round did not otherwise have.

---

## 7. REFUTATION CAMPAIGN — D24 + ADDENDUM + ADDENDUM-2

Harness `logs/s09/s09b-MUTANTS-t17.log`. **Porcelain empty before the first apply** (D24
ADDENDUM-2 gate) and after every restore. Each mutant is an (OLD, NEW) pair; the transcript
prints NEW verbatim between `<<<TOKEN` / `TOKEN>>>`; `pre=0 → applied>0 → restored=0` are hard
gates that abort; every mutant carries its diff, its discriminating result, its restore command,
and sha256 on **both** sides with the equality check.

Campaign tip `265581b2`, tree `adbf8382` — re-run in full at the S09B tip with two further
mutants (M9, M10). Exit 0.

| id | PROPERTY (stated before the assertion) | mutation | result | verdict |
|---|---|---|---|---|
| M7 | The serve leg counts the post-compose organ ONCE PER RUN, not once per recompose round | `mr*perRound + perRun` → `mr*(perRound + perRun)` | `12 failed \| 87 passed (99)` | **CAUGHT** |
| M8 | The composition leg is DECOMPOSED, never taken as `maxRecompose * fixedOrgansPerComposition` | `1 + segmentCap` → `fixedOrgansPerComposition` | `31 failed \| 67 passed (98)` | **CAUGHT** |
| M9 | J28: spending exactly `max` is WITHIN, and the served answer survives | `<=` → `<` (the pre-J28 comparison) | `4 failed \| 95 passed (99)` | **CAUGHT** |
| M10 | The receipt refuses a serve call-site count that disagrees with the selected arm | coherence check disabled | `4 failed \| 95 passed (99)` | **CAUGHT** |
| M1 | The ceiling counts (M−1) panel calls at EVERY materialized node, not just at the roots | `(M−1)*materializedNodes` → `(M−1)*panelSize` | `15 failed \| 84 passed (99)` | **CAUGHT** |
| M2 | A cooldown site's allowance is `judge + final`, counted cumulatively per call-site key across BOTH sequences | `judge + final` → `judge` | `14 failed \| 85 passed (99)` | **CAUGHT** |
| M2b | The allowance is NOT two fresh sequences — the over-count the ledger refuted must STAY refuted | `judge + final` → `2*judge + final` (r1's error) | `12 failed \| 87 passed (99)` | **CAUGHT** |
| M6 | An over-bound depth is refused above the SEALED maximum, at admission | `depth > maxDepth` → `depth > maxDepth + 90` | `6 failed \| 93 passed (99)` | **CAUGHT** |
| M3 | The serve leg follows the LARGER of the two mutually exclusive serve chains | `Math.max(comp, loop)` → `comp` | `4 failed \| 95 passed (99)` | **CAUGHT** |
| M4 | An invalid or omitted ceiling term refuses LOUDLY at admission, as a typed AskRefusal | `TypedDomainError` → `TypeError` | `7 failed \| 92 passed (99)` | **CAUGHT** |
| M5 | The run head REFUSES a stale DR-184-v2 basis rather than enforcing its undercount | `panel_member`/`cooldown_site` → `.optional()` | `4 failed \| 95 passed (99)` | **CAUGHT** |
| **N1** | **NEIGHBOUR** — the basis provenance string is recorded, not asserted; must NOT be caught | `bounds_source_ref` → `"…+neighbour-n1"` | `2 failed \| 97 passed (99)` (the floor) | **NOT CAUGHT ✔** |

**M2b is the guard on r1's own mistake**: it re-applies the very over-count the ledger refuted
and the suite now rejects it. Pre-existing floor = 2. `CAUGHT` means strictly more failing tests
than the floor. All sha256 values returned equal after restore, porcelain was empty before the
first apply and after every restore, and the final tree `adbf8382` = the filed tree.
**M7 and M8 are r3's guards on the serve over-count**: M7 bills the post-compose organ per
round again, M8 restores the `maxRecompose * fixedOrgansPerComposition` expression. Both are
rejected, as M2b rejects r2's retracted cooldown expression. **M8's total is 98, not 99**: under
that mutant the integration file fails to COLLECT, so its one test leaves the count entirely
rather than being reported as failing. My r3 transcript recorded M8's passed-count one too high
for exactly this reason — the off-by-one the S09B sweep caught.
**M9 and M10 are S09B's**: M9 restores the pre-J28 `<` comparison, M10 disables the serve-arm
coherence check.

**Harness note (D24 ADDENDUM-2, self-caught in r2):** a 2-minute foreground timeout killed the
campaign mid-mutation and left a mutant applied in the tree. The tree was restored from the
commit and hash-verified before re-running — which is the reason ADDENDUM-2 requires a committed
tip. Re-run in the background thereafter.

### The campaign found a real hole in r1, and the LEDGER found the bigger one in r2

**On r1's first campaign run M5 was NOT CAUGHT.** My "refuses a stale DR-184-v2 basis" assertion
passed with `panel_member`/`cooldown_site` optional, because the v2 fixture is refused for
*several* reasons at once — so the assertion pinned "some field is missing", not the property
written above it. That is precisely the corpus failure the refutation duty exists to catch: an
assertion that pins its demo case and nothing behind it.

Repair (commit `0412689d`): each disclosure field is now dropped **individually** from an
otherwise-valid v3 basis and the run head must still refuse — six cases covering
`per_site_attempts.{panel_member,cooldown_site}`, `call_sites.{panel,reviewer}`,
`serve_leg.{selected,synthesis_loop_sites}`. M5 is caught on the re-run.

**Also self-caught in r1:** the first harness's verdict oracle counted `" FAIL "` lines and
returned **zero for every mutant** while the parsed summary showed 14/13/3/7/2/2 — every verdict
printed NOT_CAUGHT. A non-discriminating oracle inside the harness that exists to prevent
non-discriminating oracles (D24 ADDENDUM's own lesson). Fixed to read the parsed count and to
ABORT when a run yields no `Tests` summary at all.

**And the limit of the whole campaign, which r2 exposes.** In r1 all five mutants were CAUGHT
and the neighbour was not — a clean sheet. It proved nothing about the cooldown term, because
the assertions, the enumerator and the formula all shared one wrong reading of
`withCooldownRetry`; every mutant was measured against the same wrong oracle. A mutation campaign
tests whether assertions PIN the code, never whether the code matches the world. Only the ledger
could do that. See F-S09-7.

---

## 7b. THE MAXIMUM-PATH LEDGER TEST — `tests/integration/t17-envelope-ledger.test.ts`

A real M=2 debate driven to completion, with **every reachable namespace at its last allowed
attempt**:

- cooldown-wrapped judge sites (8 author + 8 reviewer): **4 attempts each** — the two sequences
  share one cumulative allowance.
- panel sites (8): **3 attempts each** — one sequence, no cooldown wrap.
- serve sites (7): **3 attempts each**. Round 1's conformance returns a VALID but false verdict,
  so the recompose loop runs a second round which then passes — the run still completes. This is
  what r2's fixture did not do: it gave the serve organs a zero failure budget and always
  answered `conforms: true`, so one round ran and four serve calls answered first time.

Read back **from that run's own ledger**:

| assertion | value |
|---|---|
| distinct `PANEL:%` sites / attempts | **8 / 24** |
| every `JUDGE:%` site's attempts | exactly **4** |
| serve sites, per key | `COMPOSER:1=3 COMPOSER:2=3 CONFORMANCE:1:0=3 CONFORMANCE:1:1=3 CONFORMANCE:2:0=3 CONFORMANCE:2:1=3 POST_COMPOSE_R9:2=3` |
| serve site count | **7** (not the 8 the old term billed) |
| total `MODEL_CALL` attempts | exactly **109** |
| ceiling | exactly **109** — the ceiling is TIGHT at the true maximum |
| observed > v2 ceiling (88) | **yes** — the old ceiling would have refused this lawful run |
| terminal `ENVELOPE_STATE` | **EXHAUSTED** — see F-S09-8 |

### The 92-attempt run, correctly described

r2's run spends **92** attempts. It is a **BRACKETING run, not a maximum**: it maximises the
author, panel and reviewer legs and leaves the serve leg at first-attempt. What it proves stands
and is worth keeping — 92 > 88, so **the old ceiling would have refused a lawful run** — but it
is not the maximum and is not quoted as one here, in the packet, or in D35 (corrected).

---

## 8. THE W12 FLAGSHIP ASSERTION — written, and what it needs

The DoD's ledger-count clause is asserted **from the same ledger**, in the two live proofs that
V's ceremony runs. J18 routes their EXECUTION to the W12 flagship ceremony.

`acceptance/run-acceptance.ts` already read the observed attempt count
(`count(*) FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'`) and the
pinned ceiling (`envelope_basis->>'max_model_attempts'`), and the two proofs already refused
`modelCallCount > structuralCeilingMaxModelAttempts`. **Panel attempts are included**: panel
calls go through the same `ProviderGateway`, so they are ledgered `MODEL_CALL` like every other
call — which is exactly why a ceiling that counted none of them was dangerous.

What this lane ADDED — the "envelope WITHIN at terminal" half:

- `run-acceptance.ts` now reads the TERMINAL envelope state from the same run's progress stream
  (`SELECT DISTINCT ON (kind) … WHERE kind='ENVELOPE_STATE' ORDER BY kind, at_seq DESC` — the
  same last-value-wins read `RunRepository.readCurrentState` uses, so it is the terminal value
  and not the `WITHIN` the run head was seeded with), validates it against
  `{WITHIN, EXHAUSTED}`, prints it, and exposes it as `LiveAcceptanceCeremony.terminalEnvelopeState`.
- `acceptance/panel01-depth1-proof.ts` and `acceptance/xrev01-depth1-proof.ts` now throw
  `…_ENVELOPE_NOT_WITHIN_AT_TERMINAL:<state>:<observed>/<ceiling>` unless the terminal state is
  `WITHIN`.

**What the W12 run needs to execute it:**

1. A **real M≥2 live provider run** at depth 1 through `panel01-depth1-proof.ts` /
   `xrev01-depth1-proof.ts` (ceremony law: one attempt after preflight). These are standalone
   `tsx` scripts, not vitest — they are not executed by any suite, by design (J18).
2. The acceptance register seeded at `ACCEPTANCE_REGISTER_VERSION` **including the T16
   `envelopeFormulaInputs` row** — `acceptance/seed-register.ts` already seeds it via
   `buildAlgorithmRegisterRows`. Without it `readAcceptanceRuntimePolicy` now stops loudly with
   `ENVELOPE_FORMULA_INPUTS_UNRESOLVED` *before* any provider spend, which is the intended shape.
3. Nothing else. Both halves read the run's own ledger; no new fixture and no new flag.

**Expected numbers at the ceremony** (M=2 or 3, depth 1, judge/organ bounds 3, final 1): ceiling
**109** at M=2 and **231** at M=3, against an observed count that on a clean run spends one
attempt per site — roughly 8 author + 8 panel + 8 review + 4 serve at M=2, so about 28. The run
should land far inside the ceiling and stay WITHIN at terminal; a run that does NOT is the cost
defect this lane exists to surface. Two in-lane runs bracket it: the maximum path spends exactly
109, and the earlier bracketing run spends 92.

---

## 9. Diff — **17 files, +1408 / −54** vs `e040b1ee` (refreshed at the S09B tip)

```
acceptance/panel01-depth1-proof.ts                  envelope-WITHIN terminal assertion
acceptance/run-acceptance.ts                        terminal ENVELOPE_STATE read + expose
acceptance/runtime-policy.test.ts                   recomputed pin, sealed row in the fixture
acceptance/runtime-policy.ts                        read the sealed row; drop 4 RUNNER_* re-declarations
acceptance/xrev01-depth1-proof.ts                   envelope-WITHIN terminal assertion
apps/api/src/main.ts                                read the sealed row; drop 4 ENGINE_* re-declarations
packages/budget/src/index.ts                        receipt schema + coherence refinement; J28 comparison
packages/register/src/algorithm-policy.ts           maxDepth sealed into envelopeFormulaInputs
packages/register/src/index.ts                      DR-184-v3 formula, decomposed serve leg, member validation
tests/integration/obs-l3-s06-runner-binding.test.ts basis fixture
tests/integration/t17-envelope-ledger.test.ts  537+ NEW — the maximum-path LEDGER test
tests/support/discoveredPanel.ts                    shared basis fixture
tests/unit/budget-s09.test.ts                       J28 boundary pinned on both sides
tests/unit/dr181-ceiling.test.ts                    independent enumeration gains the panel leg
tests/unit/dr184-review-resilience.test.ts          recomputed grid, bumped version
tests/unit/register-s09.test.ts                     88 → 109
tests/unit/t17-envelope.test.ts                404+ NEW — the T17 unit cluster
```

Added test lines: `t17-envelope.test.ts` **404**, `t17-envelope-ledger.test.ts` **537**.
Every diff-count reference in this report is this one measurement (codex r2 B2).

---

## 10. FINDINGS (a finding is a finding — each carries a file, a line and a fix)

Codex r1 independently verified all five r1 findings as materially accurate; they stand as
written, with the D30 consequence added to F-S09-3. r2 adds F-S09-6 and F-S09-7.

**F-S09-1 · NON-BLOCKING, but it is a live-deploy hazard.**
`packages/budget/src/index.ts:36` `costEnvelopeBasisSchema` is `.strict()`, so a run admitted
**before** this change carries a DR-184-v2 basis that the runner will now refuse with
`RUN_COST_ENVELOPE_UNRESOLVED`. This is deliberate — enforcing a known undercount against a live
panel is worse than a loud stop, and loud-on-missing is the mission's own law — but it means
in-flight runs across the deploy boundary die and must be re-asked. *Fix:* a D25 migration-registry
row for the deploy, or a drain before rollout. **Not mine to decide; routing to V/the orchestrator.**

**F-S09-2 · NON-BLOCKING (fixed in this lane, recorded because the class matters).**
`packages/register/src/index.ts:178` (v2) validated `Object.entries(input)` — only the members a
caller *happened to pass*. An omitted member reached the arithmetic as `undefined` and minted a
**`NaN` ceiling in silence**; `parseCostEnvelopeBasis` would then refuse it downstream, far from
the cause. Now validated by declared-member list. Same class as D27 ADDENDUM's "an assertion no
run can fail".

**F-S09-3 · NON-BLOCKING, pre-existing, NOT MINE.**
`tests/unit/pro01-runner-tree.test.ts:157` and `tests/unit/xrev01-node-review.test.ts` (fake
client) match `sql.includes("pg_advisory_lock")`, which does **not** match the real
`pg_try_advisory_lock(hashtextextended($1,0))` the content-provision path issues. Both tests are
in the b8 authority's stable-red set for this reason. *Fix:* match `pg_try_advisory_lock` (and
`pg_advisory_unlock`) in the two fake clients. Out of my contract; ticketable as a one-line fixture fix.
**Codex r1 adds the D30 consequence, recorded here so it is not lost:** these two names are
HISTORICAL BASELINE EVIDENCE only — once the fixtures are fixed and the merged base is rederived,
they must be REMOVED from the authority/allowlists, never preserved as authorized red.

**F-S09-4 · NON-BLOCKING, for T9's seat / W12.**
`apps/runner/src/index.ts:1103` `WalkingSkeletonSettings.maxRecompose` — the packet says it "has
no runner reader left". That is true only on lane/s07's **unmerged** tip; at `e040b1ee` the serve
gate chain still reads it, which is why the composition leg had to stay in the formula. After T9
merges, `maxRecompose`/`fixedOrgansPerComposition` become dead weight in the `max()` and the
serve leg should reduce to the loop term alone. *Fix:* at W12, re-verify §1 and consider dropping
the composition arm.

**F-S09-8 · CLOSED BY J28 (was: needs a ruling).**
`assertModelAttemptAllowed` refuses at `consumed >= max` while `decideBudgetPressure` reported
WITHIN only at `consumed < max`, so a run that spent exactly the permitted maximum reported that
it had run out — **and the runner then replaced the answer it had just served with the envelope
terminal** (`apps/runner/src/index.ts:3267-3274`). J28 ruled the default: reporting follows
permission, WITHIN while `consumed <= max`. Applied in `packages/budget/src/index.ts`; nothing
about what is allowed changed. Both sides of the boundary are pinned in `budget-s09.test.ts`, the
integration test asserts the served answer survives, and mutant M9 keeps the old comparison
rejected. **V-S09-8 stands open as V's**: the alternative reading (EXHAUSTED at exactly the
ceiling as a deliberate signal, with the Global DoD sentence read as "did not reach the ceiling")
is legitimate and is V's to choose. The flagship run is unaffected either way — about 28 of 109.

**F-S09-9 · CLOSED BY D38. My own process error, self-caught (new in S09B).**
I started the `tests/unit` zone and the mutation campaign concurrently in the SAME worktree. The
campaign mutates `packages/register/src/index.ts` in place, so the zone read mutated source and
reported **6 NEW failures** that were pure contamination — the smoking gun is
`STRUCTURAL_CEILING_REVIEWERCALLSPERNODE_INVALID_MUT4` in its log, which is mutant M4's own NEW
token (5 occurrences). No product regression existed. The run is retained as
`logs/s09/s09b-ZONE-unit-HEAD.CONTAMINATED.superseded` rather than deleted, and the zone was
re-run SOLO against a tree verified clean (`porcelain []`, 0 mutant tokens in source). *Fleet
consequence, now ruled:* D24 ADDENDUM-2 required a campaign to START from a committed tip and
refuse a dirty tree — it did not stop a campaign from DIRTYING the tree under a concurrent
reader. **D38 now requires a campaign to take the worktree exclusively, with a marker file other
runners refuse to run against.** The solo re-run below carries 0 mutant tokens, which is the
check that makes this class self-detecting rather than a judgement call.

**F-S09-6 · NON-BLOCKING, routes to T1 (new in r2).**
The 1..5 expansion-depth bound is now stated in THREE places: `apps/runner/src/index.ts:1317`
(`resolveExpansionDepth`), `packages/budget/src/index.ts:47` (the stored-basis schema), and the
sealed `envelopeFormulaInputs.maxDepth` row this lane added. I added the third deliberately —
the DoD requires the refusal AT ADMISSION and the other two are unreachable from there
(`packages/budget` already depends on `packages/register`, so register→budget is a cycle; and
`apps/api` has no budget edge, which the 28-row scaffold table forbids adding). I did not touch
either existing literal: J6 puts `packages/budget`'s copy on **T1's** surface and T1 is unmerged.
*Fix:* when T1 lands, both code literals derive from the sealed row (or from T1's single contract
constant) and the count returns to one.

**F-S09-7 · NON-BLOCKING, method finding (new in r2).**
The r1 maximum-path test enumerated call sites in memory and compared that sum to the closed
form. Both were models of the same mistaken reading of `withCooldownRetry`, so they agreed, and
the mutation campaign could not see it either — every mutant was measured against the same wrong
oracle. **A second model is not a second opinion.** The ledger test found it in one run. Worth
recording as fleet method: when a formula claims a runtime quantity, at least one assertion must
read that quantity from the artifact the runtime actually writes.

**F-S09-5 · NON-BLOCKING, disclosed for the claim-lease.**
`acceptance/main.ts:451-457` sets `claimMs = longestDeadline * maximumRunAttempts + …`, where
`maximumRunAttempts` is the ceiling at (panelSize, depth=5). The ceiling grows by the panel leg
net of the serve correction (1048 → **1429** at M=2/d=5), so the claim LEASE lengthens
proportionally. That is a lease, not a
timeout on work, and a longer lease is the safe direction — but it is a real behaviour change and
is named rather than absorbed.

---

## 11. TOOLING TRAP — for the orchestrator to append (outside my write contract)

`.hermes/TOOLING-TRAPS.md` is NOT on my allowed list (and another seat has it modified), so I
record the trap here rather than crossing my contract to append it:

> **vitest's ` FAIL ` summary lines are not a reliable oracle from captured output.** A mutation
> harness that greps `subprocess` stdout for `"^ FAIL "` gets **0 matches for every mutant**
> while the `Tests N failed | M passed` summary in the same buffer is correct — so every mutant
> silently reads NOT_CAUGHT and the campaign "passes" having proved nothing. Parse the `Tests`
> summary count instead, and make the harness **ABORT** when a run yields no `Tests` line at
> all. Same class as the existing vitest dedup trap: the human-facing output is not the
> machine-readable one. (s09-envelope; caught by the neighbour mutant behaving identically to
> the real ones)

> **A mutation campaign cannot tell you the code is wrong about the world.** r1's campaign was a
> clean sheet — five caught, neighbour untouched — over a formula whose central term was wrong,
> because the assertions, the independent enumerator and the code all shared one misreading of a
> retry helper. Mutants test whether assertions PIN the code. When a formula claims a RUNTIME
> quantity, at least one assertion must read that quantity from the artifact the runtime writes
> (here: `ledger.ledger_entry`). (s09-envelope; the ledger's first run refuted the term.)

> **A "maximum path" fixture is only maximal where its failure budget is non-zero.** The r2
> ledger run drove author, panel and reviewer legs to their last attempt and gave the serve
> organs a budget of zero, so it read as a maximum while one whole namespace answered first
> time — and the constant governing that namespace stayed unmeasured for another round. Before
> calling a run maximal, list the namespaces it can reach and show each one's budget. (s09;
> caught by codex r2, cost a round.)

> **A constant of the form `perThing * rounds` is a claim about WHERE the thing happens.**
> `ENGINE_FIXED_ORGANS_PER_COMPOSITION = 1 + segmentCap + 1` bundles two per-round organs with
> one per-RUN organ; multiplying it by the rounds bills the per-run one repeatedly. Decompose
> such constants against the loop they are multiplied by, or count the sites. (s09; the same
> class as the cooldown term, found by the same ledger.)

> **`withCooldownRetry`'s two sequences are NOT two fresh allowances.**
> `createPostgresProviderGateway` (`apps/runner/src/index.ts:3565-3577`) counts attempts
> cumulatively per call-site key off the ledger and passes `remaining = maxAttempts - consumed`.
> A site's total is `bound.maxAttempts` as raised by the caller, never the sum of the sequences.
> Anyone costing retries from the helper alone will over-count. (s09-envelope; cost a wrong
> ceiling in r1.)

> **A mutation campaign must hold its worktree EXCLUSIVELY.** D24 ADDENDUM-2 makes a campaign
> refuse a DIRTY tree; it says nothing about a campaign dirtying the tree under a concurrent
> reader. Running a suite beside one produces failures that look like regressions and are not —
> here, six of them, betrayed only by the mutant's own token appearing in the other run's log.
> Never run anything else in a worktree while a campaign is applying mutants; if a run overlaps
> one, discard it and re-run solo against a verified-clean tree. (s09-envelope S09B, self-caught.)

Also worth adding beside the existing `git checkout <sha> -- <path>` entry: the correct paired
restore for a worktree whose work is already committed is
`git restore --source=HEAD --staged --worktree <path>` — it clears BOTH the index and the
worktree in one call, where `git checkout HEAD -- <path>` leaves the staged revert behind.

---

## 12. Constants I chose — full disclosure

**None.** Every policy value is read from T16's sealed `envelopeFormulaInputs` row. The only
numbers written in this lane are (a) the *expected* values in test pins, derived from the
formula and cross-checked against an independent per-site enumeration that walks the runner's
own exported plans (`buildMultiMakerExpansionPlan`, `buildCrossRootExchangePlan`), and (b) the
literal `88` in one test, named explicitly as the DR-184-v2 undercount being repealed so the pin
cannot silently drift back to it. r2 adds one SEALED value — `maxDepth: 5` — in the T16 row, not
in code (see §4 and F-S09-6).

r3 removes one more unmeasured premise rather than adding a value: the composition leg is now
decomposed from `compositionSegmentCap` and `maxRecompose` (both already sealed) plus one
per-run organ, with a loud stop if the sealed `fixedOrgansPerComposition` disagrees.

The one **structural judgement** I made and am flagging for review: `max(compositionSites,
synthesisLoopSites)` encodes "the two serve chains are mutually exclusive". True at this base and
true after T9, but it is a claim about a merge that has not happened. It is disclosed on every
receipt via `serve_leg.selected` so it is auditable rather than buried.

---

# T17B — the refused-attempt equality boundary (B1) and the receipt's larger-arm invariant (B2)

Seat `opus-s09-w9b` · V-authorized post-cap correction (rows **V-S09-CODEX-S09B-1** and
**S09B-2**, 2026-09-03) · rework round 0/3 · lane `lane/s09`
merged base `19bbb4c4` · filed tip `55354f4f` · tree `a36d473a` · mode changes 0

| commit | what |
|---|---|
| `5bf8960f` | merge: integration 19bbb4c4 into lane/s09 (TINT1, T6, S06, T7, S08, T6B, T3C) |
| `59f23153` | merge repair: provision T7's sealed adaptive-stopping rows in the S09 fixture |
| `0f04fecd` | **B1** — the refused-attempt equality context stops sharing J28's branch |
| `ab2f508c` | **B2** — the receipt's second and third cross-field checks; refusals name themselves |
| `55354f4f` | restore a discriminating pin to the landed count check (campaign finding) |

T17B numstat against the merge commit, four files, no others:

```text
30	9	dialectical-engine/apps/runner/src/index.ts
91	5	dialectical-engine/packages/budget/src/index.ts
167	0	dialectical-engine/tests/integration/t17-envelope-ledger.test.ts
104	0	dialectical-engine/tests/unit/t17-envelope.test.ts
```

## 0. The merge — a clean auto-merge that was NOT green

Lane `lane/s09` was 39 commits behind integration. The packet's constants verified: 39 behind,
7 ahead, merge-base `e040b1ee`. `git merge-tree` predicted tree `ad6f5423` with **no conflicted
paths**, and the real merge produced exactly that tree. The reason is measurable: the file sets
the two sides touched are **disjoint** — `comm -12` over the two `diff --name-only` lists is
empty. The lane never touched `apps/runner/src/index.ts`; integration rewrote it.

**A clean auto-merge is not a green merge.** The S09 integration test failed immediately after
it, and not by a line number:

```text
TypedDomainError: J12: a multi-maker run requires the sealed T16 adaptive-stopping rows
(globalStopDelta, branchFreezeEpsilon); they are read from the register and never invented
 ❯ WalkingSkeletonRunner.execute apps/runner/src/index.ts:2002:13
```

T7 added a guard beside `panelPolicy`'s: a multi-maker run without the sealed stopping rows
stops loudly before any model call. This fixture constructs the runner directly and predates
that guard. **Nothing textual overlapped; the coupling was through a settings object.** A
merge-conflict review would never have found it — only running the suite does.

Repair is provisioning only, using the values the landed lane uses in its own
`tests/integration/database.test.ts`. **No landed assertion was weakened.** The landed lane
claims δ=0/ε=0 is "set WIDE OF the fixtures' arithmetic so no existing fixture's expansion is
truncated"; that claim is not taken on trust — the maximum-path test still requires seven serve
sites, both composition rounds and **exactly 109** observed attempts, and it passes, which is
the measurement that a truncating δ/ε would have failed.

Lockfile, `package.json` and contract sources did **not** move in the merge range (the grep over
`git diff --name-only 265581b2 5bf8960f` for `lock|package.json|contract|.sql|schema` is empty),
so `pnpm install --frozen-lockfile` and `generate:contract` were not re-run; the gate records'
PROVISIONING blocks carry the resolved lockfile hash and generated-contract manifest anyway.

## 1. B1 — two equality contexts, one branch

`assertModelAttemptAllowed` refuses a NEXT provider call while `consumed >= max`. The runner
caught that `RUN_COST_ENVELOPE_EXHAUSTED` and accepted the catch only when a re-evaluation
returned `HARD_STOP`. Post-J28 that re-evaluation returns **WITHIN** at equality, so the runner
rethrew: the run reached neither the ruled components-only terminal nor an `ENVELOPE_EXHAUSTED`
record.

The root cause, stated as the two questions that were sharing one branch whose only input was
the post-consumption count — and which have **opposite** answers at `consumed == max`:

| question | asked by | at equality |
|---|---|---|
| has this run spent MORE than it was allowed? | the completed-run reporter | no → `WITHIN` (J28) |
| may this run spend ANOTHER attempt? | `assertModelAttemptAllowed` | no → `HARD_STOP` |

**Fix.** `decideBudgetPressure` takes `pendingModelAttempts` (default 0) and compares
`consumed + pending <= max`. At the default this is J28's comparison unchanged; the refusal
catch — and only it — asks with 1. The caller now *says* which question it is asking instead of
the branch guessing from a number that cannot distinguish them.

Citations, re-derived at `55354f4f` and proven unique by `tools/cite-check.py` (D53/D55):

| site | anchor |
|---|---|
| `packages/budget/src/index.ts:288` | `if (input.consumedModelAttempts + pendingModelAttempts <= input.basis.maxModelAttempts) {` |
| `packages/budget/src/index.ts:407` | `if (await this.countRunModelAttempts(runId) >= basis.maxModelAttempts) {` |
| `apps/runner/src/index.ts:3520` | `const evaluateEnvelope = (pendingModelAttempts = 0): Promise<BudgetPressureDecision> =>` |
| `apps/runner/src/index.ts:3782` | `const exhausted = await evaluateEnvelope(1);` |

**Consumer trace (D51 — traced, not inferred).** `decideBudgetPressure` has exactly one
production caller, `evaluateRunPressure` (`packages/budget/src/index.ts:423`); that has exactly
one production caller, the runner's `evaluateEnvelope` (`apps/runner/src/index.ts:3521`).
`parseCostEnvelopeBasis` has two production callers — `readPinnedBasis` (which
`assertModelAttemptAllowed` uses) and run admission at `apps/runner/src/index.ts:2106`. No other
call path reaches either change.

### The RED that no existing test could produce

The existing tests covered direct reporting at `max` and `max+1` and a **completed** maximum
path. None entered the refusal path. The new test drives the RUNNER into it, and the number it
uses is not chosen to fit: the run is admitted under a receipt that undercounts its serve leg,
with `max_model_attempts = 88` — **the DR-184-v2 ceiling this same file proves this same
topology breaches.** The judge, reviewer and panel legs spend all 88, the initial evaluation
reports WITHIN (J28, unchanged), the serve chain is entered, and its first provider call is
refused at equality.

RED — `logs/s09/t17b-RED-B1-runner-refusal-boundary.log`. The stack is the causal evidence, not
a reading of the diff:

```text
TypedDomainError: Run 603f7a2d-… exhausted its pinned computed structural ceiling
 ❯ BudgetRepository.assertModelAttemptAllowed packages/budget/src/index.ts:327:13
 ❯ callWithContentContract apps/runner/src/index.ts:1186:12
 ❯ Object.compose apps/runner/src/index.ts:3664:26
 ❯ runServeGateChain packages/serve/src/index.ts:506:22
```

The error left `executeWorkItem` entirely — that is the rethrow, observed.

GREEN — `logs/s09/t17b-GREEN-B1-runner-refusal-boundary.log`, `Tests 2 passed (2)`: the new
refusal test and **J28's successful-terminal WITHIN test in the same run.**

## 2. B2 — a receipt naming the smaller arm still parsed

r3 required TWO independent cross-field checks. Only the first was built, so this receipt
parsed:

```text
call_sites.serve = 6
serve_leg = { composition_sites: 7, composition_sites_per_round: 3,
              post_compose_sites_per_run: 1, synthesis_loop_sites: 6,
              selected: "SYNTHESIS_LOOP" }
```

The count check compares `serve` against whichever arm **the receipt itself nominated**, so it
can never ask whether that nomination is the one the constructor would have made. The
constructor computes `max(7,6) = 7`, bills seven sites and selects `COMPOSITION`
(`packages/register/src/index.ts:306` and `:337`). The accepted receipt claimed the opposite
topology and a smaller ceiling leg than the run was admitted under.

**Fix.** The parser now also requires `call_sites.serve === Math.max(both arms)`
(`packages/budget/src/index.ts:109`) and `selected` to equal the constructor's declared tie
policy (`:117`). The tie policy is load-bearing precisely at a **tie**, where both arms are the
larger arm and no count comparison can distinguish the nominations.

**And the refusal now names which check refused** (`packages/budget/src/index.ts:166`). Every
basis defect previously produced one identical sentence. That is the D56 shape: a guard whose
firing cannot be observed cannot be shown to fire for the reason it exists — and two guards
indistinguishable at the surface are indistinguishable to a mutant, so one can be deleted with
every test still green. The error CODE is unchanged and the original sentence is kept as the
prefix, so the landed consumers and the landed assertion that matches that sentence still pass.

RED — `logs/s09/t17b-RED-B2-receipt-smaller-arm.log`, `Tests 2 failed | 36 passed (38)`, both
failing as `expected function to throw an error, but it didn't`: the parser accepted the
smaller-arm receipt **and** a tie misselected as SYNTHESIS_LOOP.
GREEN — `logs/s09/t17b-GREEN-B2-receipt-smaller-arm.log`, `Tests 38 passed (38)`, clean tree.

### The structural fact I am disclosing rather than dressing up

The three cross-field guards **overlap by construction: any two imply the third.** No input can
make exactly one of them fire. That is why each is pinned on the refusal MESSAGE it produces
rather than on the bare fact that something refused — which is the only mechanism that makes
each one individually killable. Without it the smaller-arm test would have been satisfied by
either guard alone and could not tell a two-check parser from a one-check parser, **which is
exactly how the first hole survived review.**

## 3. Refutation evidence — the campaign

D38 custody, which no mission tool implements: `logs/s09/t17b-launch.sh` refuses while a marker
exists, and `logs/s09/t17b-CAMPAIGN-CUSTODY.log` records the full chain — marker absent →
launcher runs (exit 0) → marker created → **launcher refuses (exit 9)** → campaign → marker
removed → launcher runs again (exit 0) → clean porcelain, unchanged tree. The refusal arm is
exercised, not asserted.

Every transcript emitted by `tools/mutate.sh` (D24/D42). Index derived by
`tools/mutant-index.py` against a manifest written **before** the index was derived:
`logs/s09/t17b-MUTANT-INDEX.log` — `transcripts=7 killed=6 survived=1 invalid=0`, exit 0,
`every outcome matches the manifest`.

| # | mutation | outcome | credited to |
|---|---|---|---|
| M1 | runner catch: `evaluateEnvelope(1)` → `(0)` | **KILLED** 1 failed \| 1 passed | B1 refusal test — the run throws at `executeWorkItem`; **no `expect` ran** |
| M2 | budget: drop the `+ pendingModelAttempts` term | **KILLED** 1 failed \| 1 passed | same, same way |
| M3 | budget: `<=` → `<` (revert J28 itself) | **KILLED** 1 failed \| 1 passed | J28's maximum-path assertion `expected 'EXHAUSTED' to be 'WITHIN'` |
| M4 | parser: larger-arm guard disabled | **KILLED** 1 failed \| 37 passed | smaller-arm test, `to throw error including 'are not the larger arm'` |
| M5 | parser: tie policy `>=` → `>` | **KILLED** 2 failed \| 36 passed | tie test + the tie-accept neighbour |
| M6 | parser: the **landed** count check disabled | **SURVIVED** 38 passed | *(see below)* |
| M6b | same mutation, after the pin was restored | **KILLED** 1 failed \| 38 passed | the new count-disagreement pin |

**M1/M2 are credited honestly.** They kill the test by making the run throw at the
`executeWorkItem` line — the act phase — not by failing a later `expect`. `mutant-index.py`
classifies both as `THREW`, and this report says so rather than crediting an assertion that
never ran (the S08 r3 defect class).

**M3 is the proof J28 was not reverted.** M1/M2 kill only the new refusal test; M3 kills only
the J28 test. The two directions are now pinned by two different assertions, which is what
"the contexts no longer share a branch" means operationally.

**M6 is the mutant that carried information (D37).** Disabling the landed count check left all
38 tests green: the larger-arm guard I added refused the same inputs, so the landed guard became
redundant **and unkillable** — deletable in silence. Fixed additively in `55354f4f` by pinning
its message too; M6b confirms the same mutation is now caught, by exactly that pin.

## 4. Gates — verbatim

All gate records emitted by `tools/gate-run.sh` v3, all in
`.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/`.

| gate | log | result |
|---|---|---|
| typecheck (final tree) | `t17b-GATE-typecheck.log` | `EXIT = 0` |
| cluster C1 run 1 | `t17b-GREEN-T17B-C1-run1.log` | `Tests 51 passed (51)` |
| cluster C1 run 2 | `t17b-GREEN-T17B-C1-run2.log` | `Tests 51 passed (51)` |
| cluster C1 run 3 | `t17b-GREEN-T17B-C1-run3.log` | `Tests 51 passed (51)` |
| unit zone (final tree) | `t17b-ZONE-unit-HEAD.log` | `Tests 7 failed \| 1134 passed (1141)` |

**Worst run wins: cluster C1 is 51/51 on all three runs.**

The seven unit-zone failures are **all pre-existing, and demonstrably so twice over.**
`tools/zone-set-equality.py` against the pre-B1/B2 base `59f23153`
(`t17b-ZONE-set-equality.log`): `NEW at head (none)`, `FIXED at head (none)`,
`SET-EQUALITY: PASS`, count delta `+4` — my four new unit tests. And independently, the failing
FILE set is **identical to the prior S09B round's, measured before the merge** at lane tip
`265581b2`: `load01-run-projection`, `obs-l2-s04-zone` (×2), `pro01-runner-tree`,
`s6-content-encryption`, `v2ui-node-runner`, `xrev01-node-review`.

`pro01-runner-tree` and `xrev01-node-review` name `RUN_COST_ENVELOPE_EXHAUSTED` and so invite
suspicion. They fail on
`expected Error: UNEXPECTED_CLIENT_QUERY:SELECT pg_… to match object { code: 'RUN_COST_ENVELOPE_EXHAUSTED' }`
— a stubbed pool rejecting a query it does not know, not the envelope decision. Both failed
identically at `265581b2`, before this seat touched anything.

**One flaky test, named.** An earlier full-zone run reported **8** failures, the extra being
`registration.test.ts > S3c B4 keeps the isolated production RSS curve below the published
measured bound`. It is absent from both JSON zone runs and passes 58/58 on three isolated runs.
It measures process RSS in a spawned child and imports nothing from `@debateai/budget` or
`@debateai/runner`. Pre-existing and load-sensitive; reported because the worst run is the
verdict, not because it is mine.

### Record stamps — read the raw output, then this

`tools/stamp-check.sh` over the `t17b-` prefix exits **1**, and that is the correct output for a
whole round rather than a defect. Its contract is "every record in this prefix is stamped at the
lane TIP", which is right for a final gate set and wrong for a round: **a RED record must carry
the commit at which the code was still broken**, and a mutant transcript must carry the commit it
mutated. `logs/s09/t17b-STAMP-CHECK.log` holds the raw output first and then a per-record table
giving each record's stamp and the commit it was supposed to measure, plus the check that
actually binds:

```text
--- THE GATE THAT MATTERS: every FINAL-tree record is at TIP ---
AT-TIP   t17b-GATE-typecheck.log
AT-TIP   t17b-GREEN-T17B-C1-run1.log
AT-TIP   t17b-GREEN-T17B-C1-run2.log
AT-TIP   t17b-GREEN-T17B-C1-run3.log
AT-TIP   t17b-ZONE-unit-HEAD.log
AT-TIP   t17b-CITE-CHECK.log
AT-TIP   t17b-MUTANT-M6b-landed-count-check-now-pinned.log
final-record verdict: ALL AT TIP
```

Four entries the tool reports as NO-STAMP are not gate records at all: the expected-mutant
manifest, the anchors input, the custody launcher script, and comparator OUTPUTS (which carry a
resolved TIP rather than a stamp). Named here rather than left to look like failures.

## 5. Checker self-tests (D56) — before any of the above is cited

`logs/s09/t17b-CHECKER-SELFTEST.log`. Every checker used as evidence was given the input that
should make it fail, and run:

| checker | failing input constructed | exit |
|---|---|---|
| `cite-check.py` | the ambiguous anchor **this lane actually hit** (`readonly pendingModelAttempts?: number;`, 2 sites) | 1 |
| `cite-check.py` | an absent anchor | 1 |
| `mutant-index.py` | manifest flipped: M4 declared SURVIVED | 1, `expected SURVIVED, observed KILLED` |
| `zone-set-equality.py` | a base with one failure fixed, so head shows a NEW failure | 1, names the failure |
| `zone-set-equality.py` | an internally inconsistent payload | 2, `counts 7 failed but names 6` |

`cite-check.py` caught a real defect of mine: I had added `pendingModelAttempts?: number;` to
**two** interfaces, so my first anchor identified nothing. Both are now compound and all 14
anchors resolve uniquely at `55354f4f` (`t17b-CITE-CHECK.log`).

## 6. Findings

**F-T17B-1 (fixed here, additive).** Adding the larger-arm guard made the landed serve-count
check redundant and unkillable — mutant M6 disabled it with all 38 tests green. Pinned in
`55354f4f`; M6b confirms.

**F-T17B-2 (non-blocking, names a coupling).** The parser now restates two of the constructor's
decisions (`Math.max` and the `>=` tie policy). That is deliberate — a receipt is a claim about
what was billed — but the two must now move **together**. The code beside `serve_leg` already
warns that after T9 merges "a basis that still reports COMPOSITION is a basis minted against a
retired chain"; if T9 changes the serve topology or the tie policy, `packages/budget/src/index.ts:109`
and `:117` change with `packages/register/src/index.ts:306` and `:337` or every legitimate
receipt is refused. Belongs on the W12 re-verification list for the envelope after T9.

**F-T17B-3 (non-blocking, not mine to fix).** The deletion-matrix comment in
`tests/unit/t17-envelope.test.ts` still says "ALL ELEVEN … (2 under per_site_attempts, 4
call_sites, 3 serve_leg)" while its own list has **five** `serve_leg` members. This is item 5 of
codex S09B's N1 and is routed to `S09B-D28-REPORT`; I did not touch it, to keep that ticket's
sweep honest.

**F-T17B-4 (process, and it is about the merge).** A clean auto-merge with **zero** overlapping
files still broke this lane's only integration test, because the coupling was a newly-required
settings field on a shared runner. Nothing in the harness fails on that: not merge-tree, not
typecheck. Only running the merged suite finds it. Any lane merging integration should run its
own integration tests **before** treating the merge as done — this one cost the first gate run
of the session to discover.

## 7. Packet defects

None. Every constant the packet quoted verified: lane tip `265581b2`, integration `19bbb4c4`,
39 commits behind, the seven named lanes, and both blocking findings' file references resolved
(after re-derivation — `apps/runner/src/index.ts:3261-3273` in the finding is `:3782` at this
tip, which is D53 operating exactly as ruled, not an error by the reviewer).
