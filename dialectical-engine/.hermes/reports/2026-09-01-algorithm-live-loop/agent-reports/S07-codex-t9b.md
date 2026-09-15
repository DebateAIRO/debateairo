CODEX REVIEW T9B — CHANGES · comments read through: t9b-2026-09-03

# S07 T9B post-cap correction — Codex review

VERDICT: CHANGES — the role-binding correction and all four claimed mutant kills withstand static review, but option 2 changes an exhausted evaluator objection from “serve with a standing mark” into a fatal refusal. That crosses the assertion-retirement boundary and contradicts the frozen disposition. Not fit to merge.

Finding count: 1 blocking, 1 non-blocking. The worker's already-disclosed report-record residue remains tracked as `F-T9B-2`; I do not duplicate it.

## Answers

1. **Retirement boundary:** Structurally, the one explicitly authorized test block is the only post-merge block removed. Substantively, no: two of the three re-pins remove the landed guarantee that an exhausted citation-tracing objection serves, so the “no other assertion weakened, relaxed, renamed or deleted” boundary was crossed.
2. **Role predicate and ledger key:** Yes. The predicate compares the supplied key against an expected key derived from typed role, stage and round before the lookup; the subsequent ledger query resolves that derived key together with the artifact reference and the existing run/work-item, `MODEL_CALL`, `OK` predicates.
3. **Three re-pinned arms:** The composition-evidence arm preserves its enclosing subject, although it drops its old `servedDespiteUntracedCitation` subclaim. The T09 exhaustive-coverage arm and the serve-s05 exhausted-loop arm do not preserve their complete subjects: both stop checking that citation-tracing dissatisfaction at exhaustion serves with a mark.
4. **Mutation credit:** Yes. B1M1, B1M2, B1M3 and F1M1 each fail at the assertion that directly observes the mutated invariant; none dies through the previously observed `WAIT_DRAIN_REQUIRED`, `23514` or `42P18` detours. The two neighbour survivors also match the prewritten manifest.
5. **Goal disposition:** Option 2 preserves the S08 safety property, the four-class `COMPONENTS_ONLY` set, and the sentence that no non-crash path returns `COMPONENTS_ONLY`. It does **not** preserve the full literal goal: “after round 3 SERVE regardless” and the DoD's “evaluator-unsatisfied-3-rounds serves WITH objection mark” are false for an exhausted citation-tracing objection. It therefore also fails the disposition's spirit.
6. **Fit to merge:** No. V must either restore a marked served outcome that cannot form a band from untraced citations, or explicitly override the frozen disposition and authorize the affected assertion changes.

## Blocking finding

### T9B-B1 → F-T9B-3 / V-S07-CODEX-T9B-1 — Option 2 makes one evaluator objection fatal after exhaustion

**Files:** `packages/serve/src/synthesis.ts:539-543`; `packages/serve/src/index.ts:753-761,814-833`; `tests/unit/t09-exhaustive-coverage.test.ts:398-420,510-519,768-778`; `tests/unit/serve-s05.test.ts:337-346`; frozen goal `goal-v4.md:244-245,255-269`.

**Input → wrong outcome:** Let all three rounds produce an otherwise usable candidate whose final evaluator verdict has `citationTracing: false` and the neighbouring criteria true. `runSynthesisLoop` exhausts the loop and returns the candidate with the standing objection, matching its own source contract that the caller serves the final candidate regardless. `runServeGateChain` then copies those final criteria onto every segment. The new filter

```ts
.filter((judgement) => judgement.state !== "NOT_SAMPLED" && judgement.conforms)
```

removes every citation-tracing judgement. The cited set is empty, so `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` is thrown before a terminal answer and its visible objection mark are returned.

This is not merely a disagreement about the word “COMPONENTS_ONLY.” The frozen loop disposition says “after round 3 SERVE regardless; standing objection → visible condition mark,” and the DoD separately says an evaluator-unsatisfied three-round case serves with an objection mark. Citation tracing is expressly disposed as an evaluator-objection criterion. Option 2 satisfies the S08 no-untraced-basis safety rule by changing that evaluator objection into another refusal condition.

