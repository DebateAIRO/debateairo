CODEX REVIEW S08 r2 — CHANGES · comments read through: s08-r2-2026-09-02
VERDICT: REWORK — filings r1+r2 reviewed as one round; worker filing r2 = rework 1/3; 2 blocking findings, 4 non-blocking findings

## Scope and method

I reviewed the r1 and r2 filings as one round against the frozen S08 specification, the mission instructions and rulings, the current packet, the earlier S08 packet, the worker report and self-report, the recorded RED/GREEN, stability, mutation, class-enumeration, and hash artifacts, and the static diff from base `e040b1ee` through reviewed tip `ac7f4832` (tree `3c5b402c`). This was a static review only. I did not run tests, builds, installs, provider calls, or mutation commands.

Two review opportunities remain after this rework verdict.

## Blocking findings

### B1 — The filing overstates executable production reachability for F30

The new F30 step-down helper is connected to the runner call graph, but the reviewed production composition is not executable for the panel scenario that reaches it. `apps/runner/src/main.ts:72-120` constructs `WalkingSkeletonRunner` without `panelPolicy`, and `apps/runner/src/dev-runner-policy.ts` does not supply one. The runner's claim-time guard at `apps/runner/src/index.ts:1670-1679` therefore raises `PANEL_WEIGHTING_UNRESOLVED` for `M >= 2` before panel/model execution. By contrast, `tests/unit/t12-t13-band-basis.test.ts:430-438` performs a syntactic call-graph audit; it cannot establish that the production constructor is configured to traverse that graph.

The worker report's statement that `main.ts` and the dev policy already load and pass `panelPolicy` is false at the reviewed tip. Ownership matters here: J20/J22 assign that production composition to T3C, so S08 should not expand its patch into `main.ts`. Rework the test and report to call this proof what it is—static call-graph reachability—and explicitly bind executable F30 proof to the T3C/integration pairing gate, including the W12 persisted-projection assertion. The combined integration evidence must show that the runner can start with resolved panel weighting, reach F30, and publish the stepped band.

Scenario: an actual production entrypoint starts an `M >= 2` single-voice panel run on this exact tip. Expected by the filing: F30 executes. Static result: the unresolved panel-policy guard precedes it.

### B2 — The required T13 label-bearing acceptance path is not proved

The T13 unit case at `tests/unit/t12-t13-band-basis.test.ts:256-288` asserts terminal state, answer form, synthesized texts, `confidenceBand`, and `bandCeiling.label`. That last value is the configured ceiling label, not the persisted verdict label. `runServeGateChain` exposes no verdict-state field, so this test can remain green if the DOWNGRADED verdict-label attachment or persistence path regresses.

The frozen T13 goal requires an acceptance-shaped all-reasoned run that proves the co-occurrence of DOWNGRADED terminal state, hypothesis form, hypothesis text, next-test plan, DOWNGRADED verdict label, and the derived band. Existing tests cover fragments of that contract but do not prove the full tuple on one persisted production run.

Add an acceptance-shaped persisted-path assertion for the complete tuple, and preserve it with mutation evidence aimed at the label attachment/persistence boundary. A ceiling-label assertion is useful but cannot substitute for the verdict-label assertion.

Scenario: production still returns the right terminal/form/text/band but persists a non-DOWNGRADED or missing verdict label. The new T13 test currently does not observe that failure.

## Non-blocking findings

### N1-PACKET — Dispatch context omitted two material dependencies

The r1 packet omitted F5 as well as F30, even though F5 was routed to this lane by J4 and marked consumed at dispatch. The worker independently honored F5, so this omission did not invalidate the implementation. The current Codex packet corrects F5/F30 but omits J20/J22 and the T3C production-composition dependency while asking the reviewer to establish production reachability. That omission materially encourages the overclaim described in B1.

Owner/route: orchestrator packet-generation defect. Record a same-day packet/ledger ticket covering both instances and require dependency rulings and integration-pairing gates to be included whenever a packet asks for executable production reachability.

