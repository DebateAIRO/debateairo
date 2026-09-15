CODEX REVIEW T17T9 r1 — CHANGES · comments read through: t17t9-r1-2026-09-05

# CODEX REVIEW T17T9 r1

## VERDICT

**CHANGES. Finding counts: 1 BLOCKING / 3 FOLLOW-UP.**

The production instance fix is correct: the acceptance reader resolves all three synthesis-role rows, checks every returned role-family `sourceRef`, carries the family non-optionally on `AcceptanceRuntimePolicy`, and `createAcceptanceRuntime` passes it to the runner. The lane is not yet mergeable because the changed T17 fixture is presented as maximum-path evidence while it forces the evaluator to accept in round 1.

Patch-risk recommendation: **revise** (`workflowLabel: revise`). Impact if wrong **high**; regression likelihood **moderate**; regression protection **partial**; recoverability **easy**; confidence **high**.

## FINDINGS

1. **BLOCKING — the changed T17 double does not exercise the maximum synthesis path.** `tests/integration/t17-envelope-ledger.test.ts:213` · Every EVALUATOR input → the double returns `satisfied: true`, so `runSynthesisLoop` exits after round 1 and the purported maximum-path test observes only two role sites / 94 attempts instead of the allowed three rounds, six role sites / 106 attempts · **Required fix:** return valid unsatisfied verdicts with objections for rounds 1 and 2 and terminate on round 3; rerun the ledger test and correct the F-T17T9-3/report arithmetic to 106 observed maximum versus the conservative 109 ceiling. Keep the stale seven-site/tightness assertions red pending the T17 ruling rather than editing them to fit.

2. **FOLLOW-UP — the acceptance provenance remainder is undercounted.** `acceptance/runtime-policy.ts:227` and `acceptance/main.ts:412` · Foreign-provenance `envelopeFormulaInputs`, panel-weighting, verdict-label, or adaptive-stopping rows → acceptance accepts them because only the new synthesis-role family's `sourceRefs` are checked · **Required fix:** extend the deployment provenance check to every T16 family acceptance reads. This is **1 of 5**, not F-T17T9-4's stated 1 of 4: `envelopeFormulaInputs` is the fifth family and also exposes `sourceRefs`.

3. **FOLLOW-UP — the guard derives current obligations but does not close the class.** `tests/unit/deployment-register-family-wiring.test.ts:47` · A sixth gate in the current direct `if (this.settings.foo === undefined) ... *_UNRESOLVED` form → the derived set grows to six and the unwired entrypoint fails, as intended; an aliased/refactored gate, a third entrypoint, or an incidental `foo:` later in the sliced source → the guard can miss or falsely satisfy the obligation · **Required fix:** retain this useful interim guard, but close the class by making `WalkingSkeletonSettings.synthesisRolePolicy` required and repairing the four measured TS2741 sites under a widened contract. Do not describe the text guard as making omission impossible.

4. **FOLLOW-UP — packet/report accounting contains additional contradictions.** `packets/t17t9-worker.md:50`, `packets/t17t9-worker.md:77`, `agent-reports/t17t9.md:17`, and `agent-reports/t17t9.md:41` · One review record → the packet calls this both the fourth and fifth instance, while the worker report says four files then lists five and says two downstream causes where it later establishes three · **Required fix:** make the packet/report counts internally consistent; separately identify the five committed files and any non-patch mission-document append.

## Answers to the packet questions

1. The synthesis-role provenance check is correct for its own family: `readSynthesisRoleControls` requires and parses the three rows, the patch checks all three returned source refs, and the runner independently resolves both role identities against configured and claim-eligible providers. It is not complete for the whole acceptance path: acceptance reads five T16 families and checks only this one.

2. The guard genuinely derives the obligation set; the five-name `arrayContaining` is an anti-vacuity floor, not the list iterated in the deployment check. A sixth field written in the existing gate form is discovered and checked automatically. The source-shape and entrypoint-enumeration limitations in Finding 3 remain.

3. Reverting the `?` was correct. Shipping a non-compiling tree was not acceptable, and the packet explicitly said to stop and name the extra sites rather than widen authority. The worker did that. The runtime guard is an interim regression check, not class closure; the type change should be completed in a separately authorized repair.

4. Refusing to green T17 by editing expectations was correct. The qualitative conclusion is also correct: 109 still covers the post-T9 maximum and is not tight. The stated 94 is only the patch's one-round path. The live three-round maximum derived from the loop and formula is `88 + 6 * 3 = 106`, so the real slack is 3 attempts, not 15.

5. The lane should not wait for F-T17T9-1 or F-SEALEDROWS-B; those are separable test-fixture tickets and the production gate fix is their prerequisite. It should wait only for Finding 1's in-lane evidence correction. After that, merging the correct partial is preferable to bundling unrelated fixture repairs.

6. Packet audit: the unreachable six-green outcome is the admitted orchestrator defect. Additional non-blocking defects are the packet's internal fourth/fifth contradiction and its indirect gate-script reference at line 121 instead of the promised absolute path; the worker report has the two accounting errors in Finding 4.

## Evidence checked

