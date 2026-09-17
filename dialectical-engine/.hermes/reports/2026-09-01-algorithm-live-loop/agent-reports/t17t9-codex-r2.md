CODEX REVIEW T17T9 r2 — APPROVE · comments read through: t17t9-rework1-2026-09-05

## Verdict

**APPROVE. Finding counts: 0 BLOCKING / 3 FOLLOW-UP.**

The r1 blocker is fixed: the retained ledger output records three synthesis rounds, six role sites and 106 attempts, and the new assertions establish those facts before the intentionally stale seven-site assertion fails. The required settings field closes this ticket's omission at compile time. All five T16 families are checked for acceptance provenance, and moving the three existing reads into the policy is within the widened contract and preserves the settings supplied by a valid deployment.

Merge this lane without waiting for the separate acceptance-fixture repairs or V's T17 ruling. This is approval of the patch, not a claim that the demonstration or T17 suite is green. The follow-ups below are pre-existing provenance debt and corrections to the review/decision record; none requires another implementation round here.

## Findings

1. **FOLLOW-UP — five T16 families does not close all acceptance provenance.** **File/line:** [acceptance/runtime-policy.ts:282](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/acceptance/runtime-policy.ts:282), also line 226. **Input → wrong outcome:** a valid `claimTypeCompositionMap` or `scoringOperator` row at the acceptance version with another deployment's non-empty provenance → acceptance returns and consumes it. The composition-map reader only rejects blank provenance; acceptance does not compare its returned `sourceRef`. The scoring reader likewise checks non-emptiness only. These are separate, non-T16 rows and this behavior predates the lane; the T16 5/5 claim is correct. **Required fix:** in a separate scoped follow-up, check these rows against `ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF` and `ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF`, with foreign-row refusal and own-row acceptance cases. Do not apply the T16 prefix to these differently stamped rows.

2. **FOLLOW-UP — the downstream V packet still recommends the wrong run-level site count.** **File/line:** [V-DECISIONS-PACKET.md:88](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/V-DECISIONS-PACKET.md:88). **Input → wrong outcome:** the corrected maximum-path evidence is carried into F-T17T9-3 → the row correctly states six sites / 106 attempts, but its recommended action says the assertion's expected site count becomes **2**. The assertion queries all rounds; two is the number of roles per round, six is the run total. Following that instruction literally would replace one stale assertion with another. **Required fix:** correct the decision text to “two roles per round, three rounds, six run-level sites, 18 serve attempts, 106 total”; retain the distinction between a conservative 109 ceiling and exact tightness. Leave the test expectations and sealed-row decision to the designated T17 work.

3. **FOLLOW-UP — packet/report accounting still contains small factual errors.** **File/line:** [reviewer packet:69](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t17t9-codex-r2.md:69), [worker report:22](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9.md:22), also line 26. **Input → wrong outcome:** a reviewer follows the dispatch locator or reconstructs the patch history → the named `dispatches/t17t9-2.txt` does not exist at the mission root; `index.ts` is labeled an r1 file although r1 left it unchanged; and `main.ts` is described as “−50 lines net.” Actual `main.ts` numstat is +12/−44, net −32, for r1..r2; +13/−37, net −24, for base..r2. Fifty is the base..r2 changed-line total, not the net reduction. **Required fix:** point to `packets/dispatches/t17t9-2.txt`, mark the index change as r2, and state the range when reporting line counts. These corrections need not delay the code merge.

## Answers to the reviewer packet

### 1. Maximum path and repair allowance

**106 is the maximum for this fixture's M=2, depth=1 topology and stated attempt/round bounds.** It is not a global maximum over larger panels or deeper asks.

The retained output in [r2-cluster-t17-run3.log](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9/r2-cluster-t17-run3.log) says:

```text
T17 MEASURED role sites: ["COMPOSER:SYNTHESIZER:INITIAL:1=3","COMPOSER:SYNTHESIZER:RETRY:2=3","COMPOSER:SYNTHESIZER:RETRY:3=3","POST_COMPOSE_R9:EVALUATOR:1=3","POST_COMPOSE_R9:EVALUATOR:2=3","POST_COMPOSE_R9:EVALUATOR:3=3"] | role attempts: 18 | ledger total: 106
```

