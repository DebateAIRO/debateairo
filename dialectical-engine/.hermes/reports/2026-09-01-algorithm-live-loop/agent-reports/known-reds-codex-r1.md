CODEX REVIEW KNOWN-REDS r1 — APPROVE · comments read through: known-reds-r1-2026-09-09
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol (Codex node contract and Claude router), heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging

Counts: 0 blocking findings; 10 nonblocking findings below (3 inherited test issues, 4 evidence corrections, 3 packet corrections), grouped into 7 ticket candidates. Three assigned test repairs approved. Independent unit checks: 13/13 passed across the two permitted files, each run once. Saved final-head records: 9 gates and 4 mutants.

Reviewed branch `lane/known-reds`, base/dev `ed804f3cab05213d289379031d5350ae4a07e1ef`, tip `0b2ca8863f376aed44cda583ecdac9fb56f4a43a`, tree `34868cab8b3137fe8c017478b5e65027f41e5706`. One commit; five files, +78/−6; four test files and an append to TOOLING-TRAPS, no product file. STRENGTH: entailed by Git reads.

Path bases throughout this report: **W** = `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-known-reds/dialectical-engine`; **M** = `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`. Source paths are relative to W; `packets/`, `agent-reports/` and `logs/` paths are relative to M. Line numbers are at the reviewed tip unless marked BASE.

The worker report and self-report were both present at the initial artifact read. The author is the assigned Opus worker `known-reds-worker`; this is the independent Codex reviewer seat assigned by the user. All three tickets were reread before filing: each now says `waiting_review`, authority epoch 1, rework round 0, with the 09:23 dispatch to this review. The packet's requested comment cursor is preserved above. No board state was written.

## Review of the three repairs

**1. S8: approve the added tree and the preserved observer.** `AnswerSchema` requires both arrays (`packages/contract/src/index.ts:591–592`). Each added node supplies the fields read by `redactNodeForPublic` and required by `NodeSchema`: valid identifiers/enums, complete labeled numbers, explicit nullable fields, the restatement object, arrays/booleans and ISO dates. The edge supplies the fields required by `EdgeSchema`, valid endpoint references to the two fixture nodes, and a complete PRESENT number. Its number traverses the edge redactor's `redactSource: false` branch. The projected objects fit `PublicNodeSchema`/`PublicDebateSchema`. STRENGTH: entailed by static field comparison; the saved successful database run is consistent with that comparison.

The whole object cast `as never` is still a partial Answer, not a valid complete `AnswerSchema` value: for example `answer_id`, `answer_version` and other required top-level fields remain absent, and the composed segment contains only `text` although `ComposedSegmentSchema` requires more. Those omissions predate the patch and do not enter this projection. This review approves the scoped repair of the consumed fields, not a claim of whole-Answer validation (N3).

The proxy still awaits the real repository publish, asserts its success, then throws `SIMULATED_AMBIGUOUS_COMMIT` (`s8-publication-database.test.ts:1687–1688`). The application still resolves the ambiguous result through fresh snapshot state (`publications.ts:287–297`). The test then checks one snapshot, a readable corpus key, no remaining provision intent, and successful public readback. A byte comparison confirmed that the entire suffix beginning with the original rejection assertion is unchanged, including the rest of the file; its original BASE :1712–1726 block is now :1754–1768. No assertion was weakened, reordered or repurposed. STRENGTH: entailed.

A populated tree is a reasonable representative payload: it additionally exercises both element redactors on the path to the same commit/key assertions. It introduces no second asserted requirement about graph identity, redaction completeness or nonempty trees. Empty arrays would also be legal and would still execute both outer PublicDebate parses; only the element callbacks would be skipped. The worker's stronger argument that emptiness makes `tree_included: true` intrinsically false is unsupported (N5). Population is acceptable coverage, not an obligation imposed by this row.

**2. PRO01: approve the stale-stub repair.** Git history confirms `970870f3` already wrapped the gateway's envelope check inside the content lease. `7b3a3063` changed acquisition from the blocking query to the try-lock query and retry loop; the advisory-lock stub sweep of that commit's test diff is empty. `git log -S` identifies that query-text change, not an ordering change. `s6-content-encryption-contract.test.ts:52–57` requires the try-lock string and excludes the old blocking form. These facts support repairing the fixture and give no reason to change product behavior. The contract test alone is not proof that every aspect of the product is correct. STRENGTH: entailed for history/query contract; consistent-with for the bounded defect diagnosis.

