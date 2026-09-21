CODEX REVIEW H-FIX r1 — APPROVE · comments read through: h-fix-r1-2026-09-05

# H-FIX CODEX r1 — reviewer self-case

Finding count: **0 BLOCKING · 2 FOLLOW-UP**

## Outcome

I recommend **merge with human review** for `d08ee9283244dcfb76d68820360810c7749940d6..a81ada2a9f58c2c83eab3ed9a4ed5bca9612adef`. I found no implementation defect. The two follow-ups concern review-packet quality: an unsafe route was presented without its invariant, and the inline dispatch requested for audit was not filed. F-H-3 is already ticketed and is not counted again.

## Independent case

I read both H sections of `agent-reports/h-diag.md` before `agent-reports/h-fix.md`, then rebound every material claim to the immutable range rather than accepting the fix report's conclusions.

The label correction is required by the fixture. One root means no runner-up margin; one parseable judge means no measurable disagreement. T11's rung zero therefore dominates and yields `CONTESTED` plus `LABEL-BASIS-INCOMPLETE`. A second root alone would still be insufficient: `SUPPORTED` also requires measured low disagreement and the remaining threshold conditions. Converting this fixture would destroy the mono-maker properties it is explicitly asserting.

The liveness correction is the narrow valid repair. The helper is intentionally false outside encrypted version 1, while ordinary runs use `NULL`. The new first disjunct admits that plaintext state. For version 1 it is false, leaving the prior helper predicate exactly as the boolean control. The broader historical restoration would omit active identity from the initial selector; changing the helper itself would alter three migration-local bare refusal barriers and requires a different audit.

The new sweep test has causal depth: it writes the event, invokes sweep, computes the latest query timestamp, enters `decideRetirement`, and proves the target is not archived. The lifecycle test separately proves revival. Repeated RED/GREEN artifacts and two one-cause mutants distinguish these behaviors from the expectation-only change.

## Counterexample and risk checks

- **Encrypted branch:** at version 1, `IS DISTINCT FROM 1` is false and the old helper remains decisive. The encryption trigger restricts current stored non-null versions to 1. Lease, lock, and in-loop controls remain.
- **Inactive owner:** the rejected two-clause restoration would select it initially because it lacks the active-state check. Downstream controls should still prevent insertion, making the route a behavior and defense-in-depth regression rather than a demonstrated authorization bypass.
- **Known-red s7:** exact head reports `11 passed/1 failed` on the allocation probe count. Base-era artifacts contain the same test, line, observed value, and expectation. The test uses encrypted runs, whose changed predicate branch is equivalent, so I do not attribute the failure to this patch.
- **Status quo:** leaving the defect in place is high risk because every default plaintext ask can fail to record liveness, revive an archived run, or refresh retirement.
- **Recovery:** the product delta is one predicate and no migration; mechanical rollback is easy but restores the defect.

## What I checked against overclaiming

I did not equate “two roots” with a reachable `SUPPORTED` label; both evidence limbs must be measured. I did not treat downstream guards as making the unsafe historical restoration acceptable; they bound severity but do not preserve selector semantics. I also did not promote the known s7 failure into a patch finding merely because it was observed at exact head. Finally, I kept F-H-3 visible as a protection gap without duplicating its ticket or treating missing mutation coverage as proof of unsafe code.

## Artifact reconciliation

- Exact range: one commit, two expected files, `+86/-3`.
- Patch SHA-256: `f1069829c5c5c8f85faed2e0b6718f4ea22da31688eaeede61e429aca9497ab3`.
- Worker manifest hashes match both committed head blobs.
- Database arithmetic: old `84 passed + 1 failed = 85`; add two tests and fix the old failure → `87 passed`.
- Recorded green artifacts: whole database `87/87`; S06 label `48/48`; liveness S11 `4/4`; evidence database `3/3`; developer principals `9/9`; TypeScript exit 0.
- Causal artifacts: three F-H-2 RED/GREEN pairs, three lifecycle GREEN runs, and one mutant for each fix cause.

## Validated patch-risk JSON