- Immutable commit range: base `d08ee9283244dcfb76d68820360810c7749940d6`, head `b763ffb7b33c9ad1bb0984af5668c919857a4411`; five changed files; patch SHA-256 `881ed09f59cb0e8a78866bf8dc7e85bfda60b5d44d054deb24d9032ac59cc50d`.
- The five current blob hashes match `logs/t17t9/precommit-manifest.txt` 5/5. `apps/runner/src/index.ts` and `apps/runner/src/main.ts` are unchanged from base.
- Fresh exact-head `pnpm exec tsc --noEmit`: exit 0.
- Fresh exact-head `pnpm exec vitest run tests/unit/deployment-register-family-wiring.test.ts`: 2/2 passed.
- Worker records: 28 `.log` files and 28 `CLEAN-STATE: unchanged`; runtime-policy 8/8 in all three cluster runs; omission mutant killed with `acceptance (ceremony): synthesisRolePolicy`; T17 1/2; mono-panel 0/1; panel-multi-maker 0/2; ceremony 1/2.
- The four TS2741 sites in `class-1-required-field-typecheck.log` match the report; `final-1-typecheck.log` is exit 0. The lint record is exit 1 on the three pre-existing `obs-capture` edges.
- Source trace: `readFamily` → `readSynthesisRoleControls` → `readAcceptanceRuntimePolicy` → `createAcceptanceRuntime` → the runner's pre-claim role gates → `runSynthesisLoop`; cost trace through `computeStructuralCeilingBasis` and the loop's three-round bound.

## Packet audit

The packet gave a precise worktree, base expectation, defect, allowed surface, RED target, and stop rule. Its principal defect—requiring six green tests while forbidding the files needed for five downstream failures—is already admitted. The additional audit residue is Finding 4 plus the non-absolute `gate-run.sh` cross-reference at line 121. None changes the correctness of the production instance fix.

## Not verified

- I could not freshly execute the three new database-backed runtime-policy tests: this reviewer sandbox rejects `listen(127.0.0.1)` with `EPERM`. The worker's 8/8 exact-blob records and 5/5 manifest match are the dynamic evidence.
- I did not run the full cluster, the full acceptance suite, or lint. Scoped review only.
- I did not dynamically run the corrected three-round T17 scenario; 106 is derived from the shipped loop bound, the formula's disclosed six synthesis sites, the recorded 88 pre-serve attempts, and the three-attempt organ bound.
- No acceptance end-to-end path is green at this head; the remaining failures are artifact-verified but not repaired here.

## PREDICTIONS

1. A three-round evaluator double will produce six synthesis-role call sites and 106 ledger attempts, while the current basis remains 109; T17 will still fail, now on accurate maximum-path evidence.
2. F-T17T9-1 plus F-SEALEDROWS-B will turn the four acceptance failures green without changing this production fix; the T17 tightness failure will remain.
3. Making the runner field required and repairing the four measured TS2741 call sites will typecheck cleanly and replace the source-text class guard with compile-time closure.

