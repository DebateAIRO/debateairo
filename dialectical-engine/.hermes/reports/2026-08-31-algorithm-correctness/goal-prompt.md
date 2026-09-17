# /goal — Algorithm Live Loop: make the debate decide the answer
version: goal-v4-2026-09-01 (r1: 34/34 · r2: 7/7 · r3: 3/3 applied — final lawful rework
round; full trail in agent-reports/judge-adjudication.md rounds 2–7)

Mission type: heartbeat build mission (PROGRAMMING + QA loops; R7 election at intake).
Baseline: dev @ 1c9578a (all file:line refs verified against it by two lenses).
Authority: every task implements a dated V ruling in
`.hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md` — intake rulings are
labeled I-1…I-5 (see the I-label clarification appended there), walkthrough rulings
S1-1…S7-3. Evidence: `agent-reports/opus-blind-findings.md`, `codex-audit-findings.md`,
`judge-adjudication.md`. Read DECISIONS.md before decomposing.

## Context (6 lines)
The pipeline runs, but the debate is decorative: every edge is strength-UNKNOWN, so every
node's final strength ≡ its own self-grade τ; the served answer is the first-configured
provider's root; the verdict label means "pipeline finished". The all-UNKNOWN graph is a
GUARDED walking-skeleton property — a sentinel test pins that no shipped writer emits
MEASURED — so this mission repeals a ratified constraint deliberately, not accidentally.
The multi-judge machinery (panel, dispersion, family discount, disagreement downgrade)
already exists in `packages/judgement/src/s04.ts`, tested and wired to nothing.

## Scope law
Algorithm only. NO UI redesign (T11's banner mapping is a vocabulary wiring, not a
redesign), no retrieval/tool-use, no steering design, no engine provider model choices
(S2-1), no changes to published arithmetic σ/agg/clustering. Legacy `web/` is touched
ONLY by T2. Every degradation or skip emits a visible condition mark.

## Global definition of done
- RED before GREEN means: the FIRST test asserts the DESIRED behavior and fails on the
  baseline. Never write a test that passes today and flip its assertion later. Read-only
  probes documenting old behavior are allowed but are not the RED evidence.
- Suites reported passed/total; pre-existing failures named, never absorbed.
- Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ
  (non-self-graded), measured edges, at least one root's final strength ≠ τ, an adaptive
  stop or ceiling recorded, a synthesizer verdict statement acknowledging the strongest
  surviving objection, an evaluator loop record (≤3 rounds), a code-derived three-state
  label, a band counted over cited nodes, AND envelope state WITHIN at terminal.
- Mono-maker acceptance run still completes (skeleton path + marks intact).
- Every new policy value lives in sealed register rows via T16's mechanism; missing rows
  fail loudly.

## Confirm-items for V at acceptance of this /goal
1. S7-1 split: label from code, statement from synthesizer, agreement enforced. (rec: yes)
2. S6-4 honesty: a round-3 standing evaluator objection serves WITH a visible condition
   mark. (rec: yes)
3. Does a standing round-3 objection ALSO force the label to CONTESTED? Default in this
   draft: NO — the label derives from numbers only, before synthesis (keeps the
   derivation acyclic; the objection remains a mark). Saying YES buys stronger honesty at
   the cost of a bounded post-loop re-derivation step. (rec: NO for this mission)
4. Live-UI verdict vocabulary mapping (T11): SUPPORTED→endorsed,
   CONTESTED→endorsed_with_caveat, UNSUPPORTED→suppressed_no_evidence. The last pairing
   stretches the existing string's meaning; renaming the vocabulary is UI-owned work for
   another lane. (rec: accept mapping now, rename later)
5. Panel-member failure policy (T3): when some non-author judges fail, proceed with the
   voices that parsed + visible mark; when ALL fail, degrade to single-voice with mark
   `PANEL-DEGRADED-SINGLE-VOICE` + one band step down — never a silent self-grade, never
   a components-only. (rec: yes)