`{ rows: [{ acquired: true }] }` satisfies the exact boolean comparison at `packages/db/src/index.ts:305`. The existing live-run row and `{ unlocked: true }` then permit the lease to enter and release normally. The unchanged pool stub supplies a pinned ceiling of 2 and consumed count 2; `BudgetRepository.assertModelAttemptAllowed` compares `count >= maxModelAttempts` and throws the expected code (`packages/budget/src/index.ts:392–397`). The request remains a served defender JUDGE call, so it does not take the evaluator exemption. The assertion at :232 therefore observes the intended envelope stop. Deleting the old branch keeps an unexpected old query loud; retaining it is unnecessary. STRENGTH: entailed by source and the independent 10/10 run.

The gateway's lease-before-envelope order is present but no dedicated pin was found in the bounded test search. The architecture test's ordering assertions concern evaluator `withRunLock`, while `s10-carrier-erasure-red.test.ts:202` checks only runner lease presence. STRENGTH: consistent-with for absence of a pin across all possible test phrasing. This absence alone is not a demonstrated product defect or authority to invent a new ordering contract; the worker's `Non-blocking, no ticket implied` paragraph should be understood as an observation, not an established finding silently exempted from ticketing.

**3. T9: approve both comment edits.** Independently comparing the BASE and tip files after excluding the inspected comment lines gives identical non-comment line sequences in both files. The registration replacement agrees with the no-waiver policy at :6775–6789: requests and response mapping share the issuer's event loop, and the cadence numbers are diagnostics. The mapper assigns `score` at :7141 while issuance is ongoing. The changed :7146–7147 comment is inside the child's extracted region, :7104–7156. The independent f-t9 run passed both behavioral cases and the source check, 3/3. STRENGTH: entailed.

The saved child text at `logs/small-trio/red/00-RED-new-unit-tests.log:219–227` prints `TypeError: T9_PROBE_INJECTED_REJECTION`, followed by its stack and Node version, without the previously claimed code. The landed positive control checks the injected reason, absence of JOIN_REPORTED/SURVIVED and nonzero status; the new header accurately describes that observation. It does not promise that every possible rejection reason receives the same rendering.

## Bounded class sweep

The worker missed no member of the requested advisory-lock literal class. An independent scan of `.includes(...)` calls under `tests/`, allowing different receiver names and line breaks, found **six lock-matching branches in five files**. Calling them five sites is correct if a site means a client/observer, not a branch. Restricting the receiver to literal `sql` would wrongly omit load01's `text`.

| File/line | Disposition |
|---|---|
| `tests/unit/pro01-runner-tree.test.ts:206` | Fixed here: acquired=true for the try-lock. |
| `tests/unit/xrev01-node-review.test.ts:100` | Stale blocking match; N1. |
| `tests/unit/load01-run-projection.test.ts:10` | Stale blocking match, then generic-row fallback; N2. |
| `tests/unit/evaluator-addon.test.ts:280–281` | Handles both forms; current try-lock answer is correct. |
| `tests/integration/s6-content-encryption-database.test.ts:388` | Observes the separate owner-admission blocking lock, still issued at `packages/db/src/index.ts:888`; clear. The :276 history observer already recognizes both forms by regex. |

The two affected sibling files, acquisition function, loading-projection function and gateway are byte-identical from `169941c6` through `ed804f3c` to this tip. The saved dev run and the worker's tip runs show the same failing rows. Thus these are inherited failures, not introduced by this diff. STRENGTH: entailed for unchanged source and recorded failures; consistent-with for runtime behavior on unexecuted intermediate environments.

## Findings

**N1 — inherited XREV01 double prevents the envelope observer from running.** File/line: `tests/unit/xrev01-node-review.test.ts:100`. Input → wrong outcome: the gateway issues `pg_try_advisory_lock`; the blocking-only matcher falls through to `UNEXPECTED_CLIENT_QUERY`, so :126 never observes the intended envelope exhaustion. Evidence: `logs/known-reds/finding-01-xrev01-class-sibling.log:31–46`, 1 failed/5 passed, exit 1; the dev log at :6586 names the same row. Required fix: update this double to model the current acquired-row response, retain the envelope assertion and verify that file. STRENGTH: entailed for the mismatch and recorded failure. Outside this lane's edit contract.