The initial r2 maximum-path log and cluster runs 1 and 2 contain the identical diagnostic. The run completes, its eight non-author panel sites spend 24 attempts, and the new six-site/18-attempt/106-total checks pass before the failure at [t17-envelope-ledger.test.ts:633](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/tests/integration/t17-envelope-ledger.test.ts:633). The full count is:

| Sites | Allowance | Attempts |
|---|---:|---:|
| 8 author sites | 3 + 1 final retry | 32 |
| 8 reviewer sites | 3 + 1 final retry | 32 |
| 8 non-author panel sites | 3 | 24 |
| 3 synthesizer + 3 evaluator sites | 3 | 18 |
| Total | | **106** |

There is no extra schema-repair allowance hidden inside a round. [providers/src/index.ts:332](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/packages/providers/src/index.ts:332) runs one bounded attempt loop; rejected content is ledgered, updates the repair packet at line 432, then continues that same loop. [runner/src/index.ts:4521](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/apps/runner/src/index.ts:4521) also subtracts attempts already spent under the call-site key. `callSynthesisRole` does not add a retry wrapper. The fixture uses transport failures to exhaust the allowance; it need not additionally produce content failures to reach the count maximum.

[runSynthesisLoop:564](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/packages/serve/src/synthesis.ts:564) makes one call to each role per round. A standing objection at the bound returns the last candidate and a mark, not a fourth round. No additional panel member is missing: M−1=1 non-author member is assessed for each of the eight nodes.

The double cannot silently invent a round. [evaluatorRound:116](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/tests/integration/t17-envelope-ledger.test.ts:116) parses the final request message and throws for an unreadable packet or a missing, nonnumeric, fractional, or nonpositive round. A fresh probe executing these exact source functions passed valid rounds 1/2/3 and ten invalid-packet/round cases. Rounds 1 and 2 have coherent false criteria and non-empty objections; round 3 accepts. An unexpected extra round would also fail the exact six-key ledger assertion.

The 109 basis comes from [computeStructuralCeilingBasis:305](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/packages/register/src/index.ts:305), which selects `max(7 legacy composition sites, 6 synthesis sites)`. Its slack for this fixture is exactly three attempts. The later tightness assertion is unreachable after the seven-site failure; its failure is derived, not a second independently executed assertion failure.

### 2. Required-field blast radius

The index diff is exactly removal of `?` from `WalkingSkeletonSettings.synthesisRolePolicy` at line 1219. A fresh `pnpm exec tsc --noEmit` at `9818b56c` exits 0. Its project includes apps, packages, tools, acceptance and tests, covering the scheduler and TypeScript CLIs as well as fixtures.

The repository search finds two non-test `new WalkingSkeletonRunner` composition roots: [dev main:72](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/apps/runner/src/main.ts:72) and [acceptance main:448](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/acceptance/main.ts:448). Both supply the policy. The retained [M3 record](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9/r2-10-mutant-m3-compile-closure.log) shows TS2741 when the acceptance handoff is omitted.

The four repairs match the measured sites: ceremony's earlier-refusal fixture, two dev-register earlier-refusal fixtures, and the database test that intentionally removes the field. The latter's explicit `unknown` cast preserves the runtime refusal test. Required TypeScript fields do not validate JavaScript, `any`, casts or decoded data; retaining the runtime gate is correct. Four other gated settings remain optional, so the whole broader family of omission defects is not closed. This member is closed for checked TypeScript callers.

### 3. Consolidation scope and safety

**In scope and justified.** Both edited production files were already allowed; dispatch 2 asks for every acceptance T16 family to be checked. The move puts all five reads and checks behind the existing DB-backed policy seam. Comparing the old and new object construction shows the same panel fields and merged source refs, the same complete stopping controls, and the same verdict-label projection. No values are re-derived.

“Behavior unchanged” should be read as equivalent settings for a complete, valid deployment. Foreign provenance is now intentionally refused, and missing/malformed panel, stopping or verdict rows fail earlier during policy loading. The shared reader's other consumers include `run-acceptance`, `dual-maker-proof`, `review-catch-up`, the evaluator CLI and standalone acceptance boot. The first two seed the complete acceptance register; the latter consumers now also require these complete families when reading policy. That is consistent with a sealed acceptance deployment, but not a promise of compatibility with partial historical databases. The successful typecheck and retained 12/12 policy records support the move; 8/8 dev-register and 1/2 ceremony do not by themselves prove every CLI behavior.

