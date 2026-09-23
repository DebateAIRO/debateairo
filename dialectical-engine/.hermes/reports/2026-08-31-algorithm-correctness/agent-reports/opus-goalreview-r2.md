GOAL REVIEW r2 — opus · CHANGES · comments read through: goal-v2-2026-09-01

# OPUS GOAL REVIEW r2

Standard: `DECISIONS.md` + the round-2/3 dispositions in `judge-adjudication.md`. Draft:
`goal-prompt.md` @ `goal-v2-2026-09-01`. Tree: my pinned worktree @ dev`1c9578a`. Read set this
round: goal-v2, DECISIONS.md, judge-adjudication.md, codex-audit-findings.md, codex-goalreview.md,
my own r1 — the lift I asked for in r1 N11 was granted and is what makes §N12a answerable below.

**Disposition of my 20 r1 items: all 20 land.** B1→T17 (new task) · B2→T9 gate-disposition table ·
B3→T11 ordered ladder · B4→T11 mapping + confirm-item 4 · B5→T9 lossless-membership digest ·
N1→confirm-item 3 · N2→T3 DoD reshaped to the one-row artifact · N3→T7 leverage defined over
`sensitivityRecords[].leverage` with the stub given implement-or-delete · N4→T8 rival pathway +
receipt fields + migration · N5→T5 cites S3-1 as superseding authority + dated DECISIONS line ·
N6→T1 single exported constant + no-second-literal grep · N7→T14a both gate halves · N8→T16 moved
after T0 with its number kept · N9→T16 evaluator≠synthesizer + startup warning · N10→T12 cites
559-568 + T10 dependency · N11→r2 read set · N12b→T7 re-fit DoD · N12c→line drifts corrected ·
M1→S6-1 cited on T9/T10/T15 · M2→Non-goals line · M3→I-1…I-5 labels. I re-verified every *new*
file:line v2 introduces (register:158-200, propagation:156-162/372-374/538/576-577/605-626/637-644,
runner:2025-2039, s04.ts:268-317, apps/ui/lib/types.ts:613, VerdictBanner.tsx:35, runner:987-996,
1641-1716) — all correct against dev@1c9578a.

Three items remain: one blocking, two non-blocking. All three are *residue of my own r1 fixes* —
places where the repair is right but its edge is unclosed. None is a regression.

## VERDICT

**CHANGES** — 1 blocking, 2 non-blocking. Unresolved r1 findings: 0.

This is a near-approve. The v2 rewrite is materially stronger than v1: the RED-before-GREEN
correction in the Global DoD, the per-gate disposition table in T9, the lossless-membership digest,
and T17 are all better than what I asked for. My single blocking finding is that the totality
argument in T11 — the fix for my own B3 — proves totality over a cube that mono-maker runs never
enter.

## FINDINGS

### B1(r2) — BLOCKING · T11's ladder is total over the cube, but a mono-maker run produces no point in the cube

**WHAT.** T11 derives the label from `(winner, margin, disagreement)` and proves totality with a
property test over that cube. Both non-winner inputs are undefined for a mono-maker run:

- **margin.** T10 defines it as the margin from the max-strength root to the runner-up. A mono-maker
  run authors exactly one root — `buildMultiMakerExpansionPlan` is skipped entirely at M=1
  (`apps/runner/src/index.ts:1841-1843`) and `buildCrossRootExchangePlan` yields no legs for M=1
  (`:1034-1042`). There is no runner-up, so there is no margin.
