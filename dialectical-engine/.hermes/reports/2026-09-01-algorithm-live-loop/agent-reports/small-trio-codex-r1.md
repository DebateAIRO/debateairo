CODEX REVIEW SMALL-TRIO r1 — APPROVE · comments read through: small-trio-r1-2026-09-08

Counts: 0 blocking code findings; 2 nonblocking worker-report corrections (W1–W2); 1 packet charge (P1); 2 pre-existing ticket candidates. All three fixes are cleared for landing. STRENGTH: consistent-with (review judgment supported below).

Source paths are relative to /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-small-trio/dialectical-engine. Report, packet and log paths are relative to /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop.

Exact comparison: base 116db3455d5c0aad985c7212e348d8c04a554ad7 → head ac2ccbb96cfdd0c0234aa4727e2f80f3f051dcb4. RED commit 97a306e904e9ac9d3724ac9d43381fff19adf34c contains only the three new unit files. The final seven-file diff contains two production files, one integration-test edit, three new unit files and append-only TOOLING-TRAPS documentation; no dependency, configuration or migration changes. SHA-256 of the 34,227-byte patch from git diff --no-ext-diff --no-color --binary --full-index 116db345..ac2ccbb9: 3b0b81319673f37d29ef1ff67c4dfe0d09b5454bea6a066dd584f574a9a657b4. STRENGTH: entailed by fresh Git inspection and hashing.

## Findings and dispositions

**1. F-DEV-REGISTER-ROLE-REF-OVERRIDE — clear.** File/line: apps/runner/src/dev-deployment-register.ts:198. Input → former wrong outcome: a nonblank unconfigured override became an unbounded error-message suffix. The patched throw uses only the literal code and role argument; both call sites supply literal role names at :204 and :207. The override is neither the cause nor another error property, and this resolver does not log it. The reader at :167 checks TypeError, the exact message and membership in the two-member private set before returning a role. Required fix: none. STRENGTH: entailed for the supported string-input rejection path.

The production caller is apps/runner/src/dev-deployment-register-cli.ts:14. It resolves the role refs before seeding and lets the error escape after pool cleanup. The throw's source line is now constant too; ordinary uncaught-error rendering therefore has no rejected override to print in its message, cause or source excerpt. This is source evidence, not a fresh stderr capture. The unchanged t16 row at tests/integration/t16-algorithm-register.test.ts:526 supplies an unknown provider and checks nonzero exit plus the constant in stderr at :531; its saved exact-head gate reports 16/16. It still exercises the intended failure. The substring assertion alone would not detect the old suffix leak; the new exact-message assertions and mutant A supply that protection. STRENGTH: entailed by source and saved assertions; exact rendered stderr not independently measured.

Fallback on absent/blank input and acceptance of configured overrides remain at :196 and :200 and are covered by the new control. Both role arms are covered. Configured role identities may still appear in legitimate register/warning output, as unchanged t16 :514 expects; the no-leak conclusion concerns rejected unconfigured values. The classifier has no production caller today, so its comment about a log path describes an available interface rather than existing telemetry. STRENGTH: entailed by source/caller search.

**2. F-DIAG-ERASURE-CAUSE-LOSS — clear.** File/line: packages/db/src/account-erasure.ts:768, :796, :1011. Input → former wrong outcome: throws from three different per-item operations returned indistinguishable INVALID_EVIDENCE records. Required fix: none; each catch now adds its own bounded stage while still discarding the original cause. STRENGTH: entailed.

| Catch | Stage | Operation actually enclosed |
|---|---|---|
| :768 | run-key-provision-cleanup | Existence/ownership checks, key destroy, readback and cleanup-claim completion |
| :796 | account-erasure-execute | execute(erasureId, source), including preview/status work and notification-lease execution |
| :1011 | private-run-cleanup-complete | completePrepared(erasureId, source), including manifest, ownership, publication/run-key cleanup and finalize |

These are truthful operation-level labels, not claims to distinguish every internal read/decrypt/verify step. All three are in the frozen vocabulary at :595. I extracted AccountErasureTransitionOutcome and PrivateRunErasureOutcome from base/head and compared their declarations byte-for-byte: identical. The run-key method's local outcome union is unchanged too. The optional return-field annotations support the added field; cleanup ordering, retries, SQL, key destruction and persistence operations are unchanged. STRENGTH: entailed by source and byte comparison.

“Stage only on the swallow path” is real. Direct INVALID_EVIDENCE pushes at :753 and :758, the CLEANED/CONTENDED push at :761, and ordinary execute/completePrepared result pushes at :795 and :1010 retain their old fields. This includes deliberate INVALID_EVIDENCE results returned without throwing. Mutant E adds a stage to the :761 success push and fails tests/unit/f-diag-erasure-cause-loss.test.ts:85, protecting the same exact object shape used by tests/integration/s6-content-encryption-database.test.ts:2331. E directly exercises one success branch; source inspection supplies the broader all-noncatch-path conclusion. STRENGTH: entailed with that coverage boundary.