**N2 — inherited LOAD01 double creates unbounded contention.** File/line: `tests/unit/load01-run-projection.test.ts:10–26`; consumer `packages/db/src/index.ts:300–314`. Input → wrong outcome: the try-lock misses all special branches and receives the generic run row from :18–26. That row has no `acquired`, so the consumer releases the client, sleeps 10 ms and reconnects indefinitely; no lock has entered the acquired list on this path. The loading-projection assertions remain unreached. Evidence: `finding-02-load01-class-sibling.log:21–30`, timeout 120000 ms, 0/1 passed, duration 120.78 s; dev log :2639 has the prior timeout. Required fix: model successful try-lock acquisition explicitly and make unexpected query shapes fail promptly, retaining the ownership/projection assertions. STRENGTH: entailed for the source path and saved timeout; consistent-with for attributing that recorded timeout solely to this path. No modified-stub experiment was run, so no claim that this is the only defect in the file.

**N3 — inherited partial Answer still bypasses the contract.** File/line: `tests/integration/s8-publication-database.test.ts:1706–1753`, especially the cast; contract `packages/contract/src/index.ts:350–355,575–645`. Input → wrong outcome: required Answer fields can be absent without a compiler diagnostic, allowing a later newly consumed field to fail before the ambiguous-commit observer, as the saved BASE red already demonstrates. Required fix: in a separately authorized fixture-maintenance ticket, use a contract-checked complete Answer and remove this cast while preserving the existing scenario/assertions. `tests/support/v2uiFixtures.ts:9,29` supplies a reusable parsed builder; verify overrides rather than assuming it is drop-in or identical to this literal. STRENGTH: entailed for the current omission/bypass and builder; consistent-with for a future recurrence. The new Node/Edge fields themselves are correct, so this inherited debt does not block this repair.

**N4 — the worker evidence states the wrong LOAD01 return value.** File/line: `.hermes/TOOLING-TRAPS.md:2384–2387`; `agent-reports/known-reds.md:83,192`; `agent-reports/known-reds-self.md:28`; repeated in reviewer packet :17. Input → wrong outcome: following those descriptions sends the next investigator to an empty-row branch that the actual try-lock never matches. The real fallback is the populated run row described in N2. Required fix: append/carry an evidence correction naming the fallthrough at load01 :18–26, the missing `acquired` field, and release/retry; retain the causal confidence qualification. STRENGTH: entailed by source. Charge the seat's evidence and the packet's repeated claim, not the pro01 implementation.

**N5 — populated fixture preference is overstated as contract necessity.** File/line: `agent-reports/known-reds.md:69,227`; `agent-reports/known-reds-self.md:44`. Input → wrong outcome: a legal empty-array payload is described as an internally untrue artifact, encouraging an unnecessary nonempty-tree requirement. Both outer parses still execute for empty arrays; `AnswerSchema` has no minimum cardinality, and `PublicDebateSchema:568–570` adds no flag/cardinality relationship. Required fix: describe population as additional element-path coverage and leave the tested property as corpus-key preservation. STRENGTH: entailed for schema/control flow; undetermined for any stronger nonemptiness policy because none is supplied. Charge the seat's explanation; clear its chosen populated fixture.

**N6 — the report infers scheduling invariance from a concurrent pass.** File/line: `agent-reports/known-reds.md:219`. Input → wrong outcome: a T9 run overlapping other checks is described as having unaffected pass/fail, although unchanged Git state cannot establish the absence of scheduling effects on a timing-sensitive test. The r0-05 header starts at 09:03:55; the typecheck, pro01 and f-t9 headers fall within its 376.39 s run. Required fix: say the recorded concurrent schedule passed; retain the disclaimer that isolated timing and scheduling invariance were not verified. No new database run is required for these comment repairs. STRENGTH: entailed for overlap/observed pass; undetermined for scheduling invariance. Charge the seat's evidence qualification.

**N7 — an elapsed-time claim has no possible basis in the cited history.** File/line: `agent-reports/known-reds-self.md:53`, “three years of survival.” Input → wrong outcome: a history beginning with the cited August 2026 commits is priced as years by a September 2026 report. Required fix: remove the unsupported duration or replace it with a dated, artifact-backed interval. STRENGTH: entailed. This is a reporting correction, not a test or product defect.

## Packet audit

**N8 — KNOWN REDS asserts unmeasured global absence.** File/line: `packets/known-reds-worker.md:20` and identical dispatch. Input → wrong outcome: “No additional failures anywhere” is contradicted by the two inherited same-class rows and can be read as authority to ignore them. Required fix: scope the sentence to the named gate set and carry separately attributed failures with their owners/tickets. STRENGTH: entailed by N1/N2 source and saved records. Charge the packet; clear the seat for discovering and reporting the contradiction.

