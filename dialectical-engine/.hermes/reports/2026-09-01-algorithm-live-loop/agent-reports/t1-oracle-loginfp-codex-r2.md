CODEX REVIEW T1-ORACLE-LOGINFP r2 — CHANGES · comments read through: t1-oracle-loginfp-r2-2026-09-05

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging. Repository heartbeat skills were read directly as Markdown.

BLOCKING: 2 / FOLLOW-UP: 1.

Reviewed round-2 delta **f079a20696f3406303fc402c5eb8a45415af4111 → fbc421dead025255866cf43b80bfeec21de6e151**, final tree **797b991ef558920338c7208dcb4e16b3a5dcc752**, against lane base **2af816f1**. The oracle changes by +242/−61 lines; TOOLING-TRAPS appends 38 lines. The measured code at fd6eb212 matches the tip; their sole difference is the traps append.

**Approval into dev after devsync: no. Approval to land the transfer on integration: no. Mechanical transferability of the full oracle delta to integration 1485b9e2: yes.** The exact round-1 examples are corrected, but the consumption rule still loses ordinary domain derivations, and the two classification passes still disagree under equivalent formatting.

## B1 — BLOCKING: the consumption classifier is unsound in both directions

**File/line:** [LENGTH_PRESERVING_USE:298](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:298), [consumedWhole:320](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:320), and [the non-index-run policy/control:858](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:858).

**Input → wrong outcome:** each following single declaration defines exactly the ruled option domain. All are reported at base 2af816f1; all return **[]** at both round-1 f079a206 and round-2 fbc421de:

```ts
const choices = [0, 1, 2, 3, 4, 5,].slice(1);
const choices = [0, 1, 2, 3, 4, 5].map(n => n).slice(1);
const choices = new Set([0, 1, 2, 3, 4, 5].map(n => n || 1));
const choices = [0, 1, 2, 3, 4, 5]["slice"](1);
const choices = ([0, 1, 2, 3, 4, 5] as const).slice(1);
```

These are alternatives, not declarations to combine in one scope. I also evaluated each declaration in isolation, stripping the TypeScript assertion where necessary: the arrays equal **[1,2,3,4,5]**, and spreading the Set yields exactly that array. None contains a depth token, so another arm cannot rescue the miss.

The class is **accepting partial expression evidence as proof of whole-declaration consumption**. The trailing comma leaves `after` starting with a comma; computed access leaves it starting with `[`; a type assertion leaves it starting with `as`. All take the permissive `!after.startsWith(".")` branch. For the chain, matching its first `.map` ignores the later `.slice(1)`. For the Set example, map preserves array length but collapses distinct values; the enclosing Set then contains precisely the five ruled values. Length preservation is not domain preservation. The additional block-callback form `.map(n => { return n; }).slice(1)` also returns [].

**The claimed default is therefore false:** unlisted syntax does not always report. A member operation need not start with a dot, and a listed first operation can conceal later narrowing.

The reverse direction is also wrong:

| Input suffix / source | Actual result | Tip oracle |
|---|---|---|
| `[0,1,2,3,4,5].reverse()` | [5,4,3,2,1,0] | DOMAIN_ENUMERATION |
| `[0,1,2,3,4,5].slice()` | [0,1,2,3,4,5] | DOMAIN_ENUMERATION |
| `[0,1,2,3,4,5].slice(0,4)` | [0,1,2,3] | DOMAIN_ENUMERATION |
| `const pages = [1,2,3,4,5,6];` | six one-based page values | DOMAIN_ENUMERATION |

The first two consume the entire index domain; the third narrows it to a different domain. All were negative in the round-1 one-line scanner. I also confirmed `.sort()` and `.filter(n => n % 2 === 0)` report. These are false positives relative to the stated outcome, although the base oracle already over-reported them.

**Length-preserving list, in full:** map, forEach, entries, keys, values, join, includes, indexOf, length. It is neither sufficient evidence of the final domain nor complete enough for ordinary whole-consumption: reverse, sort and copying slice are immediate counterexamples. Enlarging this list alone does not repair chains, surrounding expressions, or non-dot syntax.