The live callers at apps/api/src/main.ts:330–332 await and discard these reconciliation arrays. The category is available internally but does not itself introduce production logging or an HTTP field. Leaving packages/db/src/index.ts:1093–1097 unchanged is reasonable: it translates local ownership validation into the existing domain error and does not distinguish reconciliation items. Qualification to the worker's wording: normalizeRunOwnership has multiple validation throws overall (:831–834), not literally one; the relevant typed legacy call supplies ownerRef:null and a string asker. This does not change the disposition. STRENGTH: entailed.

**3. F-T9-UNATTENDED-PROMISES — clear.** File/line: tests/integration/registration-database.test.ts:7119 and :7131. Input → former wrong outcome: a mapped resend promise could reject unattended across cadence awaits and terminate the process before joining. The helper attaches catch synchronously and returns the identical promise passed in. Required fix: none. STRENGTH: entailed by the native-Promise source path.

The stored promise is the mapped result of injectResend(...).then(...), exactly as at base. The initial injectResend promise is already observed by then; rejection propagates to the mapped promise, now immediately attended. The discarded catch-derived promise fulfills with undefined because its callback cannot throw on this path. No replacement fulfilled promise or altered reason enters issued.

| Timing case | Promise.all behavior retained |
|---|---|
| Rejection before joining | Attendance prevents the interim unhandled event; the later aggregate observes the same stored rejection. |
| Multiple rejections already settled before joining | Reactions are registered in input order; the first queued rejecting reaction wins, not necessarily the earliest historical failure. |
| Rejection after joining | The aggregate already observes each mapped promise and rejects on the first rejecting reaction it receives. |
| One rejection while other slots pend | The aggregate rejects without waiting for those slots; their eventual rejections remain attended too. |
| All fulfill | Same observations, order, scoring, cadence parameters and receipt assertions. |

“Same moment” is defensible as unchanged join/settlement semantics, not exact wall-clock identity: the extra reaction has normal scheduling overhead, and base could die before reaching the join. No allSettled wait or swallowed replacement value has been introduced. The saved T9 runs support preserved live behavior. The unit source-slice probe dynamically covers the early rejection with stubs; the remaining timing cases above are source reasoning. STRENGTH: entailed for promise/control flow; consistent-with for unchanged real-window timing.

The post-RED assertion edit is legitimate. The recorded child prints TypeError: T9_PROBE_INJECTED_REJECTION without ERR_UNHANDLED_REJECTION. The corrected control checks the reason, nonzero status and absence of both JOIN_REPORTED and SURVIVED. The normal probe still requires join reporting, survival and zero exit. This retains the intended observer. The stale opening comment at tests/unit/f-t9-unattended-promises.test.ts:23 still names ERR_UNHANDLED_REJECTION and should be corrected when next editing the test. STRENGTH: entailed by RED output and the assertion diff.

**W1 — nonblocking worker-report correction: support code was chosen, not necessary.** File/line: agent-reports/small-trio.md:51; apps/runner/src/dev-deployment-register.ts:155 and :167. Input → wrong outcome: treating packet outcome 1 as requiring an exported vocabulary and reader overstates why the worker expanded the literal helper-only grant. The outcome permits omitting the value and makes further diagnostics conditional; a bare constant alone satisfies that minimum. A role cause also does not logically require an exported reader. Required fix: describe the addition as an optional bounded design choice and retain the scope disclosure, rather than saying the packet forced it. I clear the disclosed support code for landing as closely related to the permitted bounded channel; no code rework is required here. Clear the packet of making this expansion unavoidable. STRENGTH: entailed for the textual mismatch; consistent-with for accepting the limited scope.

**W2 — nonblocking worker-report correction: F is not behavioral RED for the edited downstream assertions.** File/line: agent-reports/small-trio.md:31; tests/unit/f-t9-unattended-promises.test.ts:112. Input → wrong outcome: “all three rows fail” can be read as proving the corrected child-death assertions were exercised and falsified. In F the control fails the attendance-count prerequisite at :112, before creating its child or executing :116–120. Required fix: identify its control failure as a source/precondition check; the primary probe fails behaviorally at :95. Do not promote F into assertion-level RED for the corrected downstream checks. The control's source, its green exact-head runs and the genuinely behavioral primary probe suffice for approval. STRENGTH: entailed by r0-mut-f-attendance-removed.log.

## Saved verification evidence