### N2 — The mandatory reader enumeration is incomplete in the stable report

The class-enumeration artifact includes readers that the report's “Every reader” summary omits: `apps/api/src/publications.ts:153-163,340-350`, `web/lib/v3Presentation.ts:45-91`, `web/components/VerdictBanner.tsx:8`, `web/app/page.tsx:47`, and `web/app/public/debate/[id]/page.tsx:17` (as well as the contract-client surface recorded in the artifact). The static analysis itself was broader than the report, but the packet requires the report to enumerate every band reader.

Owner/route: S08 filing correction. Copy the complete enumerated set into the report and update its integrity hash.

### N3 — The narrative contradicts the recorded RED artifacts

The r1 RED table attributes the failures for cases 1, 5, and 8 to basis/cap/downgrade behavior, but the captured output for each is the earlier reasoning-answer validation failure. The self-report also says there were 10 primary integration citations while the test file and stable report contain 11, plus 3 acceptance citations. These are documentation defects, not implementation failures, but D34 requires claims to be generated from the artifacts.

Owner/route: S08 filing correction. Rewrite the three RED explanations from the captured output, correct the fixture count to 11 + 3, and regenerate the report hash.

### N4 — The acknowledged multi-step mutation blind spot is cheaply closable

The two-value sealed production vocabulary makes one-step and floor-collapse behavior observationally identical, but the helper accepts a generic `Record<string, string>`. A test-layer three-band map—`TOP -> MID -> FLOOR`—would distinguish the required one-step result from the surviving double-step mutant without changing production vocabulary. The existing blind demonstration therefore identifies a real but readily removable gap.

Owner/route: retain and resolve existing ticket F-S08-5. Add the three-band helper fixture and rerun the targeted mutant so it changes from GREEN to RED.

## Static conclusions that hold

- T12 computes the effective basis from verified, cited segment IDs, rejects the no-verified-citation case loudly, and applies the all-reasoned predicate to the cited verified nodes. RAN remains within the reasoning bucket as required.
- T13's production serve logic selects DOWNGRADED plus hypothesis form for the all-reasoned path; the defect is the missing end-to-end label-bearing proof, not the branch implementation inspected here.
- F30's helper is structurally one-step, applies only to served-root single-voice panel degradation, does not apply to `PANEL-PARTIAL`, and avoids a duplicated production band vocabulary. It is placed between the mono cap and disputed-arm resolution.
- The persistence path carries the resulting confidence band to `serve.answer.confidence_band`, and the acceptance fixture statically asserts the persisted projection rather than only a local candidate value. Execution of that fixture remains an integration/W12 obligation.
- The recorded focused GREEN, stability, mutation, restoration, and hash artifacts are internally consistent with the inspected sources. The 17 mutation transcripts contain the expected provenance/restoration fields; 14 were recorded caught, two neighbor controls survived, and one declared blind demonstration survived.
- The reviewed tip/tree match the packet, the working tree was recorded clean before review, and the reviewed diff contains no mode changes.

## Boundaries of this verdict

I did not independently execute any recorded command. Runtime results above are attributed to the worker artifacts, not re-certified by this review. D15/W12 integration execution, the T3C production-composition pairing, and any T9 multi-node expansion remain outside this lane's standalone static proof. D27's later final-tip checker is accepted through the mission addendum recording S08 at zero off-tip transcripts; I do not convert the worker's earlier short-stamped logs into a retrospective finding.

# PREDICTIONS

On the exact reviewed tip, a real `M >= 2` production-entrypoint attempt will stop at `PANEL_WEIGHTING_UNRESOLVED` before F30 unless paired with T3C. A mutation that removes or corrupts the DOWNGRADED verdict-label attachment can leave the present T13 unit green because it observes the ceiling label instead. A three-band test-layer fixture will kill the surviving double-step blind mutant. A reviewer reading only the current unit assertions is likely to mistake `bandCeiling.label` for the verdict label, which is why the acceptance-path distinction must be made explicit in the rework.