**N9 — S8 line-range boundary includes the next test.** File/line: `packets/known-reds-worker.md:23,47` and the F-S8 ticket contract. Input → wrong outcome: interpreting BASE :1678–1730 literally reaches the next test at :1729–1730; BASE assertion block is :1712–1726 and the scenario closes at :1727. Required fix: use the named test plus its exact fixture/assertion anchors, or correct the BASE ranges. STRENGTH: entailed by `git show ed804f3c`. Charge the packet; clear the seat, whose diff stays within the intended fixture and preserves the neighboring test byte-for-byte.

**N10 — baseline worktree description disagrees with the emitted provenance.** File/line: `packets/known-reds-worker.md:43`, copied from `packets/WORKER-RECORDS-BLOCK.md:13`; `logs/known-reds/baseline/00-typecheck-base-run1.log:3` and the other baseline headers. Input → wrong outcome: the block describes baseline captures in a separate base worktree, while all seven headers name this lane's worktree at untouched `ed804f3c`, before the worker edit. Required fix: explicitly permit/name pre-claim measurements in the untouched lane, or supply the separate location actually intended. Preserve the existing records and their true location; this wording mismatch does not invalidate their clean base stamps or require rerunning them. STRENGTH: entailed for recorded paths/commits. Charge the orchestrator's provenance description, not the worker.

Other packet checks are clear. The canonical WORKER-RECORDS-BLOCK is present byte-for-byte; the worker packet equals its dispatch byte-for-byte. The provision log ends with the required sealed BASE commit line. FACTS correctly identify the consumed arrays, projection-before-publish failure, pro01 SQL mismatch, and withdrawn T9 wording; the long dev-log error is supported by the message at :45616 within the failure beginning :45607. Both mandatory worker outputs and the TOOLING-TRAPS append are allowed. The conditional product clause caused no harm: the diagnosis selected the test branch, and no product file changed. A shared-builder import would exceed the named fixture hunk, so its deferral is not worker noncompliance. STRENGTH: entailed.

The worker's SKILLS LOADED declaration covers its requested floor and honestly distinguishes tool loads from markdown reads. The supplied artifacts do not include the full worker session transcript, so actual delivery of every skill body is not independently certified here. Absence of that transcript is not evidence of a missing load. The user's explicit reviewer model, test limits, output paths and no-mutation instructions govern over older generic protocol text.

## Saved artifacts and independent checks

| Evidence | Result verified |
|---|---|
| BASE `00-pro01-base-run1/2/3.log`; worker `red-02-pro01-red.log` | Each 9/10 passed, exit 1, expected-envelope versus unexpected-try-lock failure. |
| BASE `00-s8-publication-base-run1.log`; worker `red-01-s8-red.log` | Each 25/26 passed, exit 1, missing-array map failure at BASE :1712. |
| `red-03-ft9-unattended-before.log` | 3/3 passed, exit 0; before-comment evidence, not an invented red. |
| `r0-01-typecheck-run1/2/3.log` | Each exit 1, same eight s14-ui diagnostics as all three BASE captures. |
| `r0-02-pro01-run1/2/3.log` | Each 10/10 passed, exit 0. |
| `r0-03-s8-publication-run1.log` | 26/26 passed, exit 0; ambiguous-commit row shown at :213. |
| `r0-04-ft9-unattended-run1.log` | 3/3 passed, exit 0. |
| `r0-05-t9-counterbalance-filtered.log` | 1/69 passed, 68 skipped, exit 0; 376.39 s. |
| `r0-m1-s8-nodes-removed.log`, `r0-m2-s8-edges-removed.log` | Each 25/26 passed, exit 1, map failure at tip :1754; restored hashes match current source. |
| `r0-m3-pro01-trylock-branch-reverted.log` | 9/10 passed, exit 1, old SQL-mismatch failure at :232; restored hash matches current source. |
| `r0-m4-s8-neighbour-node-id-rename.log` | 26/26 passed, exit 0; node renamed while edge retained its old reference. |

All six typecheck OUTPUT byte spans match, SHA-256 `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. This is compiler-output identity, not a green typecheck or validation of the cast fixture. The saved compiler is `typescript@7.0.2`; no in-test programmatic compiler was used here. Saved runner identity is `vitest@4.1.10`. STRENGTH: entailed by artifact reads/comparisons.

The official, read-only `tools/stamp-check.sh W M/logs/known-reds/r0-` was independently run, exit 0, and agrees with `stamp-check-r0.out`:

```text
records compared: 13 · failures: 0
OK: every record stamps the filed tip
```

Every final gate/mutant header also names the reviewed tree. The three killed mutants validate the repaired fixtures' ability to reach their observers; they do not independently mutate the product's key-retention logic. The surviving neighbor and schema source establish that this row imposes no edge-to-node identity check. That is a limit of its coverage, not an identified referential-integrity defect without a governing requirement.

Independent test commands, run serially once each without output-file redirection:

```text
pnpm exec vitest run tests/unit/pro01-runner-tree.test.ts --no-cache
      Tests  10 passed (10)
   Start at  09:25:23
   Duration  1.71s (transform 534ms, setup 0ms, import 1.50s, tests 8ms, environment 0ms)
