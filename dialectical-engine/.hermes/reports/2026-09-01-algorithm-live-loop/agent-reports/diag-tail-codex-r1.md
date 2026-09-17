CODEX REVIEW DIAG-TAIL r1 — APPROVE · comments read through: diag-tail-r1-2026-09-07
commit=a440ec6fad48bc8e8774358e58c5b34fb10d9644 tree=58978e03894891a67c68e188bf016064a00e6943
Counts: 0 blocking lane findings; 3 ticket outcomes cleared; 2 nonblocking observations (N1/N2); 2 packet charges (A1/A2); baseline responsibility A3 cleared.

Reviewed the complete reviewer packet first, the worker packet and identical dispatch, both worker reports, current ticket comments, the complete base-to-tip diff and correction commit, production callers, and the saved records. Paths below are relative to the lane's `dialectical-engine/`, except `agent-reports/`, `packets/`, `board/`, and `logs/`, which are relative to the mission directory named in the packet. STRENGTH: entailed by the inspection.

## Verdict and ticket outcomes

**F-DEV-TLS-DOUBLE-WRAP — CLEAR.** Independent sweep of `deploy/dev-auth/*.mjs` finds 15 constructions, all in `deploy/dev-auth/tls-front-door.mjs`, at lines 70, 81, 86, 118, 123, 136, 186, 250, 272, 281, 284, 288, 297, 304, and 318. Only 272 and 297 supply a cause; both now pass the caught value directly. The unchanged constructor body at 42–44 supplies the single Error-options wrapper, consistent with `tls-front-door.d.mts:40`. The other 13 constructions have no cause argument. No remaining construction supplies an options object in place of the raw cause. This establishes the rule at every present construction site, not a guarantee about arbitrary future callers or non-Error rejection values. STRENGTH: entailed.

The new tests execute the actual `startAttestedDevTlsFrontDoor` implementation: an injected start rejection reaches the catch at 294–297, and an injected close rejection reaches `cleanupFrontDoor` at 268–272 through the readiness catch at 319–321. Assertions at `tests/unit/dev-auth-stack.test.ts:447` and `:474` establish cause identity; the following assertions establish the joined inner codes. These are production throw-site tests, not merely hand-built Error-chain tests. The previous chain assertion, at base lines 103–107 and tip lines 109–113, remains intact and passed. STRENGTH: entailed.

The real supervisor wiring is `apps/runner/src/dev-auth-stack.ts:475` → `startAttestedDevTlsFrontDoor`; `:378` uses `fixedStage`, whose catch at `:323` wraps the TLS rejection once more. The CLI at `dev-auth-stack-cli.ts:49–53` passes that stage error to the read-once joiner at `dev-auth-stack.ts:296–316`. For a coded inner Error and successful supervisor cleanup, the stage/TLS/inner chain occupies three of the four permitted links, so its inner known code is reachable. STRENGTH: entailed by static composition and the executed throw-site tests. The test's certificate-coded Error is injected; it is not evidence of a live certificate failure through the default socket/file operations. In particular, `createDevTlsReadinessOperations` calls `startDevTlsFrontDoor`, not the certificate generator. STRENGTH: undetermined for that live occurrence.

**F-DIAG-DEV-API-CLI — CLEAR.** Independent source sweep of `apps/`, `packages/`, and `deploy/` finds the following producer vocabulary, exactly matching the exported set at `apps/runner/src/dev-api-environment.ts:460–474` and the independently written test list. All entries below are thrown as TypeErrors in that source file. STRENGTH: entailed.

| Code suffix after DEV_API_ENVIRONMENT_ | First throw |
|---|---:|
| OWNER_UNVERIFIED | 75 |
| CUSTODY_ROOT_INVALID | 91 |
| CREDENTIAL_CUSTODY_INVALID | 101 |
| SECRET_CUSTODY_INVALID | 124 |
| CREDENTIAL_FILE_INVALID | 142 |
| DATABASE_CREDENTIAL_INVALID | 174 |
| HATCHET_TOKEN_INVALID | 196 |
| DEFINITION_INVALID | 223 |
| CONCURRENT_LOCKED | 250 |
| DRIFT | 257 |
| PUBLISH_FAILED | 288 |
| CREDENTIAL_REQUIRED | 344 |
| HISTORICAL_REGISTER_SOURCE_INVALID | 408 |

