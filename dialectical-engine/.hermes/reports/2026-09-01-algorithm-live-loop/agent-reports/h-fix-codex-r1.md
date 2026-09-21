CODEX REVIEW H-FIX r1 — APPROVE · comments read through: h-fix-r1-2026-09-05

# H-FIX CODEX r1

Finding count: **0 BLOCKING · 2 FOLLOW-UP**

Recommendation: **merge with human review**. The implementation is correct for the diagnosed failures, the encrypted branch retains its prior result, and the causal test artifacts are proportionate. This is not an auto-merge candidate because the change affects persistent state on a broad shared default path, exact-head s7 is still known red, and the version-1 mutation gap remains open as the already-filed F-H-3.

Exact reviewed patch:

- Base: `d08ee9283244dcfb76d68820360810c7749940d6` (`c5850f732e93760cc109429a22f941c6e2d34eba` tree)
- Head: `a81ada2a9f58c2c83eab3ed9a4ed5bca9612adef` (`a55aafaf3c66155475d450388d9d9ea2419e9792` tree)
- Range: one commit, two files, `+86/-3`
- Binary full-index patch SHA-256: `f1069829c5c5c8f85faed2e0b6718f4ea22da31688eaeede61e429aca9497ab3`

## Findings

### H-P1 · The worker packet offered an unsafe historical restoration as a peer mechanism — FOLLOW-UP

**File/line:** `packets/f-h-fix-worker.md:44-47` · **Input → wrong outcome:** a worker may follow the listed “restore the explicit clauses” route and replace the private-content helper with the two historical `NOT EXISTS` clauses. That fixes plaintext selection but removes the helper's active-identity condition from the initial version-1 candidate selector. Downstream lease/lock checks still prevent the prohibited write, so this is not an exploitable authorization bypass in the reviewed head; it nevertheless broadens candidate processing, changes inactive/erased failure behavior, and weakens defense in depth. The route was not marked as an unvalidated example and the packet did not state the encrypted-owner invariant. · **Required fix:** future packets should state the outcome and invariant—plaintext runs are eligible while version-1 inactive, erased, or cleanup-pending owners behave exactly as before—and label mechanisms as hypotheses/examples subject to caller and invariant audit. Do not list the historical two-clause restoration as an acceptable peer route without that qualification.

### H-P2 · The requested inline-dispatch audit is not reproducible from the filed artifacts — FOLLOW-UP

**File/line:** `packets/h-fix-codex-r1.md:71-72` · **Input → wrong outcome:** a fresh reviewer is told to audit the inline dispatch, but the mission tree contains no verbatim dispatch artifact or pointer to one. The immutable base/head and filed worker packet can be checked, but hidden dispatch text cannot be compared for base, scope, or instruction drift. · **Required fix:** file the exact inline dispatch under the mission directory, or embed it verbatim in the reviewer packet and identify it by path/hash.

Neither finding changes the patch recommendation. F-H-3 is not repeated as a new finding because it is already ticketed.

## Review answers

### 1. Diagnosis and the stale `SUPPORTED` expectation

The diagnosis is sound. `createRunnerWork` uses the `createRun` defaults of one agent and depth one. The lifecycle fixture consequently has one servable root and one parseable judge. `selectServedRootByStrength` has no `ranked[1]`, so the margin basis is absent; the single-judge skeleton makes disagreement absent as well. `deriveVerdictLabel` handles either absent basis in rung zero and returns `CONTESTED` with `LABEL-BASIS-INCOMPLETE`. Its later `SUPPORTED` rung is unreachable for this fixture.

Two roots alone would not make the old expectation valid. A fixture would need at least two servable roots for a measured margin, at least two parseable judgements for measured disagreement, a winner at or above the high threshold, margin above gamma, and disagreement below its threshold. Changing this walking-skeleton fixture that far would contradict its same-test `MONO_MAKER_RUN`, `SINGLE-LINEAGE`, and `MONO_LINEAGE_DEPTH_NOT_EXPANDED` assertions. Updating the expected label is therefore the correct fix.

`verdict_unavailable: null` also remains correct: `deriveHonestVerdict` treats this as a usable verdict basis with a real label, while the mark honestly records incomplete label evidence.

### 2. Rejected repair routes

Both routes were rejected for real reasons.

- Restoring the two pre-`2d1f86b8` `NOT EXISTS` clauses omits `identity_user.state = 'active'`, which is part of `core.run_private_content_is_live`. That is a regression in the initial selector even though downstream controls still reject the eventual write.
- Making `core.run_private_content_is_live` return true outside version 1 would change a shared SQL helper rather than this call site's precondition. In migration `0040`, its executable uses are all negative/refusal-direction checks. Two are locally version-1-gated; three are bare barriers. Broadening the helper would therefore require a migration-level caller and contract audit.

The headline “eleven sibling call sites guard it” is directionally useful but scope-sensitive. In current TypeScript there are twelve executable references: eleven are guarded and the sole bare reference is an uncalled database assertion wrapper. Migration-local helper uses are a separate population. The seat correctly audited semantics instead of relying on the count.

### 3. Encrypted path preservation

For the currently valid encrypted state, `content_encryption_version = 1`, the new predicate

`content_encryption_version IS DISTINCT FROM 1 OR core.run_private_content_is_live(run_id)`

reduces to `false OR helper`, so its boolean result and selected-row behavior are identical to the prior bare helper call. The `SELECT`, ordering, limit, and later controls are unchanged. This is semantic branch equivalence, not literally identical SQL text or a guaranteed identical query plan.

