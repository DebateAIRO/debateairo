CODEX REVIEW T17T9-3 r2 — CHANGES · comments read through: t17t9-3-r3-2026-09-05

**Finding counts: 1 BLOCKING / 4 FOLLOW-UP.** B1 remains open; B2 is cleared; F1–F3 remain inherited follow-ups and F4 is only partially addressed. The six-site/106 correction stands. **Mergeable into dev after devsync: no under the stated evidence bar. Transferable to exact integration 1485b9e2: yes, textually, with no code resolution.** This is a decision for V, not a fourth worker round.

Reviewed immutable base `2af816f183247efefae65172bb7036eefd049fa1` through head `40217895a028471874d15a4851fbab8bcf746037`, with particular attention to `5e837ba7..40217895`. Method: static source and retained-artifact review; no subject execution or mutating Git.

## B1 — BLOCKING: the experiment does not clear the original attribution bar

**File/line:** [agent-reports/t17t9-3.md:392](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md:392), [agent-reports/t17t9-3.md:426](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md:426), [logs/t17t9-3/24-b1-experiment-summary.txt:7](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/24-b1-experiment-summary.txt:7).

**Input → wrong outcome:** a paired experiment shortens a queue deadline, loses queued work before the initial release gate, and fails on both trees → the report declares the original b14 marker-grants episode inherited and explained by an 18-second registration deadline. The actual source and event timings do not support that description or the strength of that attribution.

### What the source and events establish

1. **The relevant registration deadline is 28,000 ms.** [apps/api/src/registration.ts:1073](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/api/src/registration.ts:1073) reads `request.waitDeadlineMs ?? channel.mailDispatchQueueWaitTimeoutMs`, not merely the fallback. Registration explicitly supplies `registrationMailDispatchQueueWaitTimeoutMs` at [apps/api/src/registration.ts:1394](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/api/src/registration.ts:1394); the sealed value is 28,000 at [packages/register/src/auth-policy.ts:631](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/register/src/auth-policy.ts:631). The 18,000 ms value cited by the seat is the default for resend and unqualified reservations. This distinction is already present in the parent.

2. **The labelled targets did not expire after 1,500 ms.** I parsed every labelled creation/rejection pair from both raw logs:

| Observation | TIP probe | PARENT probe |
|---|---:|---:|
| Labelled target promises / labelled rejections | 32 / 32 | 32 / 32 |
| Creation → rejection, minimum–maximum | 28.137–28.152 s | 28.137–28.157 s |
| Probe-recorded unhandled events | 64 | 64 |
| First 32 unhandled events | 16:52:07.071–.072Z | 16:55:10.006–.007Z |
| First–last labelled target rejection | 16:52:33.722–38.115Z | 16:55:36.664–41.161Z |
| Last labelled rejection → gate throw | 62.011 s | 62.007 s |
| Gate / final occupancy | targets-queued; inFlight 32, activeSends 0, queued 0 | identical |

The first target's creation is at [logs/t17t9-3/22-b1-deadline-TIP.log:199](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/22-b1-deadline-TIP.log:199), its rejection at line 391, the earlier unhandled burst at line 232, and the throw at line 586. Parent counterparts are [logs/t17t9-3/23-b1-deadline-PARENT.log:227](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/23-b1-deadline-PARENT.log:227), lines 419, 260 and 614. These are 64 events recorded by the probe's unhandled listener; the probe's Vitest footer does not report an `Errors 64` gate count.

3. **The early unhandled burst is additional work, not proven duplicate reporting of the 32 labelled targets.** Neither burst gives promise IDs in its unhandled records. The source creates 32 unlabelled `dummyPromises` before the targets; the capacity record identifies `register:dummy:0` and counts 64 at [logs/t17t9-3/22-b1-deadline-TIP.log:583](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/22-b1-deadline-TIP.log:583). Together with the 1.5-second timing, this strongly supports dummy expiry followed by target expiry. It does not establish complete correlation for all 64 promises. The summary's 4.39/4.50-second spans describe only the labelled target subset.