### 4. Five families, and the boundary of that claim

[ALGORITHM_REGISTER_ROW_FAMILIES:57](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine/packages/register/src/algorithm-policy.ts:57) contains exactly five families and 15 rows: stopping (2), verdict label (5), synthesis roles (3), panel weighting (4), envelope (1). There is no sixth T16 family at this head. `readFamily` requires every family member and returns provenance for each; the new helper checks every returned entry, not merely each test's representative row.

The RED artifact shows the four formerly unguarded families resolving foreign provenance; synthesis rejects with the old error name, and the own-provenance case fails because the new fields were absent. GREEN is 12/12 in all three cluster runs. The tests swap one representative row per family; static inspection establishes iteration over the remaining members. The composition map and scoring operator are additional acceptance register reads outside that five-family catalog, as Finding 1 records.

### 5. Collision check for W3/T1 integration

Compared against `lane/w3b` at `e8fc033534a0809c1c5a653a2e40c110813acb44` and `lane/t1` at `d4a3eae9bdba4e846d824c3582479a441d54a97b`.

| Shared file | T17T9 change | Incoming W3/T1-side change | Assessment |
|---|---|---|---|
| `dialectical-engine/apps/runner/src/index.ts` | Required field at base line 1219 | Contract import and `resolveExpansionDepth` near base line 1516 | Shared file, disjoint hunks. Preserve both the required field and T1's contract-owned bounds. |
| `dialectical-engine/tests/integration/database.test.ts` | Intentional omission cast near base line 5602 | W3b's integration catch-up includes the H-lane assertion repair near base line 3952 and liveness tests after base line 6053 | Shared file, disjoint hunks. Preserve all changes. These are inherited integration changes, not T1's own depth patch. |

Those are the only two intersections with the nine-file lane patch. Against T1's own patch, the intersection is just `index.ts`. I inspected the actual hunks, not only the file lists. I did not perform a merge or write Git objects; no textual conflict is expected from these hunks, but that is not a claim of a tested merged tree. A whole-file “ours/theirs” choice on `index.ts` could erase the required-field fix even though the changes are compatible.

## Evidence checked

- Base `d08ee9283244dcfb76d68820360810c7749940d6`; r1 `b763ffb7b33c9ad1bb0984af5668c919857a4411`; r2/current HEAD `9818b56c4116897d0ed8c6e2431dc74a0bc534ae`. Base..r2 is nine files, +619/−49. Patch SHA-256: `8f29e9e0f164ee57426182dc6e42f3130d0b26b113baf06f002039d3579dd1fd`.
- [Precommit manifest r2](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9/precommit-manifest-r2.txt): all nine SHA-256 values match both the current files and committed r2 blobs.
- Exactly 29 `r2-*.log` gate records; each contains `CLEAN-STATE: unchanged`. This marker establishes unchanged tracked status during each run, not a content hash of each tested file. Records were made before the r2 commit on the dirty r1 worktree; the final manifest supplies the subsequent commit linkage. I do not describe these as fresh post-commit suite executions.
- Fresh checks: `tsc --noEmit` exit 0; `vitest run tests/unit/deployment-register-family-wiring.test.ts --no-cache` 2/2; exact-source evaluator-helper probe 13/13; `git diff --check` clean. Working tree remained clean.

Retained suite evidence, checked directly under the absolute mission directory's `logs/t17t9/`:

| Suite/gate | Verified retained result |
|---|---|
| Runtime policy | 12/12 ×3; RED 6 failed / 6 passed |
| Wiring guard | 2/2 ×3 |
| Dev deployment register | 8/8 ×3 |
| Database omission test | 1 passed, 84 skipped; one scoped run |
| T17 | 1/2 ×3; maximum-path test fails at the old seven-site list; T17B passes |
| Ceremony | 1/2 ×3; “seeds idempotently, submits through the real API root, settles, and reads through the same token” fails with `ANSWER_PERSIST_FAILED` |
| Mono panel | 0/1; “boots and serves high-stakes depth 4 with the ruled cap and disclosures” fails with `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED` |
| Multi-maker panel | 0/2; both the reduced-judgement/dispersion case and confirm-item 5 degraded-panel case fail with `ANSWER_PERSIST_FAILED`; the first retains unclassified evaluator requests |
| Final typecheck | Exit 0 |
| Final lint | Exit 1; exactly the same three undeclared `obs-capture` edges as r1 |