The current storage contract admits either plaintext `NULL` or encrypted version `1`; non-null unsupported versions are rejected by the encryption-state trigger. The plain `NULL` branch is the intended delta. `withRunContentLease.assertLive`, `core.lock_owned_live_runs`, and the in-loop liveness gate remain independent downstream controls.

### 4. Blast-radius tests

The first added test proves the direct producer contract: `recordQuery` returns one recorded run and persists one `QUERY` event for a plaintext run.

The second test is not merely another event-write assertion. It records a query, calls `liveness.sweep`, lets sweep compute `MAX(QUERY.occurred_at)`, and reaches `decideRetirement` with that `lastQueriedAt`. Under a 180-day window it then asserts that the target is absent from the archived IDs. It therefore exercises both named consumers through the target behavior.

The existing lifecycle test covers the other consequence: after archival, `recordQuery` drives the projection to `ARCHIVED_REVIVED`.

### 5. Arithmetic, s7, and unloaded surfaces

The suite arithmetic reconciles. Before the additions, the database file had 85 tests (`84 passed + 1 failed`). The patch adds two tests and fixes the old failure, producing `87 passed`.

Recorded evidence includes:

- F-H-2: three RED runs at `2 failed/85 skipped`, then three GREEN runs at `2 passed/85 skipped`.
- Lifecycle: three GREEN runs at `1 passed/86 skipped`; the liveness mutant fails `ARCHIVED_REVIVED`, and the label mutant fails `CONTESTED` versus `SUPPORTED`.
- Whole database file: `87/87` passed.
- S06 selection-label: `48/48`; liveness S11: `4/4`; evidence database: `3/3`; developer principals: `9/9`; TypeScript no-emit: exit 0.
- Exact-head s7: `11 passed/1 failed`, with `expected 1 to be >= 2` in “locks every matching run before allocation while a rejected transfer is queued.” The same named assertion, source line, expected/observed values, and signature occur in base-era t00 and b11/b12 logs. The s7 fixture uses encrypted runs; the reviewed version-1 branch is equivalent to base. This is a known pre-existing failure, not a patch-caused finding.

The production root is broader than the listed unit surface: `PostgresAskApplication.submit` calls `recordQuery` before starting a run. No listed artifact loads that complete API orchestration end to end, and the dedicated S06 content-encryption contract mutant requested by F-H-3 is absent. Those are bounded coverage gaps, not evidence against the predicate: the direct persistence path is tested, the API call is a thin caller, and the encrypted branch plus downstream controls are source-proven.

## Packet audit

The worker packet did several important things correctly: it pinned the exact prerequisite base, required the diagnosis report before the fix report, separated the two causes, required a blast-radius test and RED-first evidence, constrained edits to the two expected files, prohibited changing the fixture to evade the stale assertion, and supplied a stall guard and report skeleton.

The route list was nevertheless defective for the reason in H-P1: D58 gives the implementer mechanism ownership, but a coordinator-proposed mechanism still needs to be marked as an example and bounded by the relevant invariant. The seat caught the unsafe option and selected the narrow call-site guard.

The inline dispatch cannot be audited because it was not filed; see H-P2. The filed packet and actual patch agree on base, intended scope, changed files, and output. The pre-commit worker manifest hashes for both changed files match the committed head blobs. The exact-head orchestrator s7 log also binds its commit and tree to the reviewed head.

## Risk assessment

- **Impact: high.** The change controls persistent liveness state on the default plaintext ask path and affects revival and retirement.
- **Regression likelihood: low.** The delta is a narrow state partition with causal RED/GREEN and mutant evidence; version 1 reduces to the prior condition.
- **Regression protection: partial.** Relevant direct and neighboring artifacts are green, but s7 is known red and F-H-3 remains open.
- **Recoverability: easy.** One predicate can be reverted without a migration, though reverting restores the production defect.
- **Confidence: moderate.** Exact source, history, callers, SQL invariants, artifact hashes, and logs were checked; the missing dispatch and dedicated version-1 mutant cap confidence.
- **Workflow: human review required.** Auto-merge exclusions are `persistent_state` and `broad_shared_default`.

## Not verified

- The verbatim inline worker dispatch was unavailable.
- I did not re-execute the worker's pre-commit commands; I reviewed their complete artifacts and independently checked the exact committed patch and blob hashes. The only exact-head execution artifact is the known-red s7 run.
- F-H-3's requested dedicated version-1 erased/deactivated `recordQuery` mutant does not yet exist. Current safety is established by branch equivalence and independent downstream controls, not that missing test.
- No D15-grade end-to-end or benchmark run was provided, and no listed suite loads the full `PostgresAskApplication.submit` orchestration.
- I did not claim literal query-plan identity for the encrypted branch.

## PREDICTIONS

- Reverting only the liveness predicate will make both added plaintext tests fail and will return the archived lifecycle projection to `UNDER_REVIEW` instead of `ARCHIVED_REVIVED`.
- Reverting only the label expectation will leave the liveness assertions green and fail on actual `CONTESTED` versus expected `SUPPORTED`.
- Adding a second root without adding a second parseable judgement for the winner will still leave one basis limb absent and keep the label `CONTESTED`.
- Restoring only the historical two `NOT EXISTS` clauses will admit an inactive version-1 owner into the initial candidate set; a downstream live-content control should then refuse before inserting the event.
- F-H-3's version-1 mutant should fail once its exact guard is replaced with plaintext admission; if it survives, the harness is not exercising the changed selector.

MERGEABLE: yes — the narrow call-site guard fixes the default plaintext liveness defect, the corrected label matches the fixture's actual T11 basis, and the remaining gaps are non-blocking and already bounded.