4. **The induced gate differs materially from b14's gate.** At [tests/integration/registration-database.test.ts:2748](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/registration-database.test.ts:2748), targets-queued requires the dummy queue plus all targets to coexist. Active reservations are released only later, at line 2772. If the dummies expire first, that predicate cannot become true; releases are never reached, and the still-queued registration targets subsequently expire on their 28-second timers. This explains both probe traces and the retained 32 in-flight reservations. It is a source-supported interpretation, not a verified reconstruction of the removed instrumentation.

   b14 had already reached `register:marker-grants`, after the active/dummy release steps, and ended with **zero** in-flight reservations: [logs/t17t9-3/14-b14-full-suite.log:44446](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/14-b14-full-suite.log:44446). Making an earlier prerequisite impossible on both trees cannot discriminate an inherited load failure from a hypothetical lane-induced scheduling regression later in the sequence. The roughly 62-second gaps are consistent with a 90-second gate and 28-second target deadlines; they are not an independent measurement of shared machine load.

5. **Probe custody is incomplete.** The supplied records retain the command, logs and a 16-character SHA-256 prefix, but I found no preserved probe source/diff or independently hashable instrumented harness. Thus I can verify the matching observed signatures, not the claimed byte-identical instrumentation or its complete promise-observation behavior. The final registration test really is restored to parent blob `d995ac7d06f766d5ed8d5619acc683d259eb4113`.

**Answer to Q1: B1 not cleared.** Exact reproduction of the lost b14 timeline is not required and is no longer possible. A comparable, discriminating episode is required. The experiment proves that the parent can reject queued registration work when the harness prevents releases. It does not establish why the original production-deadline, post-release marker-grants case failed, or rule out a timing contribution from changed suite work. No source-visible authentication regression is established by this review either.

**Required fix / evidence for V:** retain b14 as **80/1/0/20** and replace the unsupported deadline/attribution conclusions. A bounded evidence package can be obtained **without production changes**: preserve the exact test-only probe and full hash; retain both effective deadlines (28 seconds for registration, 18 seconds for default reservations); record reservation identity, role (dummy/target/marker), actual deadline, enqueue/grant/release/settlement times and occupancy; compare parent/tip under the same documented concurrency or controlled contention, with an uninduced control. The paired failing episode must reach the relevant release/marker-grant phase, rather than prevent entry to it. Account for every unhandled event and preserve observation/cleanup behavior explicitly.

If that produces the same correlated post-release failure on the parent, B1 can clear as an inherited harness/load issue with any residual cause uncertainty stated. A repeatable tip-only difference requires investigation. If neither run produces that episode, the result remains inconclusive. **V must choose the bounded evidence work or explicitly accept the unresolved attribution as an exception; do not dispatch round 4 or rename uncertainty as proof.**

## Mechanism reversal — Q2

**The direction is substantially right; the stated deadline and b14 certainty are not.** A live waiter timeout removes that exact waiter and rejects it at [apps/api/src/registration.ts:1086](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/api/src/registration.ts:1086). A removed waiter cannot later contribute its grant record. Targets and markers are observed by `Promise.all` only after the marker-grants gate at [tests/integration/registration-database.test.ts:2776](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/registration-database.test.ts:2776), so earlier rejections can already be unhandled while the test is still waiting. A later gate throw is unnecessary to produce those rejections.

The artificial early-throw run ([logs/t17t9-3/21-b1-induced-TIP.log:485](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/21-b1-induced-TIP.log:485)) records no probe unhandled events and nonempty occupancy. That usefully falsifies the seat's first attempted reproduction. It does not by itself prove the entire original b14 chronology. Empty occupancy at b14's final throw alone also does not identify which reservations expired and which completed.

Registration service, auth policy, registration test and database support have identical Git blobs at base, b14 tip and reviewed head. This is strong evidence against a direct implementation change in the mail path. The paired probe establishes a parent capability to fail under its artificial conditions. Neither fact alone settles the full-suite scheduling attribution demanded by B1.

## B2 cleared — Q3

[tests/integration/obs-l3-s06-runner-binding.test.ts:41](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/obs-l3-s06-runner-binding.test.ts:41) now holds the corrected six-site/two-field basis, and the pool returns **that same object** at line 300. Its own parser test at line 262 observes the ceiling, panel/depth and serve leg independently of the gateway's lease failure. This is the right pin: the actual receipt cannot drift behind that masking failure.

