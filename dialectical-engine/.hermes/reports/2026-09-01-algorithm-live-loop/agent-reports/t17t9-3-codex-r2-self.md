CODEX REVIEW T17T9-3 r2 — CHANGES · comments read through: t17t9-3-r3-2026-09-05

**Self-report. Finding counts: 1 BLOCKING / 4 FOLLOW-UP.** B1 remains open for V; B2 is cleared; the prior F1–F4 follow-ups remain, with F4 partly addressed. No new worker round is requested.

## What changed the review

The decisive check was joining creation and rejection records by promise label, then tracing the deadline from the caller. The packet and worker report quoted the fallback at registration.ts:1073 as though it were the effective registration value. The actual expression gives precedence to the request, and registration supplies 28,000 ms. Both logs independently corroborate that value: target lifetimes are approximately 28.14 seconds.

The summary's 32 labelled rejections and 64 unhandled events were also different populations. Thirty-two unhandled events occur about 26 seconds before the first labelled rejection. The raw log identifies a dummy reservation in the capacity record, and the test creates exactly 32 dummy promises before the targets. This supports a two-stage interpretation. It does not justify calling the unhandled count duplicate reporting, and the missing labels/source prevent a complete bijection.

Finally, I traced the gate predicates and release order. The probe ends before targets-queued succeeds, retaining 32 active reservations; b14 reaches marker-grants after releases, ending with zero. Both traces can be caused by expiry, but the early induced failure cannot discriminate what happened later under the original deadlines. That distinction keeps B1 open without alleging a newly found authentication regression.

## What worked

- The explicit parent/tip commits and raw-log paths made the counts, failure-name sets and source identities independently checkable.
- Hoisting S06's actual receipt and parsing it directly is a useful response to a masked downstream test. The receipt test and pool now share an object; this is stronger than a separate hand-copied valid fixture.
- Preserving the unsuccessful early-throw experiment was useful. Its nonempty state helped challenge the first mechanism rather than conceal the dead end.
- Static Git blob comparisons established textual transfer without a checkout, patch application or mutation of integration.
- The packet's final-round stop rule is clear. This review supplies V with an evidence decision and does not ask the exhausted seat for round 4.

## What must improve

**Record effective configuration at the call, including overrides.** A source line containing a fallback is not proof that the fallback governs a particular request. The probe should carry the actual armed deadline with each reservation identity. That one field would have prevented the report's 18-second explanation and exposed the different dummy/registration timers immediately.

**Preserve the instrumented harness as an artifact before restoring it.** A short digest prefix plus output cannot establish exact source equivalence or observer effects. Save the test-only diff, full digest, base/head identifiers, exact command and relevant non-secret environment parameters alongside the raw events. Restore the checkout afterwards; preserving evidence does not require keeping instrumentation in production or in the final code change.

**Compare event populations before comparing totals.** Record dummy, target and marker identities at creation, enqueue, grant, release and settlement. The present probe counts all unhandled events but labels only the target subset. A summary should not present that subset as a complete rejection census or let the 64/32 ratio imply duplication.

**A matched failure must preserve the relevant phase.** Deterministic induction is useful only if it still discriminates the disputed mechanism. Making a pre-release gate impossible on both trees gives expected parity and cannot decide whether the post-release load episode was inherited. The evidence plan should specify the phase and observable state before running a costly comparison.

**Separate measured run results from source-change bounds.** The S06 delta adds one test and changes no existing failing body. That supports a narrow regression assessment; it does not calculate future timing-sensitive failure counts. Preserve b14 under its actual commit. Additional runs may have distinct names without overwriting it.

**Close a comment finding at its original location.** F4's added note is correct, but the original universal statement remains 141 lines later. A closure check should revisit each cited phrase, not count edits to the cited file. Likewise, a failure-class claim should be checked against all named failures: S06 has four inherited names but only one advisory-lock failure.

## Review efficiency and limits of this self-assessment

I initially batched too much report/diff output and hit tool truncation. Narrower reads and a small parser for timestamps/failure names recovered the needed evidence. The improvement is to obtain file sizes and select bounded independent reads before setting tool output budgets; repeatedly retrieving long prose is avoidable work.

I did not run a fresh suite because the packet explicitly required a static review. The useful fresh work here was artifact parsing, source tracing and immutable blob comparison. I did not invoke a broad security scan, delegate to agents, or introduce additional report files.