```

```text
pnpm exec vitest run tests/unit/f-t9-unattended-promises.test.ts --no-cache
      Tests  3 passed (3)
   Start at  09:25:46
   Duration  446ms (transform 16ms, setup 0ms, import 29ms, tests 272ms, environment 0ms)
```

Both tool-reported process exit codes were 0. The timings above are the local tool output, not newly stamped mission acceptance logs. STRENGTH: entailed for these executions.

## Tickets to file

These are candidates for the orchestrator to deduplicate and route; this reviewer did not create or edit board files. Nonblocking sets when the corrections land, not whether they are recorded.

| Candidate | Findings | Required outcome |
|---|---|---|
| KNOWN-REDS-XREV01-TRYLOCK | N1 | Correct the stale client and restore the existing envelope assertion's execution. |
| KNOWN-REDS-LOAD01-TRYLOCK | N2 | Correct acquired-row handling and prevent unknown SQL from masquerading as a run projection; verify the existing row without a timeout. |
| KNOWN-REDS-ANSWER-FIXTURE-CONTRACT | N3 | Authorize the needed import/fixture scope, build a complete contract-checked Answer, retain the ambiguous-commit assertions. |
| KNOWN-REDS-EVIDENCE-ERRATA | N4–N7 | Correct the load01 explanation in the trap/report/packet, qualify population and scheduling claims, remove the unsupported years claim. |
| KNOWN-REDS-PACKET-FAILURE-SCOPE | N8 | Limit the known-red guarantee to the measured gate set and explicitly attribute the two siblings. |
| KNOWN-REDS-PACKET-S8-ANCHORS | N9 | Correct the fixture/test/assertion boundaries in dispatch and ticket templates. |
| KNOWN-REDS-BASELINE-PROVENANCE | N10 | Align the canonical records wording and packet with the emitted pre-claim lane provenance. |

W5-R1-F1 remains the already named owner of the eight unchanged typecheck diagnostics; this report proposes no duplicate ticket for it.

## Landing

**Mergeable into the inspected dev `ed804f3c`: yes.** An isolated, read-only calculation used `git merge-tree --trivial-merge ed804f3c ed804f3c HEAD`, exit 0, with no conflicts. All five result blobs equal their corresponding HEAD blobs. `merge-base(dev, HEAD)` and `HEAD^` both equal `ed804f3cab05213d289379031d5350ae4a07e1ef`; dev has no divergent change to reconcile. Therefore the result is the existing tip tree:

```text
34868cab8b3137fe8c017478b5e65027f41e5706
```

STRENGTH: entailed. The legacy read-only merge-tree form was used deliberately to honor no Git mutation; no `--write-tree`, index, branch, worktree or reference update was performed. This is a mergeability result, not a performed merge or an integration gate against a later dev tip. The source worktree remained clean after the independent unit runs and at filing preflight.

Disposition: PEER REVIEW APPROVED; READY FOR HERMES REVIEW for the three scoped repairs, with the nonblocking findings above available for routing. No Done or merge state is asserted.

## Not verified

- No embedded database was started. S8, T9 integration, the BASE runs and mutation executions are reviewed saved evidence, not independent reproductions in this seat.
- No full suite, third-party service call, install, typecheck rerun, additional unit file, live-data check or modified-stub experiment was performed. No claim of global green or absence of other regressions.
- The broad proposition that every possible gateway-order test is absent is not proven by a bounded textual search. No new ordering policy or graph-integrity policy is inferred.
- No skill-body delivery audit of the worker's private transcript, independent timing-isolation measurement, or subsequent dev integration was performed.
- Only the two assigned reviewer output files were written. Product/tests, saved logs, board and DECISIONS were not edited; no Git mutation or push was performed.

Prediction for another independent lens: the easiest overclaims are that this is now a fully schema-valid Answer and that load01 returns an empty row set. I would check `ComposedSegmentSchema`/the `as never` cast and load01's unmatched-query fallback first. This prediction is based on this seat's source reads; no other current-round review verdict was consumed.

REVIEW: approve — the scoped test repairs preserve their intended assertions and match the checked evidence, with inherited test debt and packet/report corrections explicitly routed as nonblocking follow-ups.
