CODEX REVIEW SEALEDROWS r6 — CHANGES · comments read through: sealedrows-postcap2-2026-09-05

# SEALEDROWS CODEX r6 — reviewer self-case

Finding counts: **2 BLOCKING (→ V) · 4 FOLLOW-UP (→ ticket; two already ticketed/recorded) · 4 packet-audit corrections**.

## Outcome

`CHANGES`, high confidence. The round moved the observation to the correct HTTP boundary and independently selects captured evaluator requests by their serialized role rather than by the prompt under test. That closes the r5 bypass for the initial request and first repair. It does not close the full deployed attempt domain: both acceptance and development seal `CONFORMANCE.maxAttempts` at 3, while this fixture stops at 2. A second-repair-only prompt mutation therefore survives.

The same test adds an exact `messages.length + 1` assertion and assumes the serialized evaluator envelope is the first user message. Those are implementation-shape pins, not the leading-contract property, and directly conflict with AMENDMENT 6.

Patch-risk disposition: **revise / revise**. Impact if wrong is moderate; likelihood high; regression protection partial; recoverability easy; confidence high. Patch SHA-256: `22d242c90b8182dedc33758c424c60ee0222743eafaf76cdf8ed09843c261834`.

## Root-cause trace

- The provider loops through every integer attempt up to `request.bound.maxAttempts` and can invoke `buildRepairPacket` after attempts 1 and 2.
- The evaluator callback closes over the original two-message packet; the current helper appends one user repair message and is statically correct.
- The deployed acceptance and development bounds are both 3.
- The r6 fixture overrides the test default from 1 to 2 and scripts one rejection followed by success, so only the first callback invocation is reachable.
- The loop assertion is correct over the retained set; the retained set is incomplete for the supported bound.
- Anti-vacuity already comes from exact attempt count. The message-count delta contributes no reachability proof and instead freezes one helper shape.

The minimal falsifier is a callback that returns the correct leading contract on repair call 1 and a different leading contract on repair call 2. The current fixture never invokes the latter. The minimal legitimate-control counterexample is a repair packet that keeps the contract first and appends two context messages; current production could accept it, while the test rejects it.

## Evidence and suite reconciliation

- Base/head resolved exactly to `7dda3cc0d3305c96e62dadb77f1eb941165d633a` and `8a08f5e1aae1e462720cef5e06c06dcd51eb5c67`.
- `a8b99532..8a08f5e1` changes only `tests/integration/database.test.ts` (+55 −2); the committed blob equals the one-path precommit SHA-256 manifest.
- Runs 2 and 3 normalize to the same 13 full failure names as base. Run 1 contains exactly one additional registration timeout.
- Worst-run-wins makes the cluster RED. Because the changed integration file is not loaded and the timeout cause is not discriminated, causal lane classification is CANNOT-ASSESS—not CLEAN and not proven DIRTY.
- F22's observation-only disposition and refusal to widen D.2 are correct. Its `5/5 solo` statement is not artifact-backed.
- The retained integration file has 84 passes and the already established F-SEALEDROWS-H failure; the changed test passes there. Typecheck exits 0.
- My fresh scoped exact-head attempt is invalid evidence: `listen(127.0.0.1)` failed with `EPERM` before the file ran, and Vitest reported all 85 skipped.

## Findings

### B1 — **BLOCKING (→ V)**

**File/line ·** `database.test.ts:4140-4147,4182-4194` plus the sealed 3-attempt rows. **Input → wrong outcome ·** invalid→invalid→valid with a second-repair-only prompt mutation passes the two-attempt fixture but sends prompt B on attempt 3. **Required fix ·** a third V-authorized test-only round must drive all three attempts and kill the mutation at attempt 2.

### B2 — **BLOCKING (→ V)**

**File/line ·** `database.test.ts:4173-4187` and AMENDMENT 6 lines 698-705. **Input → wrong outcome ·** a leading-contract repair with two added messages or a later reordered user envelope fails despite satisfying the invariant. **Required fix ·** remove the delta, scan all user messages for evaluator role, and keep only scenario attempt-count plus leading-contract assertions.

### F1 — **FOLLOW-UP (→ ticket)**

**File/line ·** `r7-b1-every-attempt-on-the-wire.log:1-26`; D24/D42. **Input → wrong outcome ·** artifact-only replay cannot reconstruct either mutation because the script and custody fields are absent. **Required fix ·** re-capture with `tools/mutate.sh` or mark runtime mutation claims CANNOT-ASSESS.

### F2 — **FOLLOW-UP (→ existing F22; do not re-file)**

**File/line ·** `sealedrows.md:90-108` and `F22-registration-s3b-flake.md:24-44`. **Input → wrong outcome ·** the record asserts five solo passes with no retained r7 solo log. **Required fix ·** attach the logs or qualify the fact; keep the observation-only/CANNOT-ASSESS disposition.

### F3 — **FOLLOW-UP (→ ticket)**