6. Mono-maker / degraded-panel label: when margin or dispersion is ABSENT, the label is
   CONTESTED + `LABEL-BASIS-INCOMPLETE` — a solo voice can never print SUPPORTED, no
   matter how confident. (rec: yes — both lenses independently demanded the arm)
7. Run-level claim frame: every child node is claim-typed from the ORIGINAL question's
   text, not its own statement (apps/runner/src/index.ts:1633; verified by both lenses).
   Inert today; load-bearing once τ drives margins and labels. This draft PARKS it in
   Non-goals as a deliberate one-debate-one-frame design, to revisit with live
   calibration data — say the word and it becomes a small task instead. (rec: park)

## Tasks (true dependency order; numbers are stable citation keys)

### T0 · Baseline pin
Record, with exit codes and passed/total: `pnpm run typecheck`, `pnpm test` (full vitest),
and the acceptance CEREMONY:
`./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43-char credential>`
with the ACCEPTANCE_* environment documented in acceptance/README.md (V/operator supplies
ports, sample rate, credential). NOTE: `acceptance/main.ts` is the SERVER BOOTSTRAP, not
the ceremony — do not pin it as a baseline check. Pre-existing failures named before any
work starts.
DoD: three pinned commands with counts + the ceremony's settled run id / answer id;
repeatable by a second worker from the record alone.

### T16 · Register rows + seeding (cross-cutting prerequisite — scheduled here, directly after T0)
Mechanism (corrected r1): new sealed rows land via MIGRATION + the deployment-register
seeding path (`apps/runner/src/dev-deployment-register.ts` + `dev-deployment-register-cli.ts`
for dev provenance; production seeding is T14's question). `register.bootstrap.json` is a
strict five-pin tool file and is NOT touched. T16 is the SOLE owner of every new
row/schema/migration; consumer tasks only read.
Rows: δ, ε (T7) · γ, high cut, low cut, disagreement threshold + the named disagreement
quantity (T11) · synthesizer + evaluator role refs, evaluator-loop max = 3 (T9) ·
dispersion scale, repeated-family multiplier, downgrade bands, provider/model→family map
incl. UNKNOWN-family behavior (T3, per s04.ts:268-317 input requirements) · envelope
formula inputs (T17).
Defaults seeded: δ=0.02, ε=0.01, γ=0.05, high=0.70, low=0.35, disagreement threshold on
the seeded dispersion scale; evaluator role ref ≠ synthesizer role ref (identical refs
permitted but emit a startup warning + test).
DoD: consumers read register only (no code constants; grep-proof in test); missing row
fails loudly (test per row family); startup warning test for identical roles.

### T1 · Depth enforced at the contract door (S1-1)
The 1–5 integer bound is defined ONCE in `packages/contract` (exported constant +
`depth_params` schema requiring integer `depth` 1–5); `resolveExpansionDepth`
(apps/runner/src/index.ts:987-996) IMPORTS that constant and keeps throwing
`RUN_DEPTH_PARAMS_INVALID` as defence in depth. No second literal 5 (DoD greps for it).
DoD: RED first — a test expecting HTTP 400 with the `parseRequest` validation envelope
(exact machine code asserted in the test) for depth 9 FAILS on baseline; then GREEN for
inputs 0, 6, missing, fractional, string, unknown-key; 1 and 5 accepted through both
clients; runner guard intact; single-source grep test.

### T2 · Steering placebo removed from legacy form (S1-2)
Remove the two steering textareas from `web/app/new/NewQuestionForm.tsx:50-51`; submit
empty arrays; contract fields unchanged.
DoD: legacy form renders no steering inputs; submission still validates; no other web/ change.

### T4 · Way-of-knowing simplification + disclosure (S2-3)
Remove `RAN` from the judge output schema (packages/judgement/src/index.ts:26-29,130);
normalization (locator-less LOOKED_UP → REASONING) records condition mark
`WAY-OF-KNOWING-DOWNGRADED` naming node + claimed value.
DoD: RED first — test expecting the schema to reject RAN fails on baseline; mark emitted
on normalization (test); Q51 semantics unchanged.

### T8 · Remove strict-and — full surface (S5-2)
Deletion surface: propagation withholding branch, published-arithmetic `product`,
operator vocabulary, dev-policy acceptance, AND the rival-operator pathway —
`rivalOperator` (packages/propagation/src/index.ts:156-162), the rival evaluation at
:372-374/:538, and the `rivalOperator`/`rivalStrength` receipt fields (:576-577) the
runner persists (apps/runner/src/index.ts:2025-2039) — with receipt schema/migration.
`accumulate` pinned as THE operator.
DoD: no strict-and or rival-operator reference in shipped code (grep test); receipt
schema migrated; suites green.

### T3 · Wire the judge panel — author ≠ judge (S2-2)
Every authored node is assessed by every other healthy maker via `runJudgePanel`; the
author's self-assessment is one member. Wire `measureDispersion`,
`applyCorrelatedErrorDiscount`, `applyDeclaredDisagreement` (s04.ts:224-336) into
reduce/select (runner index.ts:1497-1556, 1641-1716) with T16's sealed inputs (family
map, dispersion scale, multiplier, bands). Mono-maker keeps the skeleton path + literal.
Failure policy per confirm-item 5: partial panel → proceed + mark; all-others-failed →
`PANEL-DEGRADED-SINGLE-VOICE` mark + one band step down. Timeout, parse-failure, and
all-failed paths each tested.
DoD: RED first — a test expecting one reduced judgement per node whose
`panelContractHashes` lists ≥2 members with non-null dispersion on an M≥2 path FAILS on
baseline (the skeleton literal is present today); then GREEN, plus an ACCEPTANCE-path
receipt proving dispersion + family discount live (not only unit calls); degraded-path
marks tested; skeleton literal reachable only at M=1.