These are saved worker executions, not fresh reviewer tests. All rows below are observations from the named logs under logs/small-trio. STRENGTH: entailed.

| Records | Exit | Observed result |
|---|---:|---|
| red/00-RED-new-unit-tests.log at 97a306e9 | 1 | 11 failed / 5 passed |
| r0-01-unit-run1.log, r0-01-unit-run2.log, r0-01-unit-run3.log | 0 each | 16/16 each |
| r0-02-typecheck-run1.log, r0-02-typecheck-run2.log, r0-02-typecheck-run3.log | 1 each | 8 existing s14-ui diagnostics each |
| r0-03-erasure-s10-http.log | 0 | 8/8 |
| r0-04-erasure-s10-ui.log | 0 | 3/3 |
| r0-05-erasure-s8-publication.log | 1 | 1 failed / 25 passed |
| r0-06-erasure-s6-content.log | 0 | 48/48 |
| r0-07-t16-algorithm-register.log | 0 | 16/16 |
| r0-08-t9-run1.log, r0-08-t9-run2.log, r0-08-t9-run3.log | 0 each | 1 passed / 68 skipped each |
| r0-mut-a-override-appended.log | 1 | 3 failed / 3 passed; exact-message and role-reader checks |
| r0-mut-b-erasure-stage-collapsed.log | 1 | 1 failed / 6 passed; stage assertion :67 |
| r0-mut-c-handler-detached.log | 1 | 2 failed / 1 passed; child survival and push contract |
| r0-mut-d-rename-neighbour.log | 0 | 3/3; four rename occurrences |
| r0-mut-e-stage-on-success-path.log | 1 | 1 failed / 6 passed; success object :85 |
| r0-mut-f-attendance-removed.log | 1 | 3 failed; behavioral probe plus two prerequisite/source checks |

Final gate records identify the exact head/tree, tool and empty before/after tracked state. The six mutant transcripts show pre=0, expected application count, restored=0, matching before/after hashes, empty porcelain and RESULT: ok; restored hashes match the reviewed target files. The recorded tools are Vitest 4.1.10, TypeScript 7.0.2 and Node v25.7.0. No new in-test programmatic TypeScript check uses typescript-classic. STRENGTH: entailed.

I independently re-extracted, sorted and hashed diagnostic lines from all three base/head pairs. Each has 8 diagnostics and SHA-256 58eb15faf42f2396f87ffdeeeac5ac3a2ca418d799ba0f79aef3cd66f35b38ab. This is diagnostic identity, not a green compiler or byte-identical entire logs. Provisioning ends with the sealed PROVISIONED OK line carrying the full base commit. The fresh official stamp-check exited 0 over 21 records: 14 gate records, 1 identity record, 6 mutants. RED and base captures were separately excluded. Its last lines:

    records compared: 21 · failures: 0
    OK: every record stamps the filed tip

STRENGTH: entailed. Stamp identity alone does not prove fresh execution; the emitter frames and saved assertions provide the execution evidence.

## The s8 red row

Confirmed pre-existing and untouched. File/line: tests/integration/s8-publication-database.test.ts:1678 and :1712. The lane gate expects SIMULATED_AMBIGUOUS_COMMIT but receives “Cannot read properties of undefined (reading 'map')”. The identical test/error appear in logs/w5/27-suite-run2.log:44442–44446; the name also appears in logs/dev-merge/03-names-dev.txt. logs/dev-merge/17-attribution.txt removes only POL-03 and T9 from its preceding dev comparison, not s8. DECISIONS.md:1133 records the pristine b5a6b6eb reproduction, and a fresh ancestor check confirms b5a6b6eb is inside this lane's base. STRENGTH: entailed.

Source corroborates the history: the fixture at :1706–1711, cast as never, omits nodes/edges. Unchanged apps/api/src/publications.ts:246–247 maps those fields before the proxied publish operation, explaining why the simulated ambiguous-commit throw is never reached. The application, publication repository, db index and test are unchanged in this diff; the modified erasure catches are not called on this failing path. STRENGTH: entailed by source and saved failure. No database reproduction was rerun.

## Packet audit

**Facts and records — clear.** The reviewer packet was read in full first. Worker packet and filed dispatch are byte-identical. The canonical records block beginning “## Records and gates (binding)” occurs verbatim in each (3,576 bytes). Base inspection confirms the quoted resolver throw, t16/architecture anchors, 972-line db erasure file with catches at :746/:761/:966, index call and T9 join. The db erasure correction was present before dispatch and targets the correct implementation. Traps are append-only. STRENGTH: entailed.