**Q2, [1..6]:** reporting it in every layout makes its verdict consistent, but does not make it correct. A bare six-page list is not a duplicate definition of 1..5. The fact that adding `.slice(0,-1)` changes its domain justifies distinguishing the derivation from the bare list. It does not justify making both positive. This restores a base false-positive class that round 1 excluded, and the new control pins that over-reporting.

**Required fix:** retain the original three positive bare-domain controls and the corrected round-1 derivations; distinguish complete declaration use from an array's length or first suffix. Add paired controls for the syntactic wrappers and composition classes above, including a length-preserving map inside a domain-collapsing wrapper, a later narrowing operation, and a trailing comma. Keep unrelated whole or differently narrowed index runs negative, including the bare six-page example. Correct the contradictory overview at lines 210–211 and the stale “narrowed the shared WHOLE_DOMAIN” explanation at lines 379–383 as part of that repair. No filename exemption or depth-token requirement. Continue **F-T1-ORACLE-LOGINFP / B1** in the remaining authorized round.

## B2 — BLOCKING: runs are reclassified in incompatible representations, so layouts still disagree

**File/line:** [raw-source classification:348](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:348), [declaration-unit reclassification:353](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:353), and [line-based veto:590](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:590).

**Input → wrong outcome:** these equivalent declarations both produce the same six slots; the comment is identical:

```ts
const slots = [0, /* first slot */ 1, 2, 3, 4, 5];
```

```ts
const slots =
  [0, /* first slot */
   1,
   2,
   3,
   4,
   5];
```

The complete tip results are:

```json
[{"kind":"DOMAIN_ENUMERATION","line":1,"text":"const slots = [0, /* first slot */ 1, 2, 3, 4, 5];"}]
[]
```

This also reproduces in the **full immutable LoginFlow source**, edited only in memory: inserting that comment after its zero reports LoginFlow:252; spreading the same commented array over lines reports no site. No login behavior changes.

**Root cause:** the pass is source-level in location, but it does not classify each occurrence once. `ruledDomainRuns(source)` sees the comment interrupting the numeric run and classifies the remaining 1..5 as reportable. `ruledDomainRuns(unit.text)` runs again after the lexer removes comments and collapses whitespace; it sees 0..5 and withholds it. In the one-line case both verdicts address line 1, and `every(Boolean)` prevents withholding. In the wrapped case the raw reportable run touches lines 3–7, while the normalized unit withholds line 1. No physical line holds the complete pattern, and the only declaration candidate is vetoed. This is the same context-loss class as round 1, now between representations inside the prepass.

**Q1, architecture:** the common `record` boundary is an appropriate place to enforce a source-derived DOMAIN decision. The exact prefix/suffix wrapping controls and the full un-commented real JSX now behave as claimed. However, a line set assembled by independently reclassifying raw and normalized text does not establish one verdict per occurrence or layout independence “by construction.”

The other arms remain intact: the added veto applies only to DOMAIN_ENUMERATION; the ceiling and exclusive-bound predicates, declaration lexer, and scan loops are unchanged. Independent controls preserved the wrapped Zod five, wrapped exclusive six, crowded-line ceiling and comment ceiling; the unrelated-six conjunct stayed negative. A real bare domain sharing a line with an index run still reports.

**Required fix:** make every DOMAIN-producing window use the same occurrence decision with source correspondence across comments and normalization. Do not let the second representation invent a different run verdict merely to obtain a declaration's start line. Add the paired commented layouts and full-JSX variants above, preserving the existing literal-five and exclusive-six coverage. Continue **F-T1-ORACLE-LOGINFP / B2** in the remaining authorized round.

## Independent method and current shipped sites

I extracted the block from `type DuplicateKind =` through the start of `function shippedSourceFiles()` from each immutable Git blob, used Node's built-in `stripTypeScriptTypes` in memory, and called `duplicateBoundSites` on source strings. No application imports, Vitest invocation, repository edits or git mutations were involved.

The three original B1 derivations now each report a DOMAIN site. The exact `const slots = [0,\n  1, 2, 3, 4, 5];` and wrapped JSX now return []. The full LoginFlow prefix wrapping changes round-1's line-253 DOMAIN result to []. The five decisive new probes—trailing comma, map/slice, Set/map, commented one-line slots, commented wrapped slots—were repeated three times, identically: **[false,false,false,true,false]** for “has DOMAIN site.”