### T5 · Reviewer measures edges — the graph goes live (S3-1, S4-1)
The review call additionally returns, per edge sourced by the reviewed node, a bearing
0–1 or cannot-assess. Exactly ONE reviewer call per reviewed node returns ALL its edge
measurements — DoD asserts from the model-call ledger that no measurement-only call site
exists (zero extra calls, S3-1). Runner writes magnitudes (creation site runner
index.ts:1679-1693 + measured-update path in packages/graph); `strengthSource` renamed
`REVIEWER`; cannot-assess leaves UNKNOWN (skipped, as today). Panel judging and review
remain SEPARATE calls (S4-1).
Sentinel repeal: tests/unit/dr184-judged-standing.test.ts:85-105 pins the all-UNKNOWN
constraint; S3-1 is the superseding authority — cite it in the task, retire the sentinel
with a dated line in the NEW mission's DECISIONS.md, and replace it with its inversion
(MEASURED must appear on reviewed edges).
DoD: RED first — the inverted sentinel FAILS on baseline; post-run graph holds MEASURED
magnitudes; propagation yields final ≠ τ on a constructed run; ledger single-call
assertion; schema/migration for magnitude updates.

### T6 · Review outcomes get teeth (S4-2)
`cannot-assess` rows stop seeding judged-standing basis (outcome filter at
packages/judgement/src/index.ts:408-417); `dispute` feeds `applyDeclaredDisagreement`.
DoD: RED first — a node reviewed only by cannot-assess is expected HIDDEN-UNJUDGEABLE
and the test fails on baseline; disputed node shows the downgrade (test); agree-path
unchanged. Note: the evaluator profiler is a SECOND consumer of stored review outcomes
(packages/evaluator/src/index.ts:2476-2480) — do not rename or tidy the outcome
vocabulary while changing its consumption.