The re-pins conceal the conflict rather than preserve the landed contract:

- The T09 exhaustive matrix no longer includes the citation-tracing case among criteria that serve rather than returning `COMPONENTS_ONLY`; a new dedicated arm instead expects refusal.
- The serve-s05 three-round case changes its standing objection from `citationTracing: false` to `noOverstatement: false`. It still proves one neighbouring objection can serve, but no longer proves the previously landed untraced-citation case.
- The composition-evidence case remains a valid composition-evidence test after parameterising the helper, but its former `servedDespiteUntracedCitation` behaviour is no longer asserted.

The declaration-count check alone misses this. For `9a3a5f60..HEAD`, I independently obtain zero removed `it`/`test`/`describe` declarations, 9 removed direct `expect` lines and 321 added direct `expect` lines. That base predates integration and therefore hides the one authorized removal. Using the post-merge base `905261e6..HEAD`, the sole removed block is exactly `it("excludes the citations of a segment conformance never verified")`, and the ruling comment accompanies its retirement. The eight CANNOT-ASSESS arms are ported. Nevertheless, replacing expectations and fixtures inside retained blocks changes two landed behavioural assertions, which the authorization explicitly prohibited.

**Required decision:** HOLD the merge pending V. Recommendation: preserve both properties. An exhausted objection may serve only if the returned answer exposes the standing mark and no band/basis is computed from untraced citations; otherwise V must amend the frozen disposition and expressly authorize the two behavioural retirements. The latter is a goal change, not an implementation detail.

## Non-blocking finding

### T9B-N1 → F-T9B-4 — Landed comments and the filing describe the reverted mechanism and understate the goal conflict

**Files:** `tests/unit/t12-t13-band-basis.test.ts:270-299,339-343`; `packages/serve/src/synthesis.ts:539-543`; worker report `agent-reports/s07-synthesis.md:590-630`.

The T12/T13 test still says a “citation-tracing guard returns COMPONENTS_ONLY,” although that mechanism was reverted and the live mechanism throws the empty-basis refusal. A nearby comment says its sibling proves citation tracing is “not a terminal”; the sibling now expects a thrown terminal refusal. The synthesis contract says the caller serves after round three regardless, while the caller does not do so for the citation-tracing case. The worker report consequently frames only the disposition's spirit as uncertain and states that the literal goal sentences hold, omitting the literal serve-regardless sentence and DoD row.

**Required ticket action:** After V resolves T9B-B1, update the comments, source contract and filing language to describe the chosen behaviour exactly. This documentation defect is non-blocking only because T9B-B1 already blocks the semantic inconsistency.

## Authorization and re-pin audit

The correction series after merge is coherent and narrowly staged: ported safety coverage and the single recorded retirement; the typed role predicate; the positive equality arm; wrong-cause test reconstruction; the `conforms` filter; then the two serve-s05 re-pins. No later product-code change follows the `conforms` commit.

The retirement audit result is therefore split:

- **Form:** one authorized block retired, eight arms ported, no other block declaration removed.
- **Behaviour:** boundary crossed. Retaining a block name while changing the objecting criterion does not preserve the citation-tracing outcome the old assertion observed.
- **Safety:** preserved. The all-untraced arm asserts both rejection code `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` and `recorded.bases === []`; source order throws before `applyBandCeiling`, so no untraced citation reaches a recorded basis even transiently.

## Role predicate and ledger resolution

`SynthesisCallSiteBinding` gives role a closed `SYNTHESIZER | EVALUATOR` type. `synthesisCallSiteKey` is the single product builder for the two key formats. The runner uses it to create the provider call-site key and carries that same key into the synthesis result. Persistence independently derives `bound.expected` from role, stage and round, rejects unequal supplied keys, and queries the ledger by `bound.expected` plus the supplied artifact reference. It retains the same-run, same-work-item, `MODEL_CALL`, `OK` and joined-artifact constraints and requires exactly one row before inserting the answer and rounds.