The provider-panel loader's own codes at `dev-provider-panel.ts:77,82,89,129` have the other DEV_CLI_PROVIDER_PANEL prefix. `packages/register/src/runtime-environment.ts:36–57` parses the development command environment without any DEV_API_ENVIRONMENT producer. The worker's reference to KEK_UNRESOLVED as being on this particular path is imprecise: the `kekPath` preprocessor exists in the same module but is not used by this loader. This does not change the enumerated set or the fallback conclusion. STRENGTH: entailed.

The classifier at `dev-api-environment.ts:488–494` preserves the TypeError condition, snapshots `message` once, and returns that snapshot only after exact membership; otherwise it returns the fixed fallback. The CLI at `dev-api-environment-cli.ts:14–21` preserves the success template, one `console.error(code)`, and exit code 1. Each of the 13 ordinary producer TypeErrors therefore yields the same string and newline as before. This is established by the source diff and passing classifier cases, not a captured subprocess byte comparison. STRENGTH: entailed for the present code and those inputs.

Commit `308f1f0378fc65f8c3863dde9f9156a0b924908b` is a legitimate test repair. It changes only the synthetic string, matching exclusion tokens, and explanatory comment; exact fallback and known-code assertions remain. The old PW_42 string fails the removed [A-Z_] grammar; the replacement PASSWORD_LEAKED string satisfies it. The historical `r1-mutant-c-cli-shape-rule-restored.log` records exit 0 at `e21245b9`; the final `r3-mutant-d-cli-shape-rule-restored.log` records exit 1 at assertion 70. The repair makes the test discriminate the rejected rule. STRENGTH: entailed.

**F-AUTH-RISK-RETENTION-LOOP — CLEAR.** `packages/db/src/auth-risk.ts:108` uses exactly the removed predicate, `!Number.isInteger(retentionMs)||retentionMs<1`, once before the loop. Numeric strictness is unchanged; this deliberately does not introduce a safe-integer or upper-bound restriction. Empty inputs now reject invalid retention as policy-shape. The public poisoned TypeError message remains unchanged. The per-signal lifetime comparison remains at `:126` under signal-shape, and the mismatch control at `tests/unit/p2-auth-risk.test.ts:442–453` passes. Earlier maxSignals, saturation, and evaluatedAt checks retain their order. STRENGTH: entailed by the diff and executed cases.

## Nonblocking observations

**N1 — P3: the TLS control's name and explanation claim a branch it does not execute.**

File/line: `tests/unit/dev-auth-stack.test.ts:479–490`; `agent-reports/diag-tail.md:199`.

Input → wrong outcome: the control supplies a successful start operation and null public probes. It obtains a newly created readiness-timeout error at `tls-front-door.mjs:318`, never a startFrontDoor rejection passed through the ternary at 295–297. Its green result is consequently described incorrectly as a pass-through control. The adjacent claim that removing constructor wrapping would satisfy the two preceding rows is also contradicted by their cause-identity assertions and mutant C.

Required fix: in a follow-up, describe this row as the no-cause readiness-timeout control it actually is, or add a genuine start-rejection identity control if pass-through coverage is intended; correct the explanatory comment and report wording. No present production failure follows: the unchanged pass-through branch is directly inspectable, and the two changed wrapping sites have effective tests. STRENGTH: entailed for the mismatch; nonblocking severity is reviewer judgment.

**N2 — P3: aggregate evidence counts in the worker filing are inaccurate.**

File/line: `agent-reports/diag-tail.md:303–304`, `:366–369`.

