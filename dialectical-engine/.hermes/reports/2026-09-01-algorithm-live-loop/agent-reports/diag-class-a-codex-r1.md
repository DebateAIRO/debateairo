CODEX REVIEW DIAG-CLASS-A r1 — CHANGES · comments read through: diag-class-a-r1-2026-09-07

Counts: **4 required changes: 3 implementation findings and 1 evidence/reporting finding.** Packet audit: **3 charges**, with provisioning and the measured historical count cleared. Three separate product follow-ups are identified below; the TLS follow-up already has a ticket. No source changes or merge performed.

Reviewed immutable range `1fc2dece2775ca77c56a57fd93e1d656a019c24b..e86c850e9a7481324ada5c5468fd07569997ea13`, branch `lane/diag-class-a`: one commit, seven modified files, 520 insertions and 7 deletions. Exact `git diff --no-ext-diff --binary <base> <head>` SHA-256: `ec987db8dc9137799f3da47b7e1914eef93838c33eb30a2dd4ddffa83ab5e0a1`. HEAD and dev match the packet; the lane is clean. STRENGTH: **entailed by fresh Git reads**.

Source paths below are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a/dialectical-engine`. Packet, report, board, and log paths are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## Findings

**F1 — The S04 reason alphabet is not closed at runtime. Required change.**

**File/line:** `packages/judgement/src/s04.ts:263`; class declaration at `:307`, constructor at `:308`, catch at `:285`.

**Input → wrong outcome:** a caller-supplied judge rejects with a `PanelMemberFailure` subclass carrying a runtime `failureKind` outside the declared union → the helper returns that value verbatim as `reason`. `instanceof` establishes ancestry, not membership in `PANEL_MEMBER_FAILURE_KINDS`. The constructor has no runtime validation, and TypeScript's `readonly`/union annotations do not constrain the received object's runtime contents. The new branch therefore retains an unchecked output route despite removing `.message`. The existing tests exercise four ordinary valid kinds, not this boundary.

**Required fix:** in the reason helper, read the kind once and project it through a closed runtime mapping or membership check with the fixed fallback on a miss. Return only the validated value or a canonical literal. Preserve the existing note shape, failure-kind list, and `failureKind:` expression as this packet requires. Add regression coverage for an out-of-domain runtime kind and retain valid-kind controls. Correct the source/report claim that the property is already sealed at runtime.

**STRENGTH:** **entailed statically** for the helper's contract failure. This is not a claim of an observed production disclosure. The production `assess()` implementation currently constructs four valid kinds at `packages/judgement/src/index.ts:499,505,510,513,514`; the broader supported judge callback is the relevant boundary. `apps/runner/src/index.ts:2699` copies the reason into the persisted panel payload. The unchanged `failureKind` field has its own legacy unchecked path (`s04.ts:290`, runner `:2650,:2698`); a reason-only repair must not be described as sanitizing every note field.

**F2 — Four existing TLS probe codes are missing from the DEV alphabet. Required change.**

**File/line:** `apps/runner/src/dev-auth-stack.ts:269,:273` (TLS probe entries), `:293` (membership decision). Producers: `deploy/dev-auth/tls-front-door.mjs:61,:72,:327,:336`.

**Input → wrong outcome:** an ordinary private/public UI probe exceeds its response bound or times out → `probeEndpoint` constructs a fixed, legitimate diagnostic using one of two fixed prefixes and one of two fixed suffixes. None of these four codes is admitted:

- `DEV_TLS_PRIVATE_PROBE_FAILED_BODY_TOO_LARGE`
- `DEV_TLS_PRIVATE_PROBE_FAILED_TIMEOUT`
- `DEV_TLS_PUBLIC_PROBE_FAILED_BODY_TOO_LARGE`
- `DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT`

The original formatter retained these codes; the patch replaces them with `DEV_UNRECOGNIZED`. This is a diagnostic regression, not a redaction of an unclassified message. The source path is `createDevTlsReadinessOperations` → `probeUi` → `probeEndpoint` → `startAttestedDevTlsFrontDoor` → the stack's `startTls` stage (`dev-auth-stack.ts:456` and `fixedStage` at `:300`). Typed probe errors are retained by `tls-front-door.mjs:75`; the private probe is awaited at `:277`, and public probe failures are rethrown at `:312` after successful cleanup.

**Required fix:** admit these four source-derived codes, cite the prefix and suffix producers, and add controls that retain their distinctions. Extend the producer audit to expand bounded template constructions, including suffix constructions whose source line contains no `DEV_` token. Keep the current public producer spellings. A literal-only sweep is insufficient.

**STRENGTH:** **entailed statically** for production reachability and changed classification; no live TLS failure was induced. Independent enumeration found 148 admitted literal/template-exit codes with no invented entries, but **152** codes after including these four bounded TLS constructions.

**F3 — The DEV guard validates one property read and emits another. Required change.**

**File/line:** `apps/runner/src/dev-auth-stack.ts:293`.

**Input → wrong outcome:** an `Error` in the cause chain exposes a message accessor whose value changes between reads → the allow-list checks one value, then `codes.push(current.message)` obtains an unchecked value for output. Consequently, even a complete set does not establish the claimed closed alphabet for this `unknown` input boundary. No concurrent thread is needed for repeated accessor reads to differ. An ordinary Error with a stable known message remains the legitimate control.

**Required fix:** snapshot the message once per link, validate that snapshot, and emit that same validated string or a value obtained from a canonical map. Use the snapshot for the unknown-code decision too. Add a regression assertion covering unstable property reads. Preserve cause traversal, depth, and join order.

**STRENGTH:** **entailed statically** under the formatter's unrestricted Error input contract. Current in-repository constructors normally create stable data properties; I found no evidence that a live driver presently supplies this accessor shape. This finding concerns the promised formatter invariant, not a demonstrated external attack path.

**F4 — The wider-suite evidence is useful, but the report overstates its identity and counts. Required reporting change.**

**File/line:** `agent-reports/diag-class-a.md:98,:109,:111`; corresponding chronology claim in `agent-reports/diag-class-a-self.md`.

**Input → wrong outcome:** the saved wider run says `17 failed | 2314 passed (2331)`, with one collection failure → the report calls 2331 the passed count, labels the pre-commit run as a tip run, and presents matching failed names as conclusive causal attribution. These supplemental artifacts are absent from the canonical lane log directory and have no commit/exit stamps. They cannot inherit the custody of the eleven properly stamped delivery records.

**Required fix:** report **17 failed, 2314 passed, 2331 total; 10 failed files of 124, including one collection-failed suite**. Identify this as a pre-commit run of the final six-file source/test diff, with the separate untouched-base comparison. Preserve and reference the actual artifacts with their identities; do not retroactively claim they were captured at HEAD. State the narrower demonstrated result: identical observed failing names, with baseline/source evidence for the additional corpus-count failure. The neighboring 56/56 run likewise predates the commit.

**STRENGTH:** **entailed by saved artifacts and Git object comparison** for the corrections; the broad claim that no regression could be hidden inside an already failing test is not established. Detailed attribution follows.

## Formatter and producer checks

| Formatter / challenge | Result | STRENGTH |
|---|---|---|
| S04, ordinary Error or non-Error thrown value | Fixed `UNCLASSIFIED_MEMBER_ERROR`; no message/stringification enters reason. | Entailed from `s04.ts:264` and saved tests. |
| S04, valid typed kind | Retained as reason; kind field and note shape unchanged. | Entailed for valid stable kinds; F1 limits universal closure. |
| S04, typed provider code | Two-entry Map returns canonical values; unknown codes fall back. A code property is captured once. | Entailed from `s04.ts:265`; only one provider code has a new explicit positive test. |
| tokenUnlock, non-contract Error or non-Error | Exactly `Token check failed before any verdict arrived. The token was not rejected.` | Entailed statically and by saved gate assertions. |
| DEV, stable unknown code-shaped message | Fixed `DEV_UNRECOGNIZED` retains its position. No-code chains retain `DEV_AUTH_STACK_FAILED`. | Entailed for stable messages; F3 limits universal closure. |
| DEV, chain deeper than four | Only the first four Error objects are visited; skipped non-code Error links still consume depth. Cycles remain bounded by four iterations. | Entailed from unchanged loop and saved depth control. |
| DEV, non-Error root / non-Error cause | Root returns historical fallback; a non-Error cause stops traversal. | Entailed from unchanged `instanceof Error` guard. |
| DEV, trailing whitespace | Space, tab, LF, and CRLF variants miss the set and the unchanged regex; the link is dropped, or the whole no-code chain gets the historical fallback. No trimming occurs. | Entailed from source; regex behavior independently checked with Node built-ins. |

S04's intended MEMBER_FAILED alphabet has **10** values: seven kinds, two provider codes, one fallback. The existing self-grading note adds `FX-HR-H6`, giving **11** intended reasons across both note kinds. F1 prevents claiming that this is the actual runtime alphabet. The two provider subclasses are real (`packages/providers/src/index.ts:52,:68`); `assess()` converts them before this catch today. Their direct arrival is supported by the callback API, not demonstrated in the present runner wiring. STRENGTH: **entailed** for producers/conversion; **consistent-with** for alternative caller wiring.

The independent DEV sweep used **base source**, avoiding the new allow-list's own literals: 180 quoted occurrences / 114 distinct codes in `apps/runner/src/dev-*.ts`; 101 distinct outside `dev-auth-stack.ts`. Add three bounded component-exit codes (`API`, `UI`, `RUNNER`) and 31 quoted codes across `deploy/dev-auth/*.mjs`: the resulting 148-element set exactly equals the committed set in both directions. Then inspect template-producing paths separately: F2 adds four missing codes. The 31 are across four MJS files, not all from `tls-front-door.mjs` as the self-report's near-miss paragraph implies. STRENGTH: **entailed by independent source enumeration**.

Six producer spot-checks, all outside the admitted set's declaration:

| Admitted code | Producer |
|---|---|
| `DEV_API_ENVIRONMENT_DRIFT` | `apps/runner/src/dev-api-environment.ts:257`, TypeError literal. |
| `DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE` | `apps/runner/src/dev-auth-data-plane.ts:341`, DevelopmentAuthDataPlaneError. |
| `DEV_HATCHET_TOKEN_SERVICE_UNAVAILABLE` | `apps/runner/src/dev-hatchet-token.ts:380,:383`, failureCode and direct throw. |
| `DEV_TLS_PUBLIC_READINESS_INVALID` | `deploy/dev-auth/tls-front-door.mjs:295`, DevTlsFrontDoorError. |
| `DEV_MAIL_CAPTURE_MESSAGE_TOO_LARGE` | `deploy/dev-auth/sendmail-capture.mjs:61`, CaptureError. |
| `DEV_POSTGRES_HEALTHCHECK_REQUIRED` | `deploy/dev-auth/validate-compose-postgres.mjs:28`, Error literal. |

STRENGTH: **entailed** for all six. The wider development vocabulary deliberately includes codes whose current route is another development CLI; that alone is not an invented producer.

**Stored versus derived:** `02-sweep-dev-codes.log` is a separate, useful base producer artifact; `20-producer-audit.log` adds an exact-tip audit. Neither is a complete semantic derivation: their literal counts omit F2. Section 3d of the latter contains result sets without the generating procedure, so its claim of immunity to reading the new set back into the producer set is not independently reproducible from that section alone. I independently checked against base blobs instead. The test's local list is a stored drift snapshot, not a proof of exhaustive production coverage. STRENGTH: **entailed** for these limits.

**Forbidden changes:** all seven modified files are granted; TOOLING-TRAPS is append-only. Note kind, failure-kind expression/list, and return shape are unchanged. The exact byte suffix of `tokenUnlock.ts` beginning at `if (error.serverCode ===` through the wrapper is identical between base and tip (SHA-256 `fbe07cde03114cf4e15ff51156f831344c6cb7ef7f594632b7e07cbe54666e69`). Thus all pre-existing classified text/status behavior is preserved, beyond the eleven representative inputs in the new control. F2 is the public diagnostic compatibility exception. STRENGTH: **entailed by byte comparison**.

## Gates, mutants, and custody

Saved exact-tip gates `10`–`12` each show three runs: **17/17**, **19/19**, **59/59**, every exit 0. Gate `13` shows three exits 1, each with the same eight inherited `s14-ui` diagnostics as baseline `03`. I independently extracted and compared all three runs, not only the first: each diagnostic stream hashes to `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. This clears the required identity gate; it does not make typecheck green. STRENGTH: **entailed by saved records**. I did not rerun project tests.

The preserved RED logs show S04 4 failed / 17 total, tokenUnlock 2 failed / 59, and DEV 2 failed / 19, each exit 1. Their failure locations are the intended bounded-output assertions. The token classified-message control was already green in RED. S04 has five new test cases, not six as the worker's fix summary states. STRENGTH: **entailed by diff and logs**.

| Mutant / transcript | Observed discriminator | Verdict |
|---|---|---|
| A / `14-mutant-a-s04-passthrough-restored.log` | One failed, 16 skipped; `judgement-s04.test.ts:297` rejects the raw reason outside the expected alphabet; command exit 1. | Intended KILL. |
| B / `15-mutant-b-tokenunlock-passthrough-restored.log` | One failed, 58 skipped; `v2ui-data-layer.test.ts:958` detects synthetic content in the sentence; exit 1. | Intended KILL. |
| C / `16-mutant-c-devauth-shape-rule-restored.log` | One failed, 18 skipped; `dev-auth-stack.test.ts:124` detects synthetic content in the joined code; exit 1. | Intended KILL. |
| D / `17-mutant-d-s04-neighbour-rename-survives.log` | Helper renamed at two anchors; 17/17, exit 0. | Intended SURVIVE. |
| E / `18-mutant-e-devauth-neighbour-rename-survives.log` | Set renamed at two anchors; 19/19, exit 0. | Intended SURVIVE. |
| F / `19-mutant-f-tokenunlock-neighbour-rename-survives.log` | Wrapper parameter consistently renamed in one multiline anchor; 59/59, exit 0. | Intended SURVIVE. |

Each transcript binds head `e86c850e…` and tree `40265eb9…`, contains OLD/NEW text and a project-local runner command, has pre=0, expected application counts `1,1,1,2,2,1`, restored=0, equal before/after hashes, empty porcelain, and `RESULT: ok`. I compared those hashes and anchor counts against the current source: all match. **Custody complete for A–F; the kills do not test F1–F3.** STRENGTH: **entailed by transcript/source comparison**.

I reran the read-only mission stamp comparator: **17 records, 6 failures, exit 1**, exactly the filed result. The six deliberate base captures are `01-provision.log`, `02-sweep-dev-codes.log`, `03-typecheck-baseline.log`, `04-red-s04.log`, `05-red-tokenunlock.log`, `06-red-devauth.log`. The eleven delivery records `10`–`20` stamp the tip. The supplemental `/private/tmp` suite logs are outside that comparator's population. STRENGTH: **entailed**.

## Wider-suite attribution

The missing supplemental evidence remains readable at `/private/tmp`. `full-unit.log` started **17:40:42**; `base-failing.log` started **17:45:51**; `neighbours.log` started **17:40:18**. The commit was created at **17:49:38**, all on 2026-09-07 CEST. The neighboring run records 3 files / 56 passed. Its raw log does not record a shell exit status. STRENGTH: **entailed from artifact timestamps and commit metadata**.

`mine-names.txt` and `base-names.txt` are byte-identical (SHA-256 `81d0fb09f5da90c6d5a6f674ecbab83b38bc71c975b5f225943e8522f351f0d7`). Independently extracting the raw FAIL entries confirms **17 identical test names plus the same `s14-ui` collection failure**. The selected-base run has 17 failed / 1097 passed / 1114 total, 10 failed files. The full lane-source run has 17 failed / 2314 passed / 2331 total, 10 failed and 114 passed files. STRENGTH: **entailed by artifacts**.

The stash comparison is substantively sound for this limited observation. `pop.log` names stash object `c90df35a43f111dc2bddd7585f2fa30ff216eafc`, whose first parent is the requested base, whose saved index tree equals base, and whose untracked tree is empty. `/private/tmp/diag-class-a-wip.patch` equals `/private/tmp/after-pop.patch` byte-for-byte and equals the final six-file production/test diff, SHA-256 `331efdd008ee5d2a0e142b87684fa82ac62e68e69010c8c9854d131f3647d37f`. The remaining tip change is the TOOLING-TRAPS append. The raw logs do not themselves capture the claimed intermediate porcelain/helper-absence checks, so chronology is supported by the stash artifacts rather than fully stamped run records. STRENGTH: **entailed** for object/patch equality; **consistent-with** for the complete run environment.

**Not all 17 are in the cited dev known set.** Sixteen appear in `logs/dev-merge/03-names-dev.txt`. The exception is:

`tests/unit/s1-1-depth-contract.test.ts > S1-1 · the depth bound has a single source > parses every shipped file with no syntactic diagnostic`.

`10-attribution.txt` does not add it. Both lane/base logs show the same assertion at `s1-1-depth-contract.test.ts:377`: **233 scanned files versus 232 expected**, after the syntax-diagnostic assertion passes. Independent Git-tree enumeration using that test's roots/extensions/exclusions gives **232 at dev `70647e7e`, 233 at base `1fc2dece`, 233 at tip `e86c850e`**. The extra file is `apps/api/src/risk-signal-identity.ts`, added by `f6bd66cc`. This explains the additional failure without charging it to this lane. It needs baseline/oracle maintenance. The `s14-ui` import failure is a separate suite event, not an eighteenth failed test. STRENGTH: **entailed by source, logs, and tree comparison**.

## Packet audit

**P1 — CHARGE: a type declaration is presented as a runtime guarantee.** File/line: `packets/diag-class-a-worker.md:18`. Input → wrong outcome: an unknown thrown subclass reaches an instruction saying its failureKind is “already closed” → the implementer copies it unchecked, producing F1. Required fix: distinguish declared vocabulary from runtime validation and require projection at the catch boundary. STRENGTH: **entailed**. The reviewer packet's explicit subclass challenge was useful and is cleared.

**P2 — CHARGE: producer/caller reach exceeds the named read grant.** File/line: worker packet `:18,:27–29`. Input → wrong outcome: the mandatory producer/sink audit follows imports to `deploy/dev-auth/*.mjs`, `packages/providers/src/index.ts`, the contract client, and the UI sink → relevant files are outside its named read list while `all_others` is forbidden. Required fix: grant read access to the necessary producer and consumer paths, including bounded template builders, while retaining the narrow edit scope. STRENGTH: **entailed**. The worker's read-only investigation was necessary to fulfill the task; no unrelated source mutation occurred. This confirms its packet-reach finding.

**P3 — CHARGE: “last three” overstates the prior inventory.** File/line: worker packet title; `apps/runner/src/dev-api-environment-cli.ts:13–16`. Input → wrong outcome: treating the prior class list as exhaustive → a sibling CLI still uses a DEV-shaped TypeError message directly as `console.error` text. Required fix: describe these as the three selected remaining findings, and track the sibling formatter separately. STRENGTH: **entailed statically** for the remaining passthrough; **undetermined** for any real sensitive disclosure. This is not a demand to expand this lane's edits.

**CLEAR — provisioning and historical count.** `01-provision.log` records install exit 0, contract generation exit 0, empty porcelain, and the exact required final `PROVISIONED OK commit=1fc2dece…` line. The 76-site count is stale, but the packet explicitly labels it a prior and orders measurement; the independent result is 180 quoted occurrences / 114 distinct. No charge for obeying that measurement instruction. STRENGTH: **entailed**.

**CLEAR — token test reach; correct the wording.** The packet explicitly says to name another token owner and grants “every other test” read-only. `pol01-policy.test.ts:62–78` is therefore not an inaccessible discovery. Its classified-kind assertions needed no edit. The worker's claimed second-owner block is overstated. Also, tokenUnlock declares four total kinds, including UNCLASSIFIED, so there are three other kinds; some classified sentences interpolate status. The byte-preservation duty is clear and met despite the packet's “four classified branches”/“fixed text” imprecision. STRENGTH: **entailed**.

## Tickets to file

No board changes were made. Route F1 back to **F-DIAG-S04-PANEL-NOTE**, F2/F3 to **F-DIAG-DEV-AUTH-STACK**, and F4 to this lane's evidence rework. **F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED is technically clear** within its requested scope.

| Follow-up | Ticket disposition / required scope | STRENGTH |
|---|---|---|
| Worker out-of-contract finding: packet producer reach | **Yes, needs a tracked process correction.** Record P1/P2 together or link an existing packet-audit record; the existing TLS ticket references orchestrator self-charge #45, but that reference alone is not a corrected packet. | Entailed. |
| Worker out-of-contract finding: TLS double wrapping | **Yes; already filed as `board/F-DEV-TLS-DOUBLE-WRAP.md`. Do not duplicate.** Preserve it and include the same double-wrap at `tls-front-door.mjs:263` as well as `:288`; constructor `:33–34` wraps the supplied cause. A plain wrapper object stops the unchanged Error-only walk. The current ticket's narrow `:288` scope misses cleanup. | Entailed statically; no live TLS run. |
| Extra corpus-count failure absent from dev manifest | **File or link an oracle/baseline-maintenance follow-up**, with `s1-1-depth-contract.test.ts:377`, the 232→233 file identity, and the two base/lane failure records. Do not label this a new lane regression or merely a syntax failure. | Entailed. |
| Remaining CLI passthrough / P3 | **File a separate diagnostic ticket** for `apps/runner/src/dev-api-environment-cli.ts:13–16`; require a bounded emitted vocabulary. No matching specific ticket was found in the board search. | Entailed for source behavior; production disclosure undetermined. |

The two nonproducing declared S04 values (`CONSTRUCTION_ERROR`, `UNCONFIGURED_FAMILY`) do not need separate defect tickets merely because their enum currently leads its producers.

## Landing

**Textually mergeable into dev `1fc2dece`; not approved to land.** An isolated `git merge-tree --write-tree <base> <head>` returned exit 0, no conflicts, tree **`40265eb9940cc909c0e16360409f134b14446c1b`**, exactly the head tree. Git object writes were directed to a disposable `/private/tmp` object directory with the repository object store used only as a read alternate; the directory was removed. No repository refs, index, source, or object store were mutated. STRENGTH: **entailed by fresh isolated merge computation**.

Patch-risk recommendation/label: **revise / revise**. Impact if wrong: **moderate**, confined to diagnostic confidentiality/identity, including persisted panel text. Regression likelihood: **critical under the assessment rubric**, because source-visible violations of the required invariant/compatibility already exist. Protection: **partial** despite genuine green focused gates. Code recovery: **easy** (one narrow commit, no migration); reverting cannot erase previously persisted diagnostic text. Confidence: **high** in the required revisions, with live disclosure unmeasured. Leaving the base unchanged retains the original raw-message pathways. Fix F1–F3, correct F4 and the producer evidence, then recapture the required gates/mutants at the replacement immutable tip.

## Not verified

- No project unit tests, integration suite, live database, provider call, TLS listener, or browser flow was run by this reviewer. Saved tests establish their recorded results, not new executions. Runtime boundary findings were assessed statically; no disclosure reproduction was executed.
- No real secret disclosure or external exploitation path is claimed. Current normal producers constrain some inputs more tightly than the generic formatter contracts.
- I did not establish a complete repository-wide inventory of remaining diagnostic passthroughs; P3 is one concrete counterexample to an exhaustive claim.
- The supplemental suite logs lack exact run stamps and explicit saved shell exit codes. Their source identity is reconstructed from the retained stash/patch objects, not supplied by the logs themselves.
- The literal producer audit is not a universal proof of all possible dynamically generated codes. The four additional bounded TLS codes are established by tracing the concrete builders and call sites.

REVIEW: changes — close both runtime output gaps, retain the four existing TLS probe diagnostics, and correct the evidence claims before landing.