I additionally replayed the existing scanner describe block with a small synchronous assertion adapter and filesystem reads, without Vitest or application imports. Results: **base 29/31** (the two known shipped-tree assertions fail), **round 1 37/37**, **round 2 49/49**. This is source-only assertion replay, not the 62-case application suite. It shows why green existing controls do not refute B1/B2.

Using the scanner's exact roots, extensions and directory exclusions, I enumerated **232 shipped files**. Every file's working bytes match its blob at base, round 1 and round 2. Complete lists:

```text
BASE 2af816f1
apps/ui/components/LoginFlow.tsx:252 [DOMAIN_ENUMERATION] {[0, 1, 2, 3, 4, 5].map((slot) => (
packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;

ROUND 1 f079a206 and ROUND 2 fbc421de
packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;
```

Thus the current shipped-site claim is correct, including page.tsx's absence. It does not establish preservation of every ordinary domain construction.

Oracle SHA-256 **588dc1813bfd5483c7efed772c5a3f2e6e881a44a7aafd0ebbe791e337326d58** and LoginFlow SHA-256 **c946e45428214da4de31a5e267be0a24e9acc12f24aa55f01a683de2e8d20db6** match the immutable tip and recorded mutant targets.

## Q3 — mutation evidence, including m3, is substantive within the selected set

[Selector baseline](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/26-selector-green-at-tip.log:1) records `-t "the depth bound has a single source"` green at fd6eb212: **49 passed | 13 skipped (62), exit 0**. All six mutation transcripts use that selector.

| Mutant / artifact | Failed / passed / skipped | Complete failing group set within the selector |
|---|---:|---|
| [m1, remove withholding](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/27-r2-m1-remove-withholding.log:1) | 10 / 39 / 13 | Both shipped assertions; seven index-run layouts; index-run layout agreement |
| [m2, planted LoginFlow bound](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/31-r2-m2-real-depth-bound-in-loginflow.log:91) | 2 / 47 / 13 | Both shipped assertions, explicitly naming LoginFlow:251 [DEPTH_BOUND_LITERAL] expansionDepth < 6 |
| [m3, drop index test](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/28-r2-m3-drop-index-run-test.log:88) | 7 / 42 / 13 | Bare array, bare Set, multiline domain; two non-index longer-run cases; bare-domain and longer-non-index layout groups |
| [m4, drop whole-use test](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/29-r2-m4-drop-consumed-whole.log:1) | 2 / 47 / 13 | Prefix slice derivation and its layout group |
| [m5, drop unit-line pass](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/30-r2-m5-drop-unit-line-pass.log:1) | 3 / 46 / 13 | One-value-per-line and literal-on-own-line negatives; index-run layout group |
| [m6, neighboring 0..6 run](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/32-r2-m6-neighbour-longer-index-run.log:1) | 0 / 49 / 13 | None; exit 0 |

**m3 is load-bearing:** its lines 4/7 change only the index-run requirement, and failure entries at 88, 89 and 104 name the three bare-domain controls. The other four failures are the two deliberately positive longer-run cases and two layout groups. This proves the index test protects those bare controls; it does not prove the consumption rule is sufficient. The worker explicitly excludes the 13 skipped cases from its claims.

All six record pre/applied/restored occurrence counts **0/1/0**, matching before/after hashes and final empty porcelain. The LoginFlow m2 is a source-scanner mutation, not proof that its undeclared planted identifier compiles. I did not rerun mutating harnesses.

## Q4 — b14 accounting: zero unexplained names confirmed

I parsed distinct full FAIL names from the raw logs and reconciled W5's raw run against [31-fourcount-run2.log](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log:1). That summary contains counts, not a name list, so the actual `comm` operands were sorted unique names from [27-suite-run2.log](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log) and [round-2 b14](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/33-r2-b14-full-suite.log).

| Recorded run | Passed / total | Distinct test failures | Suite-load | Skips | Unhandled |
|---|---:|---:|---:|---:|---:|
| W5 run 2 | 2338/2418 | 80 | 1 | 0 | 1 |
| Round-1 b14 | 2345/2424 | 79 | 1 | 0 | 1 |
| Round-2 b14 | 2358/2436 | 78 | 1 | 0 | 1 |