Input → wrong outcome: the final filing calls 14 of 17 gate records green and reports 1,163 test cases. Reading the r3 records gives 13 exit-0 gates and 4 exit-1 gates: three baseline-identical typechecks and the wider sweep. The 14 distinct test files contain 1,106 cases (1,105 pass, one fails), or 1,206 executions when the two additional repetitions of the three unit files are counted. The individual gate table is substantially more accurate than the aggregate prose.

Required fix: correct the filing totals from the saved records, distinguishing distinct cases, repeated executions, and accepted known-red checks. No rerun is needed to correct arithmetic. STRENGTH: entailed by the record summaries and their sum; nonblocking severity is reviewer judgment.

## Records, mutants, and compiler identity

The following are saved final-tip gate results, checked against their command, exit, runner identity, and empty pre/post porcelain fields. All runtime gates record vitest@4.1.10, entry SHA-256 `39db22f579acf5639bbb17a261408debbde03f4692c0c439e77e7f13aeba74d6`. STRENGTH: entailed.

| Records under logs/diag-tail/ | Result |
|---|---|
| r3-gate-dev-auth-stack-run1/2/3.log | exit 0 each; 25/25 each |
| r3-gate-dev-api-cli-run1/2/3.log | exit 0 each; 7/7 each |
| r3-gate-p2-auth-risk-run1/2/3.log | exit 0 each; 18/18 each |
| r3-gate-int-tls-front-door.log | exit 0; 3/3 |
| r3-gate-int-dev-api-environment.log | exit 0; 9/9 |
| r3-gate-int-tls-readiness.log | exit 0; 5/5 |
| r3-gate-extra-session-database.log | exit 0; 11/11 |
| r3-gate-extra-wider-sweep.log | exit 1; 1,027/1,028 |
| r3-typecheck-run1/2/3.log | exit 1 each; eight diagnostics each |

The wider failure is the ENOENT for `web/package.json` at `tools/orphan-audit/src/index.ts:52`, reported from `tests/unit/s1-1-depth-contract.test.ts:2146`. Both base and tip track only `web/next.config.mjs` under web; the audit, test, and web paths have no base-to-tip diff. The lane does not introduce the missing tracked manifest. I did not run that test at the base or establish other lanes' ignored filesystem contents. STRENGTH: entailed for tracked-tree identity and the saved failure; undetermined for those unmeasured environments.