That is a genuine role predicate, not a label used only in diagnostics. The positive arm also prevents an always-refuse implementation. I found no second product definition of the synthesis key format.

## Mutation-credit audit

The prewritten manifest names six mutations. Its modification time precedes all six rerun transcripts. The clean index's 4 killed / 2 survived form result agrees with the raw failures, and D43 credit is supportable:

- **B1M1:** neutralising `bound.callSiteKey !== bound.expected` reaches the positive-resolution assertion; the promise resolves instead of rejecting.
- **B1M2:** weakening the unique-producer count guard reaches the missing-producer assertion; the promise resolves.
- **B1M3:** forcing derived round `1` reaches the wrong-round assertion; the promise resolves.
- **F1M1:** removing `&& judgement.conforms` makes the three current re-pinned/refusal arms resolve `SERVED`/`DOWNGRADED` rather than reject. Those exact assertions kill it.
- **B1N1:** changing error prose survives, as expected for the semantic assertions.
- **F1N1:** removing the vacuous `state !== "NOT_SAMPLED"` limb survives, showing these fixtures pin the `conforms` axis rather than that state limb.

The campaign's disclosed shell word-splitting failure would indeed have produced a false 6/6 because Vitest selected no test and exited 1. The expected manifest exposed both supposed neighbour deaths; the corrected transcripts no longer have that selection failure. I credit the repaired 4/6 result, not the discarded aggregate.

## Evidence checked

- Lane HEAD is `29649564483a7df582c2fe94e6ecb4269878eb19`, tree `9b1ca9e98d78026b03e7356b4d17aef1cf16639b`, on `lane/s07`, clean at review time.
- The worker report's line-2-excluded SHA-256 reproduces as `f6fa455a0ce77b4bc40e3183932e67dad587136b512c3ca86b6bbe27744cde23`.
- The supplied RED correctly stamps pre-fix `6a0491f0`. It shows `terminal: "DOWNGRADED"` and an untraced citation entering the basis. Its dirty test file was not byte-hashed, so exact full-file identity from RED to filing is CANNOT-ASSESS. The record does identify the same test name, source assertion and fixture outcome; the only post-RED product semantic delta is the intended `&& judgement.conforms` filter, and filed-tip F1M1 independently reverts that delta and is killed by the current assertions. That is sufficient for the claimed red-to-fix causal chain, not for byte identity of the dirty test.
- Supplied final typecheck records report exit 0 three times.
- Supplied T9 cluster records report `83/83` three times.
- Supplied database records report `1 failed | 83 passed (84)` three times. The same named lifecycle failure is present at parent `9a3a5f60`, whose supplied record reports `1 failed | 81 passed (82)`.
- Static diff checking reports no whitespace error. No test, build, install, provider call or mutating git command was run by this seat.

## Packet review

The packet correctly foregrounded the authorization boundary, the wrong-cause-death risk and the discarded shell campaign. Its assertion that “both goal sentences hold” is too narrow: it refers to the two `COMPONENTS_ONLY` sentences while the same frozen section also contains the serve-regardless disposition and its explicit DoD test. The requested “measured code did not move” formulation is also necessarily qualified for a pre-fix RED: the measured failing implementation must move for the fix. What is established is continuity of the exercised scenario and a single intended product delta, corroborated by the filed-tip revert mutant.

## Limits

Runtime behaviour, database execution, test-runner selection and provider behaviour are CANNOT-ASSESS beyond the supplied artifacts because this seat was ordered static-only. I inspected source, history, diffs, logs, manifests and raw mutation failures; I did not rerun any command that executes product or test code. I did not edit product code, tests, git state, decisions or the board.

## PREDICTIONS

A second lens may approve by checking only that no fifth `COMPONENTS_ONLY` class exists and that the empty-basis guard refuses. That misses the independent frozen “SERVE regardless” outcome. It may also accept the zero-block-removal count as the full boundary audit, although retained test blocks changed the criterion whose outcome they pin. The quickest counterexample is three exhausted rounds with only `citationTracing: false`: the frozen goal requires a served answer with a visible mark; option 2 throws before returning one.