### T7 · Adaptive stopping (S3-2, S5-1)
After each round, propagate (pure code; assert zero model calls via ledger). Global stop:
no root moved > δ vs the previous round. Branch freeze: leverage < ε → no expansion
beneath + mark `BRANCH-FROZEN-LOW-LEVERAGE`. Depth = ceiling; round-1 floor.
Leverage DEFINED: the recorded `sensitivityRecords[].leverage` of the branch's subtree
root node — max absolute change in any root's strength when that node is removed
(propagation/src/index.ts:605-626); a subtree's whole influence flows through its root
node, so node-removal leverage IS branch leverage. Freeze iff leverage < ε strictly;
UNKNOWN edges contribute nothing and cannot unfreeze a branch. `resolveLeverage`
(:637-644) is a stub returning LEVERAGE_UNRESOLVED — implement it over sensitivityRecords
or delete it in this task. Cost note: sensitivity is one full re-evaluation per node per
round (O(N²) pure-code); bounded by the freeze/stop rules keeping N small.
DoD: synthetic-graph tests with EXACT numeric examples for (a) global δ stop before
ceiling, (b) one branch frozen while a sibling continues, (c) round-1 floor, (d) equality
at ε continues (not frozen); marks recorded; zero model calls asserted; δ/ε RE-FITTED
from the first M≥2 acceptance run and the fitted values recorded in the new mission's
DECISIONS.md (statically chosen defaults are uncalibratable — no run has ever produced a
non-τ strength).