Round-2 contains 110 test FAIL entries but **78 distinct names**, matching its summary. `comm -23` against W5 produces only:

```text
tests/unit/s1-1-depth-contract.test.ts > S1-1 · the depth bound has a single source > keeps the owning declaration as the only depth-bound site in shipped code
tests/unit/s1-1-depth-contract.test.ts > S1-1 · the depth bound has a single source > leaves no duplicate definition of the ruled ceiling anywhere in shipped code
```

`comm -13` produces no output. Versus round-1 b14, only the sendmail-options name vanishes; none appears. Therefore **zero unexplained by name** follows from W5 alone, without needing a larger union. Arithmetic closes: **80−2=78; 2418+18=2436; 2338+18+2=2358**.

The suite-load remains s14-ui's missing v3Presentation module. The unhandled rejection remains ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP, attributed by Vitest to the s7 authorization-database file. These are not passes.

I independently compared the sorted TypeScript diagnostic lines in 02/07/25: **8 → 8 → 8, byte-identical**, all in s14-ui. Filed RED controls are **39/62, 10 failed, 13 skipped**; filed GREEN and each cluster are **61/62, one failed**. The latter is inherited J10.

## Q5 / N1 — FOLLOW-UP: custody retractions are improved, but the report repeats an overbroad claim

**File/line:** [worker report:43](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md:43) and [262](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md:262).

**Input → wrong outcome:** the report says porcelain was `[]` before and after every gate, mutant and suite run, and that round-2 captures 20–33 all carry commit/tree/SHA and pre/post porcelain. The actual [cluster run 1:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/23-r2-cluster-run1.log:1), [run 2:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/23-r2-cluster-run2.log:1) and [run 3:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/23-r2-cluster-run3.log:1) each record:

```text
porcelain BEFORE: [ M dialectical-engine/tests/unit/s1-1-depth-contract.test.ts ]
porcelain AFTER: [ M dialectical-engine/tests/unit/s1-1-depth-contract.test.ts ]
```

Each header names f079a206 and its committed tree, with the **new working-file hash** 588dc181…. These are stamped runs of a modified working tree, not clean runs at fd6eb212. That is valid evidence when described accurately. Logs 20 and 24 have no such custody headers; 21/22 identify intentional working changes and file hashes without the advertised complete stamp set.

**Required fix:** replace the blanket claim with per-artifact custody: working-tree RED/GREEN and cluster frames, committed selected mutations, and committed b14. Preserve the logs. Round-2 b14 really does carry empty pre/post porcelain and its fd6eb212 tip; its evidence should not be diluted by claiming every other capture has the same custody. Ticket-ready **T1-ORACLE-LOGINFP-R2-N1**, continuation of the round-1 N2 evidence-scope class, for the orchestrator to route.

The old m4 “nothing else” claim and round-1 b14 immediate after-stamp claim are explicitly withdrawn in the report and self-report. The missing round-1 cluster stamps are acknowledged. The six current selectors/counts are correctly scoped. Historical log immutability is claimed, but no independently captured prior hash manifest was supplied; I cannot retrospectively certify that every historical byte is unchanged.

**Sendmail PROVISIONAL classification: cleared.** The revised [report:222](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md:222) and [self-report:334](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-self.md:334) stay within the evidence: local /bin/sh fixture, timeoutMs 1_000, 1011 ms failure, fileParallelism false, cause undetermined, shared remedy withdrawn. I checked the fixture/timer/config and matching blobs at dev, integration, base and tip. Round-2 b14 records this case green at **566 ms**; round-1 remains 79/1/0/1. W5 and lane runs are identified as different samples in the lineage, not identical full-suite trees.

**J10 inheritance: confirmed.** The web manifest is absent at b5a6b6eb, 2af816f1 and fbc421de; the before log already records the failure. The audit stops before its architecture assertion, so 61/62 is not an architecture pass.

## Packet audit

**Clear AMENDMENT 1's corrections.** It states the outcome and forbidden mechanisms, withdraws the stale page.tsx expectation and wrong failure kind, supplies the absolute mutation-tool path and machine-readable parent artifacts, and explicitly grants LoginFlow as a temporary restored mutant target. The measured site lists confirm the corrected expectation. The six transcripts use the named targets with restoration evidence.