The lint failures are `apps/api -> obs-capture`, `apps/runner -> obs-capture`, and `apps/scheduler -> obs-capture`. This patch adds no new package edge: its sole app implementation edit is a type optionality change; the acceptance reader already imported register. Under D15's stated criterion, there is no new architecture violation. `audit:source` was short-circuited and remains unverified.

## Disagreements with r1

**None on established facts.** The 94-versus-106 correction, five-family inventory, source-guard limitations and four required-field repair sites are confirmed. R1's maximum-path prediction now has retained dynamic evidence. Its prediction that the separate fixture repairs will green all four acceptance failures is still a prediction, not something this review has verified. Finding 2 disagrees with the downstream V packet's recommended assertion count, not with r1's six-site arithmetic.

## Packet audit

Read the reviewer packet in full first, then the r1 review/self-report, the original worker packet, actual [dispatch 2](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t17t9-2.txt), worker rework report and self-report addendum.

Defect #10 remains an accurate admission: the original packet required six green tests while forbidding the files needed to repair the downstream acceptance fixtures. Dispatch 2 resolves the implementation scope for the four TS2741 sites, explicitly keeps the stale T17 assertions red, and asks for five-family provenance. It makes this rework reviewable without requiring the impossible original six-green outcome.

The nine-file count and three downstream causes are now consistent. The historical worker packet's fourth/fifth wording is admitted rather than silently rewritten; its gate-script locator still cross-refers to another packet instead of giving the promised absolute path. Finding 3 records the new review-path error and remaining report bookkeeping. The two tooling traps are present in the main checkout at `.hermes/TOOLING-TRAPS.md:1296` onward and absent from the lane copy; the worker correctly discloses that they will not arrive through this branch merge. The relative append-only contract was ambiguous between those copies; future packets should name the intended absolute shared path.

## Not verified

- No fresh database-backed policy, T17, ceremony, mono-panel or multi-maker suite was run in this review. Their results above are retained artifacts, supplemented by source tracing and the matching final manifest.
- No full cluster, full database suite, full acceptance suite, live provider ceremony, scheduler operation or CLI end-to-end run. No fresh lint or `audit:source` run. The retained environment used Node 25.7.0 despite the package declaring 22.23.1; the declared Node version was not independently validated here.
- No repeat mutation of the required-field omission; M3 is artifact-verified. No actual W3/T1 merge or merged-tree typecheck.
- No claim that 106 bounds larger panels/depths, later work items or review catch-up activity. It bounds the reviewed fixture and its single execution path.
- The non-T16 provenance follow-up is established statically, not by inserting rows into a reviewer-run database. External JavaScript consumers and partial historical acceptance databases were not exercised.

## PREDICTIONS

1. Rerunning this exact T17 fixture will again complete with six role sites / 106 attempts and then fail at the stale seven-site assertion. Replacing transport failures with content-repair failures within the same successful per-site allowance will not add attempts beyond 106.
2. Omitting `synthesisRolePolicy` from either checked deployment constructor will fail TypeScript; the intentional-cast database test will continue to refuse at runtime.
3. The two shared-file hunks will combine without a textual conflict if merged normally, and retaining both changes will preserve typechecking; the actual merged tree must establish the latter.
4. Resolving the downstream acceptance fixtures will remove their currently recorded first failures, but may expose further assertions. No unconditional four-tests-green promise is made.
5. A foreign non-empty composition-map or scoring-operator provenance will still be accepted until the separate non-T16 follow-up is implemented.

MERGEABLE: yes — merge this lane now, preserving the independent W3/T1 hunks and leaving the acceptance-fixture repairs, T17 ruling and non-blocking record/provenance follow-ups to their own work.