**Contract reach — clear the packet; accept the disclosed expansion with W1.** The narrow resolver grant did not force an exported reader, but the added support code introduces no unrelated behavior. The erasure field/type plumbing is necessary to carry the explicitly requested category and is within the spirit of the grant. The T9 helper stays inside the granted region. The optional db index edit was reasonably declined. STRENGTH: consistent-with for scope adjudication, grounded in packet :18–20 and :40.

**P1 — charge the worker packet's omitted known-red gate exception, nonblocking.** File/line: packets/small-trio-worker.md:19 and the identical dispatch line. Input → wrong outcome: requiring all four erasure files to “stay green” on a base already containing the adjudicated s8 failure creates an unattainable literal gate and unnecessary attribution work. Required fix: future dispatches should name this precise exception and D23 ADDENDUM-5 authority while requiring no additional failures. Preserve sent records; this review records the correction without editing them. Clear the worker of causing the failure. The reviewer packet names the exception and is clear on this point. STRENGTH: entailed.

The omitted exact T9 filter is a convenience issue rather than another charged defect: the enclosing name is discoverable and the actual saved command selects it correctly. The worker's blanket “No packet defect found” must be qualified by P1. STRENGTH: entailed.

## Tickets to file

Two pre-existing candidates for the orchestrator; no board or tracker was changed. A read-only search of the supplied board found no matching transport-ambiguous/SIMULATED_AMBIGUOUS_COMMIT or s14-ui.test.ts entry. Absence from other trackers is undetermined.

1. File/line: tests/integration/s8-publication-database.test.ts:1706; apps/api/src/publications.ts:246. Input → wrong outcome: an incomplete Answer fixture fails during projection, before testing ambiguous commit and corpus-key preservation. Required fix: align the fixture with the current Answer contract and restore its intended failure and key-readback control. STRENGTH: entailed by source and repeated saved failure. Nonblocking for this lane.
2. File/line: tests/unit/s14-ui.test.ts:19, :131, :137, :208, :209, :239, :241. Input → wrong outcome: removed web imports and stale/untyped test assumptions produce the same 8 compiler diagnostics at base/head. Required fix: align the test with current UI modules/event shapes and restore a green typecheck. STRENGTH: entailed by the three diagnostic pairs. Nonblocking for this lane.

W1, W2 and P1 are review/process corrections, not extra product-vulnerability tickets.

## Landing

**Mergeable into dev 116db3455d5c0aad985c7212e348d8c04a554ad7.** The current dev ref was verified at that commit; its merge base with the lane is dev itself. A fresh git merge-tree --write-tree 116db345 ac2ccbb9 ran with GIT_OBJECT_DIRECTORY in a disposable /private/tmp directory and the repository object store used only as an alternate. Exit 0, no conflicts, resulting tree:

    d775d4e4dd3c151892786e6448f6d53220bd0d57

This equals the existing head tree. The temporary directory was removed. No repository object, ref, index, branch or source was mutated, and the worktree remained clean. STRENGTH: entailed. No merge was performed.

Risk assessment: moderate impact if wrong (bounded development diagnostics/internal erasure records), low regression likelihood (unchanged operations and preserved promise identity), partial protection (saved exact-head coverage with baseline reds and limits below), easy recovery (isolated revert without data-format/migration work), moderate overall confidence. Leaving the patch out retains unbounded rejected-value diagnostics, undifferentiated reconciliation exceptions and latent unattended promises; reverting restores those defects. STRENGTH: consistent-with. Approval applies to this exact base/head, not an unspecified future dev tip or automatic deployment.

## Not verified

- No fresh reviewer tests, full suite, installation, push or actual merge. Test results are saved exact-head artifacts; fresh checks were source/data inspection, official stamp comparison and isolated merge-tree.
- No separately captured CLI stderr with a synthetic unconfigured override. Source bounds the constructed error; unit/t16 evidence supports the rejection path.
- No dynamic after-join, multiple-rejection or indefinitely pending-sibling probe. Those cases were traced statically. The unit probe executes a source slice with stubs, not a database-backed rejection.
- No behavioral RED capture for the corrected control's downstream assertions; F stops at their prerequisite.
- No execution on package.json's declared Node 22.23.1; saved records use Node v25.7.0.
- No demonstrated production consumer of the new diagnostics; arrays are currently discarded and the reader has no production caller.
- No separately filed gate found for the worker report's “architecture/dev-deployment-register.test.ts: 2 passed” assertion. The unchanged source contract was checked statically; that test was outside the mandatory gate list.
- No claim about the 68 excluded registration rows, lint/source audits or a green repository-wide compiler.

STRENGTH: entailed for these evidence limits.

REVIEW: approve — the three fixes preserve their required behavior and merge cleanly into the stated dev base, with the known s8 failure and nonblocking scope/evidence corrections explicitly accounted for.