The old fixture refusal is retained in [logs/t17t9-3/18-b2-red-s06-fixture.log:3](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/18-b2-red-s06-fixture.log:3); the current parse test passes in [logs/t17t9-3/19-s06-full.log:11](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/19-s06-full.log:11). The complete file has **2 passed / 6 total**, four failing names set-equal to both parent and b14.

The provider scenario retains `maxAttempts: 2`, two transport failures, `PROVIDER_CALL_FAILED` with `attempts: 2`, two fetches and one expected capture ([tests/integration/obs-l3-s06-runner-binding.test.ts:306](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/obs-l3-s06-runner-binding.test.ts:306)). The run ceiling remains 10 and the count stub returns zero. **It exhausts the provider's two-attempt allowance; it does not exhaust the run ceiling of 10.** The new comment at line 30 and report line 462 should describe the ceiling as headroom for this case. Once lease scaffolding permits entry, the receipt no longer blocks that intended provider path. This is not a promise that the capture assertion or full file will pass after a lease-only repair.

The report's “all four ... advisory-lock class” ([agent-reports/t17t9-3.md:481](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md:481)) is incorrect. The log shows two task capture/failure-chain cases, one gateway advisory-lock case, and one entrypoint module-export case. Preserve these inherited identities when routing follow-up work; do not charge all four to F-GATEWAY-LEASE-STUBS.

## b14 provenance and the round-3 bound — Q4

**Accept the mechanical scope bound; do not require another uninstrumented full-suite rerun for these edits.** Independently checked: the three-file round-3 delta contains nine added comment lines in budget and five in T17 unit, with zero non-comment changed lines in either. Executable edits are confined to S06's hoisted/corrected fixture and one new parse test. The provider setup and all four failing test bodies are unchanged.

The retained parent is **80/1/0/1; 2338/2418**. b14 at **5e837ba7** is **80/1/0/20; 2335/2415**. I independently extracted the distinct failure sets: only T17 ledger disappears and S3d rework3 appears. The b14 skip field is now explicit zero.

The S06 evidence supports one additional passing test and unchanged local failures. It does **not** mechanically guarantee that a future full-suite run at 40217895 will have the same failure/unhandled counts. Scheduling-sensitive results are measurements, not arithmetic invariants. In particular, the worker's sentence at [agent-reports/t17t9-3.md:326](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md:326) overstates the bound. Keep 80/1/0/20 attached to its measured commit; 2416 is the expected revised test inventory, not a new measured full-suite total.

AMENDMENT 2 says to preserve the old record; it does not forbid an additional distinctly named run or imply that one would overwrite the record. I waive a fresh full gate here on the narrow source change and retained checks, not on that interpretation. Another uninstrumented run with AUTH_MAIL_BUSY would **not clear Q1**; neither would a clean run. The discriminating evidence described under B1 would.

## FOLLOW-UP findings — Q5 and carried items

### F1 — current-behavior prose still describes retired behavior

**File/line:** [acceptance/panel01-depth1-proof.ts:37](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/acceptance/panel01-depth1-proof.ts:37), [acceptance/xrev01-depth1-proof.ts:37](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/acceptance/xrev01-depth1-proof.ts:37), [tests/integration/t17-envelope-ledger.test.ts:52](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/t17-envelope-ledger.test.ts:52), [packages/register/src/index.ts:279](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/register/src/index.ts:279).

**Input → wrong outcome:** readers follow these comments → they find v3/seven-site/current-composition descriptions and a claim that no COMPOSER-prefixed key is emitted, despite live role-qualified COMPOSER keys.

**Required fix:** finish the existing topology/prose task; distinguish historical organs from retained namespace prefixes. Include the new S06 ceiling-headroom wording noted above. No behavior change is required.

### F2 — duplicated grid data remains maintenance debt

**File/line:** [tests/unit/t17-envelope.test.ts:211](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/unit/t17-envelope.test.ts:211) and [tests/unit/dr184-review-resilience.test.ts:114](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/unit/dr184-review-resilience.test.ts:114).

**Input → wrong outcome:** a future grid revision updates only one literal matrix → avoidable disagreement between otherwise valid tests.

**Required fix:** use a shared expected-data module if consolidating; retain the independent runner-plan oracle. Do not import one test file from another or derive expected cells from the production formula. Both matrices are currently correct.

### F3 — inherited lease fixtures still mask gateway assertions