I cannot measure total token or wall-time waste from this record and make no invented cost claim. I also cannot remember or reconstruct the exact last edits of the previous reviewer process: its early draft was not snapshotted. The final r1 report matches the exit snapshot byte-for-byte and the ledger's recorded early disposition; exact prose equivalence is unavailable.

A more efficient review packet would carry a short claim/evidence table with the effective deadline, all event categories, stage/occupancy, checked source hash, and explicit limits. Narrative still matters, but each decisive sentence should be reproducible from those fields.

## Packet audit

SKILLS LOADED: using-superpowers (and Codex tool adaptation), assess-patch-risk (and risk rubric/schema), verification-before-completion. The requested two-file static output contract controls over generic additional-artifact or subject-execution workflows. The patch-risk JSON is embedded below and is validated through standard input, creating no third artifact.

The reviewer packet was read in full before the review. The worker packet including AMENDMENT 2, round-3 dispatch, worker report/self-report and r1 verdict were read; raw B1/B2 records, baseline records, source and relevant D63/ledger records were checked. No applicable AGENTS.md was found in the workspace or either output path's ancestors.

AMENDMENT 2 grants sufficient test instrumentation and scratch-parent authority, corrects S06's inventory omission, points to machine-readable baselines and gives clear final-round routing. Charge the remaining factual summary errors, not a missing grant. Uphold the already recorded premature-verdict-consumption defect #28; do not infer an exact early/final text diff from its absence.

The main report identifies the specific contradictory source and event lines, B2 closure and all four follow-ups. I wrote only the two requested reviewer reports; no code, board, decisions, logs or Git metadata was intentionally changed.

## For V — before the merge

B1 requires a decision on comparable evidence or an explicit uncertainty exception; do not dispatch round 4.
B2 and ten-file textual transfer are cleared; F4 remains partly open.
Treat 80/1/0/20 as b14 at 5e837ba7, not as a newly measured 40217895 result.

## Not verified

No dynamic tests, exact removed harness identity, complete 64-event correlation, original b14 wall-clock timeline, deployed receipt state or integration runtime result. No exact copy of the r1 draft acted upon at 18:40 exists in the supplied record. Fresh static verification supports artifact identity and report completion, not a claim that the software test suite passes.

## PREDICTIONS

1. Adding effective-deadline and event-category fields to a future observation probe will expose the fallback/registration distinction directly.
2. Re-checking the original F4 phrase after any comment edit will catch the present incomplete closure immediately.
3. A further uninstrumented full-suite rerun can change counts while leaving the causal attribution unresolved.
4. A source-preserving paired post-release experiment can resolve B1 without production registration edits, if it yields a discriminating episode.

## Machine-readable patch-risk assessment

Validation statuses below identify the specific review check: S06 failure-set parity passes while the underlying suite still fails; b14 causal-attribution evidence is unavailable while its raw failing counts remain literal. The initial validator rejected a generic failed-suite entry as an established patch defect, so I separated these two different conclusions rather than change the recommendation or conceal the failed executions.