The following assessment passed the packaged `validate_patch_risk_assessment.py` validator:

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag",
    "sourceType": "commit_range",
    "base": "d08ee9283244dcfb76d68820360810c7749940d6",
    "head": "a81ada2a9f58c2c83eab3ed9a4ed5bca9612adef",
    "changedFiles": [
      "dialectical-engine/packages/liveness/src/index.ts",
      "dialectical-engine/tests/integration/database.test.ts"
    ],
    "sha256": "f1069829c5c5c8f85faed2e0b6718f4ea22da31688eaeede61e429aca9497ab3"
  },
  "recommendation": "merge",
  "workflowLabel": "human_review_required",
  "impact": {
    "rating": "high",
    "rationale": "The predicate controls shared persistent QUERY events, archival revival, and retirement freshness for the default plaintext mode."
  },
  "regressionLikelihood": {
    "rating": "low",
    "rationale": "The change is a narrow NULL-versus-version-1 partition with causal RED/GREEN and mutant evidence; the encrypted branch algebraically reduces to the prior predicate."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "Direct database, liveness, S06, evidence, principals, and type checks passed in recorded artifacts, but F-H-3 remains an open encrypted-branch mutation gap and exact-head s7 retains a known pre-existing failure.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "easy",
    "rationale": "The runtime change is one predicate in one function and adds no migration; reverting is mechanically simple, although it restores the original defect."
  },
  "confidence": {
    "rating": "moderate",
    "rationale": "The exact range, runtime callers, SQL helper semantics, causal logs, and known-red comparison were inspected; the inline dispatch was unavailable and the encrypted branch lacks the already-ticketed dedicated mutant."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "The head contains the reported two-file patch, and the API submit path invokes the changed recordQuery function before starting a run."
  },
  "statusQuoRisk": {
    "rating": "high",
    "rationale": "Without the patch, ordinary plaintext re-asks write no QUERY event, fail to revive archived runs, and fail to refresh retirement liveness."
  },
  "autoMergeExclusions": [
    "persistent_state",
    "broad_shared_default"
  ],
  "affectedRuntimeRoots": [
    "apps/api/src/index.ts:1247 PostgresAskApplication.submit",
    "packages/liveness/src/index.ts:129 recordQuery",
    "packages/liveness/src/index.ts:445 sweep",
    "packages/serve/src/index.ts:1227 deriveVerdictLabel"
  ],
  "importantCallers": [
    "apps/api/src/index.ts:1247 records QUERY liveness on the shared ask path",
    "packages/liveness/src/index.ts:474 feeds lastQueriedAt into decideRetirement",
    "packages/db/src/index.ts:350 withRunContentLease independently rechecks owner liveness"
  ],
  "riskDrivers": [
    "Shared persistent-state path used by ordinary plaintext runs",
    "Encrypted version-1 branch must continue rejecting erased, inactive, or cleanup-pending owners",
    "Neighboring exact-head s7 suite remains known red"
  ],
  "protectiveFactors": [
    "For version 1 the new predicate reduces exactly to the old helper predicate",
    "Feature RED/GREEN runs and two mutants distinguish the two fixes",
    "Whole database, S06, liveness, evidence, principals, and type-check artifacts are green"
  ],
  "materialBoundaries": [
    {
      "id": "plaintext_liveness",
      "invariant": "A QUERY against an ordinary plaintext run records liveness and can revive an archived run.",
      "runtimeRoot": "packages/liveness/src/index.ts:129 recordQuery",
      "counterexample": "A NULL content_encryption_version is sent to a helper that returns false outside version 1, so the candidate disappears.",
      "legitimateControl": "The new IS DISTINCT FROM 1 arm admits plaintext while existing ownership, event insertion, and projection logic remain.",
      "result": "supported"
    },
    {
      "id": "encrypted_erasure",
      "invariant": "Version-1 encrypted runs with inactive, erased, or cleanup-pending owners remain ineligible.",
      "runtimeRoot": "packages/liveness/src/index.ts:141 candidate selector",
      "counterexample": "Restoring the old pair of NOT EXISTS clauses would omit the active-identity requirement.",
      "legitimateControl": "At version 1 the new predicate is false OR core.run_private_content_is_live(run_id), identical to the old branch; downstream lease and lock controls remain.",
      "result": "supported"
    },
    {
      "id": "mono_maker_label",
      "invariant": "A single-root, single-judge walking skeleton cannot be labeled SUPPORTED when margin and disagreement bases are absent.",
      "runtimeRoot": "packages/serve/src/index.ts:1227 deriveVerdictLabel",
      "counterexample": "Retaining SUPPORTED would bypass the absent-basis rung and contradict the mono-maker fixture.",
      "legitimateControl": "CONTESTED with LABEL-BASIS-INCOMPLETE and null unavailability preserves the usable-basis contract.",
      "result": "supported"
    },
    {
      "id": "retirement_freshness",
      "invariant": "A recent plaintext QUERY prevents sweep from retiring the target under the configured window.",
      "runtimeRoot": "packages/liveness/src/index.ts:445 sweep",
      "counterexample": "A test that checks only event insertion would not prove the timestamp reaches decideRetirement.",
      "legitimateControl": "The new test records QUERY, invokes sweep, and asserts the target is absent from archived run IDs.",
      "result": "supported"
    }
  ],
  "validation": [
    {
      "name": "tests/integration/database.test.ts",
      "status": "passed",
      "protects": "Recorded whole-file run passed 87 tests, including the lifecycle and two new blast-radius cases."
    },
    {
      "name": "F-H-2 focused RED/GREEN",
      "status": "passed",
      "protects": "Three RED runs fail both plaintext assertions and three GREEN runs pass both."
    },
    {
      "name": "three-run lifecycle RED/GREEN and mutants",
      "status": "passed",
      "protects": "Three GREEN runs pass; reverting liveness fails ARCHIVED_REVIVED and reverting the expectation fails the label assertion."
    },
    {
      "name": "S06 selection-label, liveness S11, evidence database, developer principals, and tsc",
      "status": "passed",
      "protects": "Recorded artifacts show 48/48, 4/4, 3/3, 9/9, and type-check exit 0."
    }
  ],
  "unknowns": [
    {
      "summary": "The exact-head s7 authorization test retains a known pre-existing allocation-probe assertion failure: 1 failed and 11 passed with the same assertion and observed value as base-era logs.",
      "decisionCritical": false
    },
    {
      "summary": "A dedicated test does not yet mutate the exact version-1 recordQuery branch; this is already tracked as F-H-3.",
      "decisionCritical": false
    },
    {
      "summary": "The verbatim inline worker dispatch was not filed with the review artifacts.",
      "decisionCritical": false
    },
    {
      "summary": "No D15-grade end-to-end benchmark was run.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```

## Packet audit

The packet correctly bound base, order, outcome, scope, RED-first evidence, blast radius, and the no-fixture-evasion rule. It did not adequately bound its mechanism examples: the historical explicit-clause route loses the active-owner condition and should not have appeared as a peer option without an invariant. The requested inline-dispatch comparison is unreproducible because the dispatch is not in the mission artifacts.

## Not verified

- Verbatim inline dispatch text.
- Fresh execution of all pre-commit worker commands; I used the complete recorded artifacts and independently inspected the exact patch and blob hashes.
- A dedicated version-1 guard mutant; F-H-3 remains the explicit follow-up.
- Full API submit orchestration and a D15-grade end-to-end run.
- Literal encrypted-branch query-plan identity; only result-level branch equivalence is established.

## PREDICTIONS

- Liveness-only reversion will fail event persistence, retirement freshness, and archived revival while leaving the corrected label assertion valid.
- Label-only reversion will fail on `CONTESTED` versus `SUPPORTED` while the liveness tests stay green.
- The F-H-3 mutant will die only if its harness reaches the version-1 selector with an erased or deactivated owner.
- A future packet that states the encrypted-owner invariant will rule out the historical two-clause restoration before implementation.

MERGEABLE: yes — no patch defect survived the independent source, history, caller, invariant, and artifact audit; the two packet follow-ups and already-filed F-H-3 do not require revising this commit.