**File/line:** [tests/unit/pro01-runner-tree.test.ts:225](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/unit/pro01-runner-tree.test.ts:225), [tests/unit/xrev01-node-review.test.ts:126](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/unit/xrev01-node-review.test.ts:126), [tests/integration/obs-l3-s06-runner-binding.test.ts:290](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/integration/obs-l3-s06-runner-binding.test.ts:290).

**Input → wrong outcome:** the real gateway acquires its run lease through outdated fake clients → the tests stop at an unexpected advisory-lock query before their intended budget/provider assertions.

**Required fix:** repair the shared fixture-contract class and verify the intended downstream refusal/exhaustion behavior without bypassing the lease. S06's other three failing names have different signatures and must retain their own attribution.

### F4 — narrowed additions are accurate, but the original assurance remains

**File/line:** [tests/unit/t17-envelope.test.ts:469](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/tests/unit/t17-envelope.test.ts:469), alongside its new scope note at line 328 and [packages/budget/src/index.ts:96](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/budget/src/index.ts:96).

**Input → wrong outcome:** a reader reaches the original property comment → it still states “A basis the constructor could not have minted therefore cannot parse.” An equally odd positive serve count in both disclosures satisfies the inspected schema, whereas equal positive integer per-role bounds in the constructor yield an even sum. The new note elsewhere does not remove this contradiction.

**Required fix:** replace the original universal assurance, not merely append a narrower note in another block. Describe receipt shape, selected chain and disclosed-count consistency. Review the similar overbroad historical sentence at [packages/register/src/index.ts:205](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/packages/register/src/index.ts:205) and the retained report's property quotation. **Q5: the added wording is accurate; F4 as a whole is not cleared.** It remains the optional comment-only follow-up established in r1, not an added merge blocker.

## Patch impact, verification and landing — Q7–Q8

The production delta changes the constructor's serve-site rule and serialized receipt, then aligns the parser. The maximum-path derivation remains 88 non-serve attempts + 6 × 3 serve attempts = **106**. Register admission mints it; the run stores it; budget re-reads it for the run head and provider allowance. The runner and synthesis implementation are unchanged. An extra-site mutation is still independently checked by the ledger's role enumeration, rather than only by constructor/parser agreement.

Risk assessment: **hold_for_evidence** (workflow label the same), because B1 is decision-critical under this packet. Impact if wrong is **high** for shared admission and persisted receipt compatibility; regression likelihood **moderate**, protection **partial**, recovery **managed**, confidence **moderate**. Old five-field receipts fail the new strict shape; reverting code after new receipts are stored would also require receipt/reader coordination. No migration or deployed data inventory is evidenced. The status quo retains the known stale seven-site/109 receipt and ledger assertion. Full machine-readable assessment is embedded in the self-report.

Retained validation: [logs/t17t9-3/25-r3-regression.log:3537](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/25-r3-regression.log:3537) records **8 files, 85/85**, covering ledger, T17 unit, T16 register, runtime-policy, budget-s09, dr181, dr184 and register-s09. The S06 direct parse pass is separate. The retained typecheck's eight s14-ui diagnostic strings are set-equal to the parent's eight; it is **not typecheck exit 0**. No fresh typecheck is recorded at 40217895. These are artifact results, not reviewer executions.

Fresh static checks: all 11 changed working files match their committed head blobs; `git diff --check 2af816f1..40217895` is clean; the lane started clean. Full patch: 11 files, +464/−339. SHA-256 of `git diff --no-ext-diff --binary --full-index 2af816f1..40217895`: `fe8eeaa0db8b2d5c14a3fda4a5850852e5fc89f377f8b77b1a82d30772c1173b`. Round-3 patch with the same flags: `7f6634fed0135d16037c3d5cd45b81f922924d5158852b0e096edfded42f0a82`.

**All ten changed code files have identical base blobs at 2af816f1 and integration 1485b9e2.** This independently supports the packet's appended APPLIES CLEANLY result, now including S06. No register/budget/T17 resolution is required at that destination. The eleventh file, the lane's TOOLING-TRAPS append, has different bases and is outside the stated code transfer; preserve destination history if carrying it separately. Textual transfer is verified; destination execution and later integration tips are not.

## For V — before the merge