## Validated patch-risk assessment

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9",
    "sourceType": "commit_range",
    "base": "d08ee9283244dcfb76d68820360810c7749940d6",
    "head": "b763ffb7b33c9ad1bb0984af5668c919857a4411",
    "changedFiles": [
      "dialectical-engine/acceptance/main.ts",
      "dialectical-engine/acceptance/runtime-policy.test.ts",
      "dialectical-engine/acceptance/runtime-policy.ts",
      "dialectical-engine/tests/integration/t17-envelope-ledger.test.ts",
      "dialectical-engine/tests/unit/deployment-register-family-wiring.test.ts"
    ],
    "sha256": "881ed09f59cb0e8a78866bf8dc7e85bfda60b5d44d054deb24d9032ac59cc50d"
  },
  "recommendation": "revise",
  "workflowLabel": "revise",
  "impact": {
    "rating": "high",
    "rationale": "The patch controls provider identities and loop bounds for every served acceptance answer; a regression can block the demonstration and all acceptance runs that reach synthesis."
  },
  "regressionLikelihood": {
    "rating": "moderate",
    "rationale": "The production change is narrow and directly exercised, but the changed high-risk envelope fixture exits after one synthesis round while claiming a maximum path, so one material validation claim is presently false."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "Reader/provenance tests and current-entrypoint wiring checks exist and recorded passes match the committed blobs, but no acceptance end-to-end test completes and the maximum-path cost test is red and understates the post-T9 maximum.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "easy",
    "rationale": "The patch adds one register read and one settings handoff, with no migration or persistent-format change; an isolated revert restores the former fail-closed behavior."
  },
  "confidence": {
    "rating": "high",
    "rationale": "The immutable range, five blobs, runtime callers, refusal gates, synthesis loop, formula, worker records, and downstream ticket causes were traced; the remaining fresh-run sandbox limitation is non-decision-critical."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "createAcceptanceRuntime is a shipped acceptance entrypoint and currently constructs WalkingSkeletonRunner without the mandatory synthesis-role family."
  },
  "statusQuoRisk": {
    "rating": "high",
    "rationale": "Without the production wiring, every acceptance work item that reaches synthesis refuses before serving an answer."
  },
  "autoMergeExclusions": [
    "architecture_specific_rollout",
    "other"
  ],
  "affectedRuntimeRoots": [
    "dialectical-engine/acceptance/main.ts:createAcceptanceRuntime",
    "dialectical-engine/acceptance/runtime-policy.ts:readAcceptanceRuntimePolicy",
    "dialectical-engine/apps/runner/src/index.ts:WalkingSkeletonRunner.execute",
    "dialectical-engine/packages/serve/src/synthesis.ts:runSynthesisLoop"
  ],
  "importantCallers": [
    "dialectical-engine/acceptance/run-acceptance.ts",
    "dialectical-engine/acceptance/eval-harness-cli.ts",
    "dialectical-engine/acceptance/dual-maker-proof.ts",
    "dialectical-engine/acceptance/review-catch-up.ts"
  ],
  "riskDrivers": [
    "Every served acceptance answer depends on the supplied role family.",
    "Five named downstream tests remain red.",
    "The changed envelope fixture labels a one-round run as a maximum path.",
    "WalkingSkeletonSettings still declares the runtime-mandatory field optional."
  ],
  "protectiveFactors": [
    "The shared register reader validates all three role-family members and fails on missing or malformed rows.",
    "Acceptance checks every synthesis-role sourceRef against its deployment prefix.",
    "The runner independently resolves both sealed role refs against configured and claim-eligible providers.",
    "The five committed blobs match the precommit manifest and tsc passes at the exact head."
  ],
  "materialBoundaries": [
    {
      "id": "synthesis_role_provenance",
      "invariant": "All three synthesis-role controls must come from the acceptance deployment's sealed register family before any role is called.",
      "runtimeRoot": "readAcceptanceRuntimePolicy -> createAcceptanceRuntime -> WalkingSkeletonRunner.execute",
      "counterexample": "A same-version synthesis-role row from another deployment names a provider identity acceptance did not seal.",
      "legitimateControl": "readSynthesisRoleControls validates the complete three-row family; runtime-policy.ts checks every returned sourceRef; runner gates both role refs against configured and claim-eligible providers.",
      "result": "supported"
    },
    {
      "id": "deployment_wiring",
      "invariant": "Each current deployment entrypoint supplies every settings field that the runner refuses over.",
      "runtimeRoot": "apps/runner/src/main.ts and acceptance/main.ts",
      "counterexample": "acceptance/main.ts omits synthesisRolePolicy and every work item refuses with SYNTHESIS_ROLE_CONTROLS_UNRESOLVED.",
      "legitimateControl": "The patch passes policy.synthesisRolePolicy and the derived guard checks both current entrypoints; the exact omission mutant is killed.",
      "result": "supported"
    },
    {
      "id": "maximum_path_cost_evidence",
      "invariant": "A test described as the maximum post-T9 path must exercise all three allowed synthesizer/evaluator rounds before assessing ceiling tightness.",
      "runtimeRoot": "tests/integration/t17-envelope-ledger.test.ts -> runSynthesisLoop",
      "counterexample": "The evaluator double always returns satisfied=true, so the loop exits in round 1 and records two serve sites and 94 attempts rather than the six-site, 106-attempt maximum.",
      "legitimateControl": "runSynthesisLoop permits three rounds and computeStructuralCeilingBasis discloses six synthesis-loop sites while conservatively billing seven; this proves coverage but contradicts the test's maximum-path evidence and 94-attempt looseness claim.",
      "result": "contradicted"
    }
  ],
  "validation": [
    {
      "name": "fresh exact-head pnpm exec tsc --noEmit",
      "status": "passed",
      "protects": "Type compatibility of the committed tree."
    },
    {
      "name": "fresh exact-head deployment-register-family-wiring.test.ts",
      "status": "passed",
      "protects": "Current refusal-shaped fields are textually supplied by both current entrypoints."
    },
    {
      "name": "worker runtime-policy exact-blob gate records, 8/8 across three cluster runs",
      "status": "passed",
      "protects": "Acceptance reads the sealed synthesis-role family and refuses the tested foreign provenance."
    },
    {
      "name": "worker t17-envelope-ledger exact-blob record",
      "status": "failed",
      "protects": "Maximum-path ledger count, serve topology, coverage, and tightness; T17B alone passes."
    },
    {
      "name": "worker mono-panel, panel-multi-maker, and ceremony records",
      "status": "failed",
      "protects": "End-to-end acceptance completion; failures moved past the fixed gate to separately identified fixture defects."
    },
    {
      "name": "fresh reviewer database-backed policy run",
      "status": "unavailable",
      "protects": "Independent rerun of the three new database-backed properties; local listen failed with EPERM in the reviewer sandbox."
    }
  ],
  "unknowns": [
    {
      "summary": "The reviewer could not freshly rerun local-listener database suites because the sandbox denied listen(127.0.0.1); exact-blob worker records were available.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```

MERGEABLE: no — correct the changed T17 maximum-path fixture and its 94-attempt claim first; do not wait for the separately ticketed acceptance doubles.