**File/line ·** `sealedrows.md:173` versus `sealedrows-worker.md:661`. **Input → wrong outcome ·** the comments-read cursor dates AMENDMENT 6 to 2026-09-04 instead of 2026-09-05. **Required fix ·** correct the amendment date only.

### F-SEALEDROWS-I — **FOLLOW-UP (→ existing ticket; do not re-file)**

**File/line ·** `apps/runner/src/index.ts:4068-4097`. **Input → wrong outcome ·** synthesizer repair drift has no equivalent wire pin. **Required fix ·** retain it outside this evaluator-only V round.

## What I nearly got wrong

- I nearly approved because a loop over `attempts` reads universal. The quantified set is fixture-created, and production's sealed bound proved it incomplete.
- I nearly accepted `+1` as an anti-vacuity check. `toHaveLength(2)` already performs that job, so the delta can only constrain representation.
- I initially considered the extra cluster failure DIRTY. The worst run establishes a red occurrence, not attribution; D19a requires CANNOT-ASSESS where the cause is not discriminated.
- I nearly credited the two mutant failures from their assertion snippets. D24/D42 make the missing mutation and restore custody decisive even when the static mechanism is convincing.
- I treated the fresh scoped command as likely confirmation until its complete output showed the suite never loaded past the forbidden listen. It contributes no count.

## Packet audit

The accepted hash correction is exact: the test compares the forwarded fixture value `contract:conformance:test-layer`, while other tests prove the sealed digest. AMENDMENT 6 itself is clear about evaluator-only scope, the wire observation, and the prohibition on shape constraints.

The new packet misses four things: it calls the repair assertion leads-only despite the `+1` pin; it over-credits an inadmissible mutant summary; it repeats unretained `5/5 solo` evidence; and it inherits the seat report's wrong amendment date. The SYNTHESIZER gap was correctly kept as a follow-up because V scoped this exception to EVALUATOR.

## Not verified

- No valid fresh exact-head runtime test; the attempted scoped run skipped all tests on sandbox `EPERM`.
- The actual mutation commands, token gates, restores, and before/after hashes behind the two claimed mutants.
- Five solo registration runs.
- The cause of the run-1 intermittent, F-SEALEDROWS-H's cause, a deployed register, full `pnpm test`, other integration files, or acceptance DB suites.

## PREDICTIONS

1. A stateful second-repair mutation will be the shortest counterexample to B1.
2. The next safe test will use invalid→invalid→valid and will not inspect repair message count.
3. Searching every user message rather than only the first will preserve system-prompt-independent selection without freezing repair order.
4. F22 will remain correctly observation-only unless the exact timeout name appears in a second independent cluster.
5. If the mutant campaign is re-run through D42, its useful credit will be the exact failing attempt assertion, not merely exit 1.