Keep B1 open as an attribution decision; B2 is cleared and the 106 derivation stands.
Choose bounded comparable evidence or explicitly accept the unresolved attribution; no round 4.
Preserve b14 at 5e837ba7 as 80/1/0/20; do not report it as a new 40217895 measurement.
After a landing decision, merge into dev after lane/devsync; ten code files transfer cleanly to exact integration 1485b9e2.
Keep F1–F4 as follow-ups; F4 was partially, not fully, addressed.

## Packet audit

**AMENDMENT 2: authority and stop semantics cleared.** It grants test-only instrumentation and a disposable parent checkout while keeping registration production source read-only; names both machine-readable parent baselines; explicitly fixes the omitted S06 consumer; requests an independent parse pin; and sends unresolved third-round work to V. No permission or skill constraint prevented this static review. The S06 grant is a factual correction to an already sufficient affected-pin grant, not new authority.

Production registration/auth-policy and registration-test/support blobs match their parent. The recorded scratch path no longer exists and no parent scratch worktree is registered. This verifies the retained end state, not every historical command. No source of the temporary probe was retained in the supplied records, so its exact instrumentation scope cannot be independently certified.

**Charges:** uphold previously recorded #24 (producer/parser scope), #27 (omitted S06 inventory), the baseline-pointer discoverability charge, and #28 (acted before reviewer exit). Clear those corrected AMENDMENT 2 grant/pointer issues; do not charge them again. Its original mutation-tool shorthand was corrected by the appended absolute-path note.

**Current reviewer-packet factual corrections:** its asserted 18-second registration mechanism and “F4 taken” closure are contradicted by source; its equivalence framing must be qualified by the two-stage probe timeline above. These are evidence-summary errors, not new missing-permission defects. The b14-preservation instruction also supplies no logical guarantee of future run counts.

**Last minutes of r1:** no material change to the disposition or requested actions is evidenced. [LEDGER.md:333](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/LEDGER.md:333) records the same B1/B2, F1–F4 and MERGEABLE no in the early reading and final snapshot. I verified the current r1 report equals that final snapshot byte-for-byte (SHA-256 `94bd8301c6755bc3011afe5ee3c9acc52dfe8b9bdf0caa350cb3a85b2fc8f91e`). However, the acted-on 203-line draft was not captured; only the final 202-line version and the orchestrator's notes survive. I cannot certify the exact late prose edits or claim an unavailable before/after diff. The round-3 dispatch requirements match the final verdict. [DECISIONS.md:3489](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md:3489) correctly requires writer exit plus snapshot before acting.

## Not verified

- No fresh tests, typecheck, install, contract generation, mutants or full-suite run; the requested review was static.
- No exact original b14 timeline, measured machine load, complete all-promise correlation or preserved instrumented-source identity. B1 remains decision-critical.
- No provider capture pass after repairing S06's lease fixture. Its receipt acceptance and preserved intended two-attempt setup are established separately.
- No merge, apply, checkout, index/object write, push, external message or live-provider ceremony. Textual transfer is based on immutable blob comparisons.
- No historical production-receipt inventory/migration or full integration execution. The observed local contract inventory hash remains `842c6c4ec1065db8cb7898d51e93769affe63e2a77e8d91de23d91590f52e2af`.
- No exact snapshot of the r1 draft acted upon before its writer exited; no review inference can recover those missing bytes.

## PREDICTIONS

1. The unchanged reviewed maximum path will again produce six role sites, 18 serve attempts and 106 total; the independent ledger assertion will reject an extra-site rule.
2. Re-extracting the paired raw probe logs will recover approximately 28.14-second labelled target lifetimes and an earlier 32-event unlabelled burst, not 1.5-second labelled target lifetimes.
3. Preserving both effective deadlines and reaching marker-grants will be necessary to compare the relevant post-release episode; an artificially impossible targets-queued gate will continue to produce nondiscriminating parent/tip failures.
4. The corrected S06 receipt will pass its direct parser pin. A lease-only repair does not guarantee all S06 capture/entrypoint assertions become green.
5. The ten-file code patch will transfer without textual resolution to exact integration 1485b9e2; neither exact future b14 counts nor destination test success follows from that fact.

MERGEABLE: no — B2 and textual transfer are cleared, but B1's original unhandled-error attribution remains unresolved for V under the stated evidence bar.

