CODEX REVIEW S09 r2 — CHANGES · comments read through: s09-r2-2026-09-02
VERDICT: REWORK — filing r2 = rework 1/3; 3 blocking findings, 1 non-blocking finding (4 total). The next filing is round 3, the last lawful rework round.

# Scope and method

I read the packet in full first, then D35, J12, J25, D24 and its addenda, D25, D27 and its addenda, D28, the reviewer/protocol contracts, the frozen T17 spec and ticket, the complete worker and self reports, the r1 verdict, the full r2 diff, the relevant shipped call paths, and every filed S09 log. This was a **static review only**: I ran no product tests, builds, installs, or provider calls and made no product or Git changes.

Fresh static provenance checks resolved the reviewed lane as clean `4bbb13e5945e87b4556a5168b1e6b602d11202bf`, tree `f77b804ace948fb3990253a4a35faa6eea15df06`, three commits over `e040b1ee`, with `16 files changed, 1140 insertions(+), 50 deletions(-)`. Recomputing the report hash with line 2 omitted returned `d62d1abba7a49976029c43bfdccb9e5203694163a11f780ec371b54d3e2dcbed`.

# Findings

## B1 — The same-ledger test still does not take the maximum path, and the serve formula shares its unmeasured premise

Files: `tests/integration/t17-envelope-ledger.test.ts:106-146,408-442`; `packages/serve/src/index.ts:505-541,575-580`; `packages/register/src/engine-shape.ts:8`; `packages/register/src/index.ts:231-236,280-285`; `tests/unit/t17-envelope.test.ts:74-123,171-176`.

The integration fixture says “Every site” reaches its last attempt, but its implementation expressly gives `COMPOSE`, `CONFORMANCE`, and `R9` a failure budget of zero (`:141-146`), always returns `conforms: true` (`:171-174`), and therefore performs only one composition round. Its exact 92 pin includes four first-attempt serve calls (`:420-429`). It maximizes author, panel, and reviewer attempts; it does not maximize the envelope's serve leg.

Concrete input → wrong outcome: with the filed M=2/depth=1 inputs, return two HTTP 503 responses and then a contract-valid response at each serve call; make at least one first-round conformance result valid-but-false and both second-round results true; make the final R9 result true. The shipped chain runs two composition rounds (`packages/serve/src/index.ts:505-541`) and calls post-compose R9 once after the loop (`:575-580`). With the two-segment cap, that is two composers + four conformance sites + one R9 site = **seven** reachable serve sites, each able to succeed on its third provider attempt. The statically derived full total is therefore `8*4 author + 8*4 reviewer + 8*3 panel + 7*3 serve = 109`, not the test's 92. D35 requires the worker's ledger to be the final oracle for that prediction.

This also exposes the second shared premise D35 asked this review to find. `ENGINE_FIXED_ORGANS_PER_COMPOSITION` defines `1 + segmentCap + 1` and the formula multiplies all four by both recomposition rounds, although R9 is per run, outside the loop. The “independent” unit enumerator copies the same `maxRecompose * fixedOrgansPerComposition` arithmetic and then proves equality with the formula. Thus the receipt says eight composition sites and the ceiling says 112 while the shipped maximum composition topology visible in source has seven sites and a predicted ceiling of 109. The three-attempt slack is a real defect because T17 is high risk in both directions: an oversized ceiling hides cost drift.

Fix: drive every reachable serve namespace to its final allowed provider attempt, force both composition rounds while still completing, and assert each serve call-site count plus the total from that run's ledger. Reconcile the current composition term, receipt, grid, claim lease, report, and campaign to the measured result; retain the future T9 loop as a separately reverified branch rather than copying the current `2*4` premise.

## B2 — B4's provenance repair remains inadmissible and its accounting refresh is incomplete

Files: `agent-reports/s09-envelope.md:347-385,521-542`; `logs/s09/PREEXISTING-paired-base-head.log:1-23`.

The report says its stale-stamp command ran from the mission-report directory and printed nothing. That directory belongs to the main checkout at `b5a6b6eb`, not the reviewed lane. Running the displayed command exactly from the displayed location returned, verbatim:

```
STALE: logs/s09/GATE-typecheck.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/GREEN-S09-C1-run1.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/GREEN-S09-C1-run2.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/GREEN-S09-C1-run3.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/MUTANTS-t17.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/PREEXISTING-paired-base-head.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/RED-t17-envelope.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
STALE: logs/s09/ZONE-unit-HEAD.log 4bbb13e5945e87b4556a5168b1e6b602d11202bf
```

The underlying log headers do name the lane tip; the defect is that the required D27 comparison transcript cannot have been produced by the command and directory printed in the filing. The command conflates the checkout holding the external logs with the checkout supplying the reviewed Git tip.