I read D64 ADDENDUM 4 and linted the **dispatch file**, not the cumulative historical worker packet, together with my reviewer packet. Fresh result: **packet-lint: OK (2 packet(s))**, exit 0. Historical relative mentions are annotated rather than rewritten. The amended dispatch and reviewer packet resolve from their absolute paths. No new packet charge for N3/N4/N5.

The reviewer packet's classification claims are questions to verify, not independent evidence; B1/B2 above reject the worker's resulting mechanism. Its “31-fourcount” baseline is a count summary, while the paired raw 27 log supplies names. This is sufficient for the requested comparison.

The worker declares its role-floor skills and discloses the heartbeat-worker Markdown fallback. No declared floor skill is missing. Actual historical invocation cannot be certified from the declaration alone.

The two-file output contract takes precedence over generic heartbeat ticket posting. Findings are ticket-ready here; no board, ledger, packet or source file was changed.

## Q7 / Q8 — landing and integration transfer

I independently applied the **full one-test-file patch 2af816f1..fbc421de in memory** to integration **1485b9e2cb59f695133ebea6ec2b05cea3ca666e**. All five old hunk bodies had exactly one matching occurrence; no fuzz or context relaxation was needed. Applying the same patch to its own base reconstructs the tip exactly.

The hypothetical integration result retains its original prefix, including legacy-client coverage, and everything from REPOSITORY_ROOT onward equals the lane tip. SHA-256: **5021c342ae1fc05afe615150fb1935900f1d8acac4488bfdafa9adeaa8a4e648**. This independently supports the orchestrator's appended full-delta apply-check.

The incremental round-2 patch also applies exactly to integration plus the round-1 patch, producing that identical result. It does **not** apply by itself to pristine 1485b9e2, which lacks the round-1 guarded regex. Transfer the full reviewed delta from the lane base, not only the rework increment or the whole file.

**Mechanical transferability: yes. Landing approval: no**, because the transferred scanner preserves B1/B2 too. After correction and review, V's route remains lane/devsync into dev, then this lane into dev; the scoped test-file delta transfers back to integration. TOOLING-TRAPS is a literal append: the prior 103995 bytes hash to **14fade87b3e56ea379f632c56024658ccc2b2661cd55bca7f3d5003cca708e17** and remain intact.

## For V — before the merge

Do not land fbc421de: B1/B2 remain blocking; one more worker round is authorized.
Route R2-N1 for custody wording correction while preserving the recorded logs.
After approval, merge devsync into dev before this lane.
Transfer the full reviewed test-file delta to integration, preserving its legacy-client prefix.
Recheck the corrected delta against the actual destination tips; current applicability is pinned to 1485b9e2.

## Not verified

- No fresh Vitest/application suite, database, UI, installation, contract generation, live service, production behavior or source-mutating mutant was run. Runtime suite figures are independently parsed author artifacts; the fresh executions were source-only scanner/array probes and assertion replay.
- Node 25.7.0 was used for those probes, matching the logs; the package requests Node 22.23.1. Runtime compatibility on that declared version was not tested.
- Zero unexplained failure names is not a fresh diagnosis of 78 inherited failures or proof that identical names have identical causes. Sendmail's delay cause remains unknown.
- No git apply, merge, checkout, index update, commit or ref update occurred. The integration file was reconstructed only in memory, not executed.
- Historical log byte preservation and actual past skill invocations were not independently recoverable. Current worktree status was clean before review output; only the two authorized report files were written.

## PREDICTIONS

A fix that merely adds reverse/sort to LENGTH_PRESERVING_USE will still miss map/slice, Set/map and non-dot suffixes. A fix that removes one classification pass without preserving source addresses will reintroduce the declaration-start-line failure that m5 already exposes. Another green 61/62 capture or sendmail pass will not refute these source-only counterexamples. The full transfer should remain mechanically straightforward if rework stays in the scanner region, but the existing clean apply result says nothing about its corrected behavior.

MERGEABLE: no — the lane and its integration transfer need B1/B2 corrected and reviewed, although the full current oracle delta applies cleanly to pinned integration 1485b9e2.