- **disagreement.** T11 names it as "the recorded panel dispersion of the winning root's reduced
  judgement (T3's `dispersion` field)". `measureDispersion` returns
  `{ kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" }` whenever fewer than two
  distinct judgement refs exist (`packages/judgement/src/s04.ts:270-271`) — which is exactly the
  mono-maker case, since T3 explicitly keeps M=1 on the skeleton path.

Step 2 of the ladder reads `margin ≤ γ OR disagreement ≥ threshold`. With both operands absent,
step 2 is undefined, and the run falls through to a comparison the task never specifies.

**WHERE.** T11 (ladder + property-test DoD), against Global DoD "Mono-maker acceptance run still
completes" and confirm-item 5's `PANEL-DEGRADED-SINGLE-VOICE` path — which reaches the identical
absent-dispersion state at M≥2 when every non-author judge fails.

**WHY.** S7-1 requires a code-derived label. My r1 B3 was that the rule was not total; v2's fix
proves totality over the cube of *defined* numbers, which is a strictly smaller domain than the set
of runs the mission must serve. The property test as specified cannot catch this: mono-maker and
degraded-panel runs are not points in the cube, so the test passes while the case is unhandled.
T11's DoD does say "NaN guards" — ABSENT is not NaN, and dispersion today is literally `null`
(`apps/runner/src/index.ts:1553`, `:1713`).

**SUGGESTED FIX.** Add an explicit arm before step 1 and state its label:
"when margin or disagreement is ABSENT (single root, or dispersion ABSENT per s04.ts:270-271), the
label is `CONTESTED` with mark `LABEL-BASIS-INCOMPLETE`" — or whatever V prefers, but *named*.
Extend the DoD from "property test over the cube" to "property test over the cube **plus** the
absent-margin and absent-dispersion arms, with the mono-maker acceptance run asserting the resulting
label". Worth adding to confirm-items if the mono-maker label is a V-visible product decision — a
single-model run that prints SUPPORTED would undercut the mission's whole premise.

### N1(r2) — NON-BLOCKING · The envelope hard-stop is a seventh COMPONENTS_ONLY producer, absent from T9's enumeration

**WHAT.** T9 enumerates the survival set as "transport death, no-artifact, digest-cannot-exist" and
gives a disposition for six former quality gates. There is a seventh live producer: the run-cost
envelope. `makeEnvelopeTerminal` (`apps/runner/src/index.ts:2222-2257`, reached at `:2258-2261` and
`:2384-2397`) calls `createEnvelopeExhaustedResult`, which returns `terminal: "COMPONENTS_ONLY"`
(`packages/serve/src/index.ts:394-396`) with `ENVELOPE_EXHAUSTED` rather than `DEFECT`.

**WHERE.** T9's gate table and enumerated survival set; T17 owns the envelope but only its size.

**WHY.** T9's DoD is "one test per former gate path proving no non-crash path returns
COMPONENTS_ONLY". A builder enumerating COMPONENTS_ONLY producers from the code finds seven and has
a disposition for six. I read this one as legitimately crash-adjacent — it fires only after
`protectedCoreVerified`, produces no prose, and is a resource death rather than a quality judgement
— so the fix is a naming gap, not a redesign. But leaving it unnamed invites a builder to either
"fix" it into the loop or to quietly treat budget exhaustion as a quality fallback, which is the
thing S6-4 forbids.

**SUGGESTED FIX.** Name it as the fourth member of the enumerated set — "envelope exhaustion after
protected-core verification (no prose exists)" — with one line saying why it is a crash class and
not a quality fallback, and add it to the per-path test list. Cross-reference T17 so the two tasks
visibly own opposite halves (T17 = the ceiling is big enough; T9 = what happens if it is still hit).

### N2(r2) — NON-BLOCKING · T17's DoD delegates an assertion to T3 that T3's DoD does not carry

**WHAT.** T17's DoD closes with "T3's DoD asserts the ceiling covers panel attempts." T3's DoD
(v2) requires the RED skeleton-literal test, the acceptance-path dispersion/family-discount receipt,
degraded-path marks, and M=1 reachability — it says nothing about the envelope ceiling.

**WHERE.** T17 DoD ↔ T3 DoD.

**WHY.** Both tasks are satisfiable as written while the assertion exists in neither. This is the
same cross-reference-without-a-referent shape as my r1 M1/M3, at DoD level rather than citation
level.

**SUGGESTED FIX.** Either add the clause to T3's DoD verbatim, or move the assertion wholly into
T17's own maximum-path ledger test and drop the delegation sentence.

## N12a RESOLUTION

**The question (r1 N12c/a).** Whether `judge-adjudication.md` or `codex-audit-findings.md` contain
adjudicated evidence contradicting a task's premise, or rulings the draft failed to task. Both are
now in my read set. I verified every claim below in my own worktree rather than accepting the other
lens's assertion.

**Answer: no contradiction of any v2 task premise, and no untasked *ruling*. Two pieces of codex
evidence are real, verified, and carried by no task — one is correctly parked, one is not.**

**(1) Adjudication cross-check — clean.** `judge-adjudication.md` A1–A5 corroborates rather than
contradicts: A2 independently confirms my M8 consequence chain (`null edge strength → contribution
null → skipped → σ(τ,0,0)=τ`), A3 confirms X5's unwired panel with the same call sites
(`s04.ts:322,330` used at `runner:1553-1555,1713-1715`), A4 confirms D3, A5 corroborates D1, D2, D5,
D6, X2, X3, X6, X7. Where codex and I differed, the adjudication split correctly on the two-UI
question (A1) — my r1 review had already been written against the live `apps/ui`, which is why my
B4 landed. Nothing in rounds 1–3 undercuts a v2 task premise.

**(2) Codex C18 — verified, and it does NOT contradict T6.** C18 claims review outcomes are
numericized out-of-band. Confirmed in my tree: `packages/evaluator/src/index.ts:2476-2480`,
`numericProwessValue`, maps `agree → 1`, `dispute → 0`, `cannot-assess → null` for
`sourceKind === "NODE_REVIEW"`, feeding `deriveEvaluatorProfiles`. This narrows my r1 D5 ("changes
no number") to "changes no number *in the verdict path*", which the adjudication already recorded.
It does not contradict T6: T6 changes how outcomes are *consumed* (standing filter + disagreement
routing) and does not alter the stored `ledger.node_review.outcome` values the profiler reads.
**Disposition: no finding.** Worth one line in T6 noting the second consumer exists so a builder
does not "tidy" the outcome vocabulary and silently move a profiling metric.

**(3) Codex C11 — verified, real, and carried by no task or non-goal.** This is the one item N12a
surfaces that the draft does not hold anywhere. Confirmed in my tree:
`apps/runner/src/index.ts:1633` passes `claimClassificationLine: run.questionLine` for **every**
child authoring call. In the judge, `classificationLine = input.claimClassificationLine ??
input.questionLine` and `classifyClaimText(classificationLine)` runs on it
(`packages/judgement/src/index.ts:121-122`); the model may override only when the code classifier
returns `"unknown"` (`packages/judgement/src/s04.ts:74-82`). Consequence: **every node in the tree
— supports, defeaters, cross-root responses — is claim-type-classified from the original question's
text, not its own statement**, and `reduceAssessment` therefore selects the composition row (its
coefficients, caps and clarity decay) for the root question's claim type
(`apps/runner/src/index.ts:1641-1645`).

Why it matters here specifically: this mission makes τ load-bearing for the first time. Today τ's
composition frame is inert alongside an inert graph; after T5/T7/T10/T11, τ propagates into edge
contributions, adaptive-stopping deltas, the winner, the margin, and the three-state label. A
normative counter-argument to an empirical question is currently reduced with the empirical row.

I am **not** filing this as a finding — it is not introduced by v2, it is not one of my r1 items,
and the packet limits new findings to v2 regressions. It also may be deliberate: one debate, one
claim-type frame, is a defensible design, and codex graded C11 TRUE-TODAY against a different claim.
**Recommended disposition:** a one-line entry in the /goal — either in Non-goals ("per-node
claim-type classification deferred; the run-level frame is intentional") or as a small task under
T3 — so the next reviewer does not rediscover it. If V wants it decided rather than parked, it is a
confirm-item, not a build task.

**(4) Coverage note.** Codex's `MISSED BY THE SOURCE` items 1–9 are engine behaviours the HTML
overlooked, not task-premise contradictions; item 4 (catch-up monotonicity, `runner:473-584`) touches
a path that is acceptance-only by my X7, so T5/T11 cannot regress a product surface through it. No
action.

**With this, my r1 CANNOT-ASSESS N12a is closed.** The remaining r1 CANNOT-ASSESS items are
unchanged and correctly parked: N12b's δ/ε calibration is now a T7 DoD obligation rather than a
guess, and my blind-lens Q2/Q4/Q5 stay open in the adjudication's "Open to later stops".