The paired record now stamps the correct HEAD, but its base arm names only short `e040b1ee` and supplies no base tree or base-side porcelain. The report calls `e526e5b4` a “pristine tree”; the actual `e040b1ee` commit tree is `2131932e0ce3bd12a40ea045b2bdd3910b8e9050`, and a tree comparison shows `e526e5b4` is that base plus the then-new 294-line `tests/unit/t17-envelope.test.ts`. That overlay may not affect the two explicitly selected tests, but it is not the exact base stamp r1 B4 required. The same partial refresh remains visible at report `:363-365`, which calls §9 a 14-file diffstat although §9 and Git both say 16.

Fix: after B1's final content commit, rerun the required records. In the stale check, resolve `TIP` explicitly with `git -C <lane> rev-parse HEAD` while globbing the external log directory by its absolute path, and paste that command/output. In the paired record, stamp the full base commit, actual tree/overlay hash and disposition, base-side status, exact command/result, and the final HEAD commit/tree/status. Sweep every diff-count reference to the one measured result.

## B3 — The packet and D35 consequence promote the non-maximum 92 run as an every-site maximum

Files: `packets/s09-codex-r2.md:28-33`; `DECISIONS.md:1420-1422`; corroborating contradiction in `agent-reports/s09-envelope.md:450-470`.

This is a packet defect, filed against the orchestrator rather than the worker. Packet line 29 says every site fails to its last allowed attempt. The artifact says serve organs answer first time, and the report itself juxtaposes “every site” at `:452-453` with four one-attempt serve organs at `:458-459`. D35 then records 92 as the maximum-path consequence. A reviewer who accepts that dispatch premise never asks whether the remaining 20 attempts of the 112 ceiling are executable, and the shared `2*4` serve enumeration survives the very ruling meant to catch it.

Fix: append a D35 correction and make the r3 packet distinguish the observed 92 bracketing run from a full maximum-attempt run. Do not state the latter total until the completed two-round serve path has been measured from its ledger.

## N1 — A source comment still asserts the retracted `2*judge + final` arithmetic

Ticket: T17 r3 retraction sweep; the orchestrator must route it with the blocking repair.

File: `tests/unit/t17-envelope.test.ts:15-28`.

The test header still says three shipped legs were missing, describes the cooldown limb as a second undercount, and states `2 * judgeMaxAttempts + finalRetryAttempts`, “not `judge + final`.” That is exactly the claim this round retracts and M2b is supposed to keep rejected. The executable assertions use 4 and therefore remain discriminating, but the source now gives a future maintainer the opposite rule from the gateway, formula, D35, and campaign.

Fix: sweep committed comments and test descriptions for the retracted premise, state cumulative per-key accounting, and leave the panel leg as the correction. Include the nearby “both provider sequences” comments in the sweep so none can be read as fresh allowances.

# Verified without a finding

The cooldown retraction itself is correct. `withCooldownRetry` first calls the attempt callback with `judgeMaxAttempts` and then with `judgeMaxAttempts + finalRetryAttempts`; `createPostgresProviderGateway` counts already-ledgered attempts by run, work item, contract hash, and call-site key and passes only `maxAttempts - consumed`. At 3 + 1 the two sequences can spend four attempts cumulatively, not seven.

B2's functional replacement is present: `maxDepth` is a typed member of the sealed row, both production ceiling call sites pass it, `computeStructuralCeilingBasis` refuses `depth > maxDepth`, and `evaluateAskAdmission` converts that typed error to `AskRefusal`. The disclosed dependency constraint is accurate for the direct package graph: budget already depends on register, while API has no direct budget dependency. The remaining three-way 1..5 statement is truthfully filed as F-S09-6.

B3's nine-member deletion matrix is complete: two new `per_site_attempts` members, four `call_sites` members, and three `serve_leg` members are each deleted alone from an otherwise complete basis and passed through the strict persisted-basis parser. The integration run stores the complete basis in the run head and the runner reads it back, satisfying the J25 persistence question for this disclosure.

M2b faithfully applies the retracted expression. The filed transcript's mutation diff changes `judge + final` to `2*judge + final`, records `12 failed | 80 passed (92)` against the two-failure floor, restores the original file hash, and ends with the filed tree. Across the filed campaign, seven mutants are recorded CAUGHT and the provenance neighbour is recorded NOT_CAUGHT.

The filed three cluster logs each record the ledger test as passing and `2 failed | 90 passed (92)` overall, with the same two named baseline failures. I did not independently execute those tests under the packet's static-only constraint. I also did not execute the predicted 109-attempt fixture, the W12 live-provider ceremony, or the unmerged T9 branch in this round; those remain the next review's explicit verification gaps.

# PREDICTIONS

At least one other lens will accept 92 because it is read from a real ledger and exceeds 88, without noticing that the provider's serve branch hard-codes zero failures. A corrected current-tree run that drives two composition rounds, two segments per round, and one final R9 to their third attempts will record seven serve call sites, 21 serve attempts, and 109 total attempts; if it records a different value, the ledger—not this enumeration—wins and the formula must follow it. Re-running the stale check with an explicit lane `git -C` and absolute log paths will print nothing before B1 changes the tip, while the report's currently displayed command will continue to print all eight STALE lines from the mission directory.