The three `baseline/00-typecheck-base-run{1,2,3}.log` records stamp base `7ab208f22af6af1c7535a2dcd111e9af7e56c7de`, tree `04b40920737700d8119597b2f131d77e76306261`. All six base/tip typecheck records name `pnpm exec tsc --noEmit -p tsconfig.json` and identify typescript@7.0.2, version 7.0.2, the same resolved compiler entry, and entry SHA-256 `2219f428a7e55aaf1f7ad85b9b0f0cf5078aeb76ccc9a7c6036c92d48f492ffd`. All six OUTPUT spans are byte-identical, SHA-256 `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. Node, lockfile hash, and generated-contract manifest also agree. STRENGTH: entailed.

The package-manager version differs: baseline pnpm 11.20.0, tip pnpm 10.33.0. Thus this is matching recorded compiler identity and compiler output, not identical full provisioning. Entry hashes do not attest every installed dependency byte. The existing in-test compiler probe imports `typescript-classic` at `tests/unit/p2-auth-risk.test.ts:5`, declared as npm:typescript@5.9.3 at `package.json:82`; it is separate from the tsc gate and ran in the unit suite. STRENGTH: entailed.

All nine final mutant transcripts have one complete v3 run, pre=0, applied=MUT_EXPECT, restored=0, empty final porcelain, matching before/after hashes, and RESULT: ok. I also compared every recorded target hash to the current committed target bytes. Applied multiplicity is 1 for A–H and 3 for I. STRENGTH: entailed for saved custody and current target identity; historical execution is evidenced by the saved transcripts, not independently replayed.

| r3-mutant record stem | Command exit | Discriminating assertion |
|---|---:|---|
| a-tls-start-double-wrap-restored | 1 | dev-auth-stack.test.ts:447, cause identity |
| b-tls-cleanup-double-wrap-restored | 1 | dev-auth-stack.test.ts:474, cause identity |
| c-constructor-stops-wrapping | 1 | both 447 and 474 |
| d-cli-shape-rule-restored | 1 | dev-api-environment-cli.test.ts:70 |
| e-retention-back-in-loop | 1 | p2-auth-risk.test.ts:423 and 437 |
| f-cli-second-read-emitted | 1 | dev-api-environment-cli.test.ts:115 |
| g-cli-vocabulary-narrowed | 1 | dev-api-environment-cli.test.ts:58, 63, 116 |
| h-cli-keeps-its-own-shape-rule | 1 | dev-api-environment-cli.test.ts:127 |
| i-neighbour-consistent-rename-survives | 0 | all seven classifier tests pass |

Mutant E implements the old empty/nonempty rejection behavior with a signals.length guard; it does not literally move the predicate into the loop. That is sufficient to discriminate the ticket's two behavioral defects. A/B and C fail at the cause-identity assertion before the subsequent join assertion executes; their kills should be attributed accordingly. The current green runs do execute the join assertions. STRENGTH: entailed.

RED records 10/11/12 stamp tests-only commit `0d04bdd4d5851fa395ad3594dc9c423bba563611`: TLS 2 failed/23 passed; CLI seven failed because the API/set/wiring did not yet exist; retention 2 failed/16 passed. The CLI RED was not by itself a behavioral witness for the shape rule; the corrected mutant supplies that witness. Superseded r1/r2 records were not counted as final-tip evidence. STRENGTH: entailed.

I reran the official stamp-check on the final r3 prefix, exit 0:

```
records compared: 26 · failures: 0
OK: every record stamps the filed tip
```

This is an identity/completeness check, not by itself proof of execution. I also ran the permitted three unit files together once through gate-run.sh: 50/50, exit 0, clean before and after. The complete reviewer gate record is embedded in the self-report; temporary output was removed. STRENGTH: entailed.

## Packet audit

**Contract reach — CLEAR now; historical omission acknowledged.** All eight changed paths fall within the worker packet's allowed list; the traps change is append-only. The board's CLI scope correction at `board/F-DIAG-DEV-API-CLI.md:26` moves the readonly role-reference site to the existing `F-DEV-REGISTER-ROLE-REF-OVERRIDE` ticket. That resolves the worker filing's earlier concern for this landing; it does not mean the role-reference issue itself is fixed. The packet grants both TLS throws and the new unit file. STRENGTH: entailed.

**Records block — CLEAR.** The binding section beginning “## Records and gates (binding)” is byte-identical to `packets/WORKER-RECORDS-BLOCK.md`; the worker dispatch is byte-identical to the worker packet. It names the emitters/tools, final-tip ordering, runtime/signature mutation distinction, final-prefix stamp scope, and baseline ownership. Its routing is sufficient for these changes. STRENGTH: entailed.

**A1 — CHARGE, nonblocking: base facts and commit inventory drift.**

File/line: `packets/diag-tail-worker.md:13,15`; `packets/diag-tail-codex-r1.md:5`.

Input → wrong outcome: the cleanup throw is cited at base 262 rather than 263; the retention predicate is cited at 113–114 rather than 117; maxSignals is cited at 84 rather than 95. The reviewer packet says three commits, omitting the tests-only RED commit. The true base-to-tip inventory has four commits: 0d04bdd4, e21245b9, 308f1f03, a440ec6f. The constructor, start throw, CLI shape-rule lines, and old chain assertion otherwise identify the right base code.

Required fix: regenerate numbered base references and derive the complete commit inventory from the stated revisions when assembling packets. These errors did not make the granted work unreachable. STRENGTH: entailed.

**A2 — CHARGE, nonblocking: the provisioning completion marker is not terminal.**

File/line: `packets/diag-tail-worker.md:5,35`; `logs/diag-tail/01-provision.log:10–16`; `agent-reports/diag-tail.md:289–290`.

Input → wrong outcome: the packet requires the log to END with the base-bound PROVISIONED OK marker, otherwise BLOCKED; the filing claims that condition holds. The marker is actually at line 10, followed by the orchestrator's baseline appendix, and the last line is “porcelain after baseline: 0”. A literal preflight would block a provisioned lane.

Required fix: the orchestrator should keep the provisioning artifact sealed and put baseline notes separately, or specify a framed completion rule that admits that appendix; correct the worker filing's “ends” claim. Do not rewrite historical execution results or repeat adequate gates solely for this formatting defect. The successful install/generation exits, base-bound marker, baseline records, and clean-state evidence establish the substantive handoff despite the exact-rule violation. STRENGTH: entailed for the violation and evidence; treating it as nonblocking for this review is reviewer judgment.

**A3 baseline responsibility — CLEAR.** The packet names the orchestrator-owned baseline directory and prohibits worker detachment/reprovisioning. The three actual records exist at the untouched base, and `01-provision.log:11` explicitly labels them orchestrator/A3. They were measured in the provisioned lane path before the worker commits, rather than in a separately named base worktree as the shared block's parenthesis suggests. The provided-record route resolves the prior missing-owner/missing-handoff defect; the records do not independently establish who operated the shell. STRENGTH: entailed for routing, chronology, and artifact identities; operator attribution is consistent-with the supplied custody record.

The worker's SKILLS LOADED line does not list receiving-code-review, although the packet names it in the floor. I cannot verify an unrecorded skill invocation from the filing. This is a disclosure limit, not evidence of a code defect. STRENGTH: entailed for the omission; undetermined for actual invocation.

## Tickets to file

No new product ticket is required by this review. Keep the existing `F-DEV-REGISTER-ROLE-REF-OVERRIDE` queued for the split site; do not duplicate it. Route N1/N2 as small test-description/filing follow-ups and A1/A2 to packet/provisioning tooling ownership. The wider web-manifest failure is an existing provisioning/tree limitation, not a new regression established by this lane. No board or DECISIONS edits were made. STRENGTH: entailed for existing artifacts and unchanged scope; routing is reviewer judgment.

## Landing

Mergeable into the requested dev `7ab208f22af6af1c7535a2dcd111e9af7e56c7de`; the dev ref still resolved to that commit at review. The lane is a descendant of that base and has four commits, eight changed files, 424 insertions, and seven deletions. An isolated `git merge-tree --write-tree <base> <tip>` returned exit 0 without conflicts and tree:

```
58978e03894891a67c68e188bf016064a00e6943
```

This equals the tip tree. Git wrote its temporary object only into a temporary object directory, with the repository object store used as a read-only alternate; that directory was removed. No merge, checkout, index/ref mutation, install, or push was performed, and the source worktree remained clean. Approval applies to these revisions, not a later dev tip. STRENGTH: entailed by the isolated result and revision/status reads.

## Not verified

- No live TLS socket/certificate failure or whole-stack startup was induced. The changed throw paths ran with injected operations; complete supervisor/CLI reach was traced statically.
- No CLI subprocess byte-capture matrix was run; known-code compatibility follows from the unchanged output calls and executed classifier cases.
- No integration, full-suite, mutant, or typecheck rerun was performed by this reviewer. Those conclusions rely on the saved records; only the three permitted unit files ran once.
- No claim is made that all ignored dependencies or all environments are identical, that the typecheck is green, or that a known code beyond the joiner's four-link limit will print.
- N1's claimed start-error pass-through control is not established by that row. The relevant unchanged production branch was inspected.
- The split role-reference ticket and missing web manifest are outside the fixes approved here.

STRENGTH: undetermined for the unexecuted behavior above; the scope limits themselves are entailed by this review's actions.

REVIEW: approve — the three scoped fixes satisfy their outcomes and merge cleanly, with nonblocking test-description, filing, and packet charges preserved above.