## Validated patch-risk JSON

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows",
    "sourceType": "commit_range",
    "base": "7dda3cc0d3305c96e62dadb77f1eb941165d633a",
    "head": "8a08f5e1aae1e462720cef5e06c06dcd51eb5c67",
    "changedFiles": [
      "dialectical-engine/acceptance/ceremony.test.ts",
      "dialectical-engine/acceptance/runtime-policy.ts",
      "dialectical-engine/acceptance/seed-register.test.ts",
      "dialectical-engine/acceptance/seed-register.ts",
      "dialectical-engine/apps/runner/src/dev-deployment-register.ts",
      "dialectical-engine/apps/runner/src/dev-runner-policy.ts",
      "dialectical-engine/apps/runner/src/index.ts",
      "dialectical-engine/packages/serve/src/index.ts",
      "dialectical-engine/tests/integration/database.test.ts",
      "dialectical-engine/tests/integration/t17-envelope-ledger.test.ts",
      "dialectical-engine/tests/unit/f-sealedrows-a-conformance-extractor.test.ts",
      "dialectical-engine/tests/unit/f-sealedrows-a-dataflow.test.ts",
      "dialectical-engine/tests/unit/f-t9b-3-empty-basis-floor.test.ts",
      "dialectical-engine/tests/unit/serve-s05.test.ts",
      "dialectical-engine/tests/unit/t12-t13-band-basis.test.ts"
    ],
    "sha256": "22d242c90b8182dedc33758c424c60ee0222743eafaf76cdf8ed09843c261834"
  },
  "recommendation": "revise",
  "workflowLabel": "revise",
  "impact": {
    "rating": "moderate",
    "rationale": "The r6 delta is test-only, but false protection around a shared evaluator contract can allow later retry-path drift to merge and can reject legitimate repair-packet changes."
  },
  "regressionLikelihood": {
    "rating": "high",
    "rationale": "A source-visible coverage gap leaves the production-allowed third attempt unexecuted, and a source-visible exact-shape assertion contradicts the durable leading-contract invariant."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "The test observes the initial attempt and one repair at the HTTP body, but production permits three attempts; retained mutation custody is incomplete and the fresh exact-head test was skipped after sandbox EPERM.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "easy",
    "rationale": "The r6 commit changes one integration-test file and can be reverted without migration or persisted-state recovery."
  },
  "confidence": {
    "rating": "high",
    "rationale": "The immutable range, patch bytes, changed file, provider loop, both deployment bounds, assertions, retained logs, and authority records were inspected directly."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "The changed integration test drives the owned WalkingSkeletonRunner through the real OpenAI-compatible provider gateway."
  },
  "statusQuoRisk": {
    "rating": "moderate",
    "rationale": "Without a complete durable test, a later second-repair mutation can send a different evaluator system contract under the unchanged contract hash."
  },
  "autoMergeExclusions": [
    "other"
  ],
  "affectedRuntimeRoots": [
    "dialectical-engine/apps/runner/src/index.ts:4146 evaluator role call",
    "dialectical-engine/packages/providers/src/index.ts:314 OpenAICompatibleProviderGateway.call"
  ],
  "importantCallers": [
    "dialectical-engine/acceptance/main.ts:457 WalkingSkeletonRunner acceptance wiring",
    "dialectical-engine/apps/runner/src/main.ts development runner entrypoint"
  ],
  "riskDrivers": [
    "Production CONFORMANCE.maxAttempts is 3 while the test drives 2",
    "The test pins repair message-count delta and first-user placement beyond the leading-contract invariant",
    "The run-1 new timeout failure has CANNOT-ASSESS cause",
    "The mutation summary is not D24/D42 admissible"
  ],
  "protectiveFactors": [
    "r6 changes zero production files",
    "Captured attempts are selected independently of the system-prompt content",
    "The retained integration run shows the named test passing on the precommit file bytes later matched to the committed blob",
    "Runs 2 and 3 have the same normalized 13-name failure set as base"
  ],
  "materialBoundaries": [
    {
      "id": "evaluator_attempts",
      "invariant": "Every evaluator HTTP attempt, including every repair allowed by the sealed bound, begins with EVALUATOR_CONTRACT_TEXT.",
      "runtimeRoot": "OpenAICompatibleProviderGateway.call attempt loop reached from WalkingSkeletonRunner.evaluate",
      "counterexample": "Two schema-invalid evaluator responses cause a third attempt; a stateful or parse-error-dependent repair callback preserves the first repair but substitutes another system contract on the second repair.",
      "legitimateControl": "Drive the sealed three-attempt shape with invalid, invalid, valid responses and assert the first message on all three captured evaluator bodies.",
      "result": "contradicted"
    },
    {
      "id": "repair_packet_durability",
      "invariant": "A legitimate repair packet is accepted whenever the exported contract leads; later message count and user-message position are not contract shape.",
      "runtimeRoot": "database.test.ts wire-level evaluator assertion",
      "counterexample": "A valid repair packet keeps the contract first but appends two repair-context messages or places a repair user message before the serialized evaluator envelope.",
      "legitimateControl": "Assert the attempt count needed by the scenario and the leading contract only; locate the evaluator role by scanning user messages rather than assuming the first user is the envelope.",
      "result": "contradicted"
    },
    {
      "id": "cluster_attribution",
      "invariant": "The three-run verdict uses the worst complete run and does not relabel an unclassified new failure as clean or known unstable.",
      "runtimeRoot": "tests/unit plus tests/architecture verification cluster",
      "counterexample": "Discard run 1 and report only the two baseline-matching runs as clean.",
      "legitimateControl": "Retain the 14-failure worst verdict, classify cause CANNOT-ASSESS, record one F22 observation, and do not widen D.2.",
      "result": "supported"
    }
  ],
  "validation": [
    {
      "name": "retained r7 integration file run",
      "status": "failed",
      "protects": "The named evaluator test passed, but the full file exited 1 on the established F-SEALEDROWS-H failure."
    },
    {
      "name": "retained r7 typecheck",
      "status": "passed",
      "protects": "The precommit test-file change type-checks."
    },
    {
      "name": "retained r7 three-run cluster",
      "status": "failed",
      "protects": "Runs 2 and 3 match base; run 1 adds an unclassified registration timeout, so worst-run-wins is red."
    },
    {
      "name": "fresh exact-head scoped evaluator test",
      "status": "skipped",
      "protects": "No tests ran because the sandbox rejected listen on 127.0.0.1 with EPERM."
    }
  ],
  "unknowns": [
    {
      "summary": "The cause of the run-1 registration timeout is CANNOT-ASSESS.",
      "decisionCritical": false
    },
    {
      "summary": "The claimed five solo passes have no retained r7 solo artifact.",
      "decisionCritical": false
    },
    {
      "summary": "The exact mutations and restore custody behind r7-b1-every-attempt-on-the-wire.log are unavailable under D24/D42.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```

MERGEABLE: no — the evaluator test omits the production-allowed second repair and pins repair-packet shape beyond the V-authorized leading-contract invariant.