### T10 · Winner selection + served number (S6-1, S6-3)
Delete first-configured-provider selection (runner index.ts:934-944). Served number =
max-strength root's propagated strength; margins to runner-up recorded in the receipt;
deterministic tiebreak (documented; e.g. lexicographic node id — a tie is CONTESTED by
T11's ladder anyway); UNSERVED-MAKER-POSITION marks stay.
DoD: RED first — constructed run with reversed config order expects the higher-strength
root served and FAILS on baseline; margin in receipt; tiebreak test.

### T11 · Three-state verdict label (S7-1, S6-1)
Code-only derivation, computed BEFORE synthesis from the propagated numbers (acyclic —
see confirm-item 3; the round-3 objection is a mark, not a label input, by default).
Ordered, total, disjoint ladder — defined over the RUNTIME domain, absent inputs included:
0. margin ABSENT (single root: no runner-up exists) OR disagreement ABSENT (dispersion
   reports fewer-than-two parseable judgements, s04.ts:270-271 — the mono-maker skeleton
   and the PANEL-DEGRADED-SINGLE-VOICE path both land here) → CONTESTED + mark
   `LABEL-BASIS-INCOMPLETE` (confirm-item 6: a solo voice can never print SUPPORTED)
1. winner < low cut → UNSUPPORTED
2. else margin ≤ γ OR disagreement ≥ threshold → CONTESTED
3. else winner ≥ high cut → SUPPORTED
4. else (mid-band: low ≤ winner < high with clear margin + low disagreement) → CONTESTED
Disagreement quantity NAMED: the recorded panel dispersion of the winning root's reduced
judgement (T3's `dispersion` field), compared on T16's seeded scale. Register values:
γ=0.05, high=0.70, low=0.35 (T16 defaults; tunable without code).
Live-UI mapping (confirm-item 4): SUPPORTED→endorsed, CONTESTED→endorsed_with_caveat,
UNSUPPORTED→suppressed_no_evidence (apps/ui/lib/types.ts:613, VerdictBanner.tsx:35) —
vocabulary wiring only, not a redesign.
DoD: replace the binary derivation at packages/serve/src/index.ts:662-668 (RED first —
a test expecting CONTESTED from a constructed near-tie FAILS on baseline); PROPERTY test
over the (winner, margin, disagreement) cube PLUS the absent-margin and
absent-dispersion arms (ABSENT/null are runtime values, not NaN) proving exactly one
label per point of the runtime domain; the mono-maker acceptance run asserts its label
is CONTESTED with the LABEL-BASIS-INCOMPLETE mark; all three states reachable, each
trigger tested; live banner renders each mapped state (test).

### T9 · Synthesis serve chain (S6-1, S6-2, S6-3, S6-4) — after T10/T11
DIGEST (lossless membership, B3/B5): a deterministic all-node schema — one entry per
materialized node (statement summary, final strength, polarity relations, way of
knowing, marks) with provenance-preserving compression; the byte budget governs SUMMARY
LENGTH per node, never membership. Top-2 surviving objections + runner-up positions are
EMPHASIS fields over that total membership (S6-2). If max compression still exceeds the
budget, the outcome is LOUD: condition mark + the enumerated crash class — never a
silent subset. Test: a decisive node outside roots/top-2 provably reaches the recorded
synthesizer request.
ROLES: SYNTHESIZER and EVALUATOR are named provider roles (T16), fresh-context calls
with zero debate ties (a debater's MODEL may hold a role; the CALL is fresh). Per-role
recorded request schemas, initial and retry DISTINGUISHED (the loop converges by
feedback, never by accident):
- synthesizer (initial) = instructions + digest + code label/numbers
- synthesizer (retry) = the same + the prior evaluator objection VERBATIM + a reference
  to the prior candidate
- evaluator = instructions + digest + code label/numbers + the current candidate statement
The fresh-context assertion = each recorded request contains NO debate transcript or
provider history beyond those named artifacts — never the absence of artifacts a role
needs; a recorded-request test asserts the round-2 synthesizer request contains the
exact round-1 objection. Evaluator checks fairness to losers, statement–label agreement
(label from T11), overstatement.
LOOP: ≤3 rounds or evaluator satisfied; after round 3 SERVE regardless; standing
objection → visible condition mark (confirm-items 2–3).
LEGACY GATE DISPOSITION (each former COMPONENTS_ONLY quality gate re-routed; test per
gate proves its new terminal):
- R9 restatement (serve:452-455) → evaluator-objection criterion. The envelope
  terminal's protectedCoreVerified guard (runner:2255,2260,2387,2392; serve:380-382)
  keyed on R9's gate-hood and is KNOWINGLY RETIRED with it: the envelope terminal fires
  on HARD_STOP whenever no served statement exists yet, independent of restatement status
- residual-objections-empty (:458-461) → DELETED (obsolete: objections now required)
- composition byte budget (:474-477) → code precondition: tighten summaries and retry,
  then serve with mark; crash class only if the digest cannot exist
- conformance ≤2 (:521-524) → evaluator-objection criterion (citation tracing: every
  load-bearing claim traces to a digest node)
- Q51 locator block (:529-532) → DELETED (unreachable by construction; documented)
- post-compose R9 (:554-557) → evaluator-objection criterion
COMPONENTS_ONLY survives ONLY for the enumerated set: transport death, no-artifact,
digest-cannot-exist, and envelope exhaustion after protected-core verification
(ENVELOPE_EXHAUSTED — a resource death with no prose, not a quality judgement; T17 owns
keeping the ceiling big enough, T9 owns what happens if it is still hit).
DoD: one test per former gate path AND one per enumerated crash class — envelope
exhaustion included, asserting terminal, mark, and the retired-guard behavior (an
exhausted envelope with no served statement takes the envelope terminal even when
restatement failed — never serves over budget); no non-crash path returns
COMPONENTS_ONLY; terminal + mark named per path; evaluator-unsatisfied-3-rounds serves
WITH the objection mark (test); fresh-context + round-2-objection recorded-request
assertions; loop-round records.

### T12 · Band over cited nodes (S7-2) — after T9/T10
Basis = way-of-knowing counts across nodes the statement cites (conformance-verified
set), replacing the single-node basis (count site packages/serve/src/index.ts:559-568;
its single-node-ness originates in buildFixedSingleRootServeNodes, runner
index.ts:964-984, which T10 replaces). Mono-maker one-step-down retained.
DoD: 0/1 shares are no longer STRUCTURALLY FORCED by a one-node basis: a mixed-way
citation test yields fractional shares (RED first — fails on baseline), and a
homogeneous multi-node test correctly remains 0/1; mono-maker step-down preserved.

### T13 · Honest downgrade preserved (S7-3)
All-cited-REASONING → terminal DOWNGRADED, form HYPOTHESIS_WITH_RESEARCH_PLAN, both
segments synthesizer-written; label + band still shown.
DoD: all-reasoned acceptance run yields DOWNGRADED + hypothesis + plan + label + band (test).

### T17 · Cost envelope for the live topology (S2-2, S4-1, S6-4 consequence; r1 B1/B7)
`computeStructuralCeilingBasis` (packages/register/src/index.ts:158-200, DR-184-v2)
counts two model sites per node and no synthesis loop. Extend `StructuralCeilingInput`
for: (M−1) panel calls per materialized node, 1 reviewer call, up to 3 synthesizer + 3
evaluator rounds, conformance/repair/final-retry terms; bump `formula_version`; update
admission + receipts.
DoD: maximum-path ledger-count test proves the recomputed ceiling covers the observed
attempt count of the flagship M≥2 run — panel attempts included, asserted HERE from the
same ledger (envelope WITHIN at terminal — also in Global DoD); over-bound input still
refuses loudly at admission (test).

### T14 · Production wiring (intake ruling I-2 WIRING SCOPE — double-gated)
T14a answers BOTH gate halves with evidence, before T14b may start:
(1) OWNERSHIP — does the in-flight S06 runner-binding / DEV-12E lane own runner policy
provenance? (2) PROVEN BROKEN TODAY — `readDevelopmentRunnerPolicy` rejects non-dev
provenance (apps/runner/src/dev-runner-policy.ts:105-118) and `claimTimeProbe` is
supplied only by acceptance/main.ts:519 — both are UNWIRED, which is broken only if the
deployment seals non-dev rows; record which. Both answers land in the new mission's
DECISIONS.md.
T14b (ONLY if unowned AND proven broken): production-provenance policy reader mirroring
acceptance wiring + claimTimeProbe wired in main.ts.
DoD: T14a evidence on the record; if T14b runs: runner boots against a
production-provenance register in a probe; claim-time probe live (test).

### T15 · Synthesizer/evaluator eval harness + role decision (S6-4, S6-1) — after T9
Exact matrix, spend-bounded: 5 recorded debates (reused fixtures from acceptance runs —
no new debate generation) × 3 candidate role configs × ≤2 evaluator rounds; graded blind
by 2 graders that are never the candidate; per-call max attempts + token ceiling stated
in the harness config; projected call count printed BEFORE any provider call and the run
proceeds only on explicit V approval (important-operation gate).
T15b — CLOSE THE DECISION: the comparison table routes to V; V's choice (or V's recorded
delegation rule) is written into the register role seeds. Until then the roles run on
T16's dev-provisional defaults. No arbitrary shipping of role refs (S6-1).
DoD: one-command harness; table produced; V decision recorded and seeded; spend gate
demonstrated (projected-count output test).

## Non-goals (recorded V rulings)
Retrieval/execution receipts (S2-3) · steering design (S1-2) · dead askContract storage
(deferred to the steering mission — recorded, not forgotten) · engine provider model
choices (S2-1) · UI redesign / web-retirement decision · standing eval suite beyond T15 ·
any change to σ/agg/clustering arithmetic · per-node claim-type classification (the
run-level frame is deliberate this mission — confirm-item 7).

## Recommended follow-ups OUTSIDE this /goal (from seat self-reports; V may spawn later)
Orphan-audit as CI gate · enum-reachability lint (`@unreachable(reason)`) ·
stored-never-read column check · deterministic composer fact/reference validator beyond
T9's citation tracing.