The patch hash uses `git diff --no-ext-diff --binary --full-index 2af816f1..40217895`. The repository field names the package directory; changed files retain Git's V5-root-relative prefixes.

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine",
    "sourceType": "commit_range",
    "base": "2af816f183247efefae65172bb7036eefd049fa1",
    "head": "40217895a028471874d15a4851fbab8bcf746037",
    "changedFiles": [
      "dialectical-engine/.hermes/TOOLING-TRAPS.md",
      "dialectical-engine/acceptance/runtime-policy.test.ts",
      "dialectical-engine/packages/budget/src/index.ts",
      "dialectical-engine/packages/register/src/index.ts",
      "dialectical-engine/tests/integration/obs-l3-s06-runner-binding.test.ts",
      "dialectical-engine/tests/integration/t17-envelope-ledger.test.ts",
      "dialectical-engine/tests/support/discoveredPanel.ts",
      "dialectical-engine/tests/unit/dr181-ceiling.test.ts",
      "dialectical-engine/tests/unit/dr184-review-resilience.test.ts",
      "dialectical-engine/tests/unit/register-s09.test.ts",
      "dialectical-engine/tests/unit/t17-envelope.test.ts"
    ],
    "sha256": "fe8eeaa0db8b2d5c14a3fda4a5850852e5fc89f377f8b77b1a82d30772c1173b"
  },
  "recommendation": "hold_for_evidence",
  "workflowLabel": "hold_for_evidence",
  "impact": {
    "rating": "high",
    "rationale": "The full lane changes shared admission arithmetic and the persisted envelope receipt accepted by run-head and provider-budget readers. Incorrect bounds can stop valid runs; old five-field receipts are incompatible with the new strict parser."
  },
  "regressionLikelihood": {
    "rating": "moderate",
    "rationale": "The source-derived six-site rule, independent ledger observations and focused retained checks support the arithmetic. B2 is corrected. The required attribution of b14's additional unhandled rejections remains unresolved; no direct mail implementation regression is established."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "Retained 85/85 focused results and the independent S06 parse pass cover useful changed contracts. Four S06 cases remain inherited failures, the full suite was measured at 5e837ba7, and the round-3 logs lack a complete immutable checked-tree manifest. No destination execution or fresh reviewer tests occurred.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "managed",
    "rationale": "No migration is introduced, but v3/v4 receipt shapes are incompatible. Reader rollback after v4 receipts are persisted requires receipt and reader coordination; deployed state was not inspected."
  },
  "confidence": {
    "rating": "moderate",
    "rationale": "Base/head patch hashes, all affected working blobs and transfer bases were verified. Main runtime callers and the B2 fix are source-traced. The original load attribution and exact removed probe implementation are unavailable."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "API admission constructs the basis; core.run persists it; runner and BudgetRepository parse it before work and provider budget enforcement."
  },
  "statusQuoRisk": {
    "rating": "moderate",
    "rationale": "The parent continues to describe seven retired serve sites and a 109 ceiling for a reviewed maximum path that spends six sites and 106 attempts, with the ledger assertion failing."
  },
  "autoMergeExclusions": [
    "persistent_state",
    "public_contract",
    "other"
  ],
  "affectedRuntimeRoots": [
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/api/src/main.ts",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/runner/src/index.ts"
  ],
  "importantCallers": [
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/register/src/index.ts:computeStructuralCeilingBasis",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/db/src/index.ts:RunRepository",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/budget/src/index.ts:parseCostEnvelopeBasis",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/budget/src/index.ts:BudgetRepository.readPinnedBasis",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/budget/src/index.ts:BudgetRepository.assertModelAttemptAllowed",
    "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/acceptance/runtime-policy.ts"
  ],
  "riskDrivers": [
    "Serialized receipt compatibility changes across versions.",
    "A decision-critical four-count attribution gap persists.",
    "S06 inherited failures still mask downstream provider-capture execution.",
    "F4's original universal parser assurance remains despite accurate new scope notes."
  ],
  "protectiveFactors": [
    "Runner and synthesis implementation are unchanged.",
    "The ledger measures role-qualified sites independently of the constructor's shared constant.",
    "The S06 pool and direct parser test consume the same corrected fixture object.",
    "All ten code transfer bases match exact integration 1485b9e2.",
    "No direct registration, auth-policy or registration-test change exists across the assessed commits."
  ],
  "materialBoundaries": [
    {
      "id": "serve-bound",
      "invariant": "The shipped synthesis path must fit the admitted site and attempt counts.",
      "runtimeRoot": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/runner/src/index.ts",
      "counterexample": "A constructor adding one site must disagree with the independent six-role-site ledger assertion at tests/integration/t17-envelope-ledger.test.ts:655; retained r1 mutant evidence records that failure.",
      "legitimateControl": "The reviewed M=2/depth=1 maximum path has 88 non-serve attempts and two roles times three rounds times three attempts, yielding 106. Register sites requires equal per-role bounds.",
      "result": "supported"
    },
    {
      "id": "receipt-shape",
      "invariant": "The admitted synthesis receipt must round-trip; stale composition receipts and internally mismatched serve disclosures must refuse.",
      "runtimeRoot": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/budget/src/index.ts",
      "counterexample": "The prior S06 fixture carries retired composition fields and COMPOSITION, which the current strict schema refuses as RUN_COST_ENVELOPE_UNRESOLVED.",
      "legitimateControl": "S06_ENVELOPE_BASIS uses six sites and SYNTHESIS_LOOP, is returned directly by the pool, and has a retained direct parse pass. Parser equivalence to every constructor invariant is expressly not this boundary's contract.",
      "result": "supported"
    },
    {
      "id": "b14-attribution",
      "invariant": "Additional b14 unhandled errors must have comparable parent/tip causal attribution before this packet's merge gate clears.",
      "runtimeRoot": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/registration-database.test.ts",
      "counterexample": "Shortening default waiter life makes targets-queued impossible before releases on both trees; equal failures then cannot discriminate the original later marker-grants episode.",
      "legitimateControl": "A preserved identical test-only observation probe with both effective production deadlines and matched documented contention could show the same post-release expiry/grant failure on parent and tip, or reveal a tip-only difference.",
      "result": "unresolved"
    }
  ],
  "validation": [
    {
      "name": "Retained round-3 focused regression: logs/t17t9-3/25-r3-regression.log",
      "status": "passed",
      "protects": "Eight files report 85/85 across constructor, ledger, row identity and budget caller contracts; reviewer did not rerun them."
    },
    {
      "name": "Retained S06 independent receipt test: logs/t17t9-3/19-s06-full.log",
      "status": "passed",
      "protects": "The actual hoisted fixture parses independently of inherited gateway lease failure."
    },
    {
      "name": "Fresh comparison of retained S06 failure identities across parent, b14 and round 3",
      "status": "passed",
      "protects": "All four distinct failing names are set-equal. Underlying round-3 S06 execution remains 4 failed / 2 passed; only one failure is an advisory-lock error, and this parity check does not establish downstream capture success."
    },
    {
      "name": "Causal attribution evidence for b14's additional unhandled errors",
      "status": "unavailable",
      "protects": "The raw b14 execution at 5e837ba7 remains failed: 80 test failures, one load failure, zero skips and twenty unhandled errors. The paired probe does not resolve attribution of the nineteen additional mail errors or measure 40217895."
    },
    {
      "name": "Retained typecheck differential",
      "status": "passed",
      "protects": "Eight lane diagnostic strings equal the parent's eight s14-ui errors exactly; the underlying typecheck exits one and predates round 3."
    },
    {
      "name": "Static immutable patch and transfer checks",
      "status": "passed",
      "protects": "Full and round-3 patch hashes, clean diff-check, committed/working blob equality, ten identical integration base blobs and comment-only budget/T17 round-3 changes."
    },
    {
      "name": "Fresh reviewer subject execution",
      "status": "skipped",
      "protects": "No dynamic validation claimed; packet requires static artifact review."
    }
  ],
  "unknowns": [
    {
      "summary": "The cause of the uninduced b14 post-release marker-grants failure and nineteen mail rejections has not been discriminated between parent and tip.",
      "decisionCritical": true
    },
    {
      "summary": "The temporary probe source and full hash are not retained; initial unhandled events lack promise identities.",
      "decisionCritical": true
    },
    {
      "summary": "Actual deployed historical receipt inventory and cross-version recovery were not inspected.",
      "decisionCritical": false
    },
    {
      "summary": "A new full-suite count at 40217895 and destination runtime validation are not available.",
      "decisionCritical": false
    },
    {
      "summary": "The acted-on r1 early draft is missing; material decision continuity is supported by ledger notes and final snapshot, not an exact draft diff.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": [
    {
      "question": "Does a comparable parent episode explain b14 without making an earlier prerequisite impossible?",
      "action": "V may authorize bounded follow-on evidence outside this exhausted worker round: retain the exact observation-only harness and full digest, both effective deadlines, every reservation/settlement identity, and matched parent/tip post-release contention plus an uninduced control. Production registration remains unchanged.",
      "outcomes": {
        "Matched correlated post-release failure on parent and tip, with corrected attribution and other present controls preserved": "merge",
        "Repeatable tip-only behavior or no discriminating episode": "hold_for_evidence",
        "Established lane-caused defect": "revise"
      }
    },
    {
      "question": "Will V explicitly accept the remaining attribution uncertainty?",
      "action": "Record a V decision identifying the measured 5e837ba7 four-count and unresolved cause if choosing an exception; preserve this review's evidence rather than changing its factual conclusion.",
      "outcomes": {
        "Explicit exception resolves the packet gate without claiming causal proof": "merge",
        "No exception or replacement evidence": "hold_for_evidence"
      }
    }
  ]
}
```

MERGEABLE: no — B1 remains an evidence decision for V despite the corrected S06 receipt and clean textual code transfer.
