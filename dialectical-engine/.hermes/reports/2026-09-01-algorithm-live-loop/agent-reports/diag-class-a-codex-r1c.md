CODEX REVIEW DIAG-CLASS-A r1c — APPROVE · comments read through: diag-class-a-r1c-2026-09-07

Counts: **0 required changes; 2 prior remainders cleared (F1 implementation, F2 audit); 0 residual packet charges (P1 cleared).** Eleven current mutants have complete custody: eight killed, three survived. Eighteen delivery records stamp the reviewed tip; ten named historical records account for the comparator's failures. Two nonblocking report errata are identified below. STRENGTH: **entailed by fresh source/Git reads and saved-artifact comparison**, with the independent compiler measurement distinguished below.

Reviewed `1fc2dece2775ca77c56a57fd93e1d656a019c24b..12e054d9da29ea17d0d18fb9dc67d185856c1893`, branch `lane/diag-class-a`. HEAD and dev match the packet; working tree clean. Four commits from base: `e86c850e`, `d8319a0a`, `f5236484`, `12e054d9`. Cumulative change: seven files, 828 insertions, seven deletions. This round: only `s04.ts`, its unit test and an append to TOOLING-TRAPS, 114 insertions and six deletions. Exact binary diff SHA-256: `831edecd23edeea43f7b3b986618107e36f48327b0db534218f40c780dd80c42`.

Source paths are relative to the lane's `dialectical-engine/`. Mission paths are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/`. I read the r1c packet in full first, then the complete r1b verdict, worker packet including AMENDMENT 2, dispatch, worker report and self-report.

## Findings

**F1 remainder — CLEAR.**

**File/line:** `packages/judgement/src/s04.ts:276`, membership/snapshot at `:296`, export/type at `:340`/`:344`; `tests/unit/judgement-s04.test.ts:397` and `:429`.

**Input → former wrong outcome → reviewed outcome:** a later mutation of the exported array formerly widened the helper's accepted reasons. The new Set is constructed from its own seven-key object literal. Neither the object nor Set is exported or returned; the helper only calls `has`. The export supplies no runtime input to that construction. An AST identifier walk finds the exported name only at its declaration and type alias, excluding comments. Its type use is erased. The runtime guarantee therefore comes from private storage and a one-read membership check, rather than `ReadonlySet` or `satisfies` alone.

The helper captures the kind once and returns precisely that validated string or `UNCLASSIFIED_MEMBER_ERROR`. The public list, type and class are byte-identical to base; the note shape and legacy `failureKind:` expression are preserved. The private Set need not itself be runtime-frozen to meet this contract: no caller receives a reference and no local writer exists after initialization.

**Required fix:** satisfied; no residual implementation change. The mutation regression restores the exported array in `finally` and asserts restoration. The added accessor regression accounts for the note's preceding read: its sequence is `PARSE_FAILURE`, `TIMEOUT`, then synthetic text; assertions require `failureKind === "PARSE_FAILURE"`, `reason === "TIMEOUT"`, and exactly the first two reads. It therefore exercises successful membership and would reject a further helper read. The earlier refusal-path test and valid-kind/fallback controls remain.

**STRENGTH:** **entailed statically and by saved exact-tip tests and mutants**. No production mutation of this export or live disclosure is claimed.

I independently measured the guard with the installed **tsc 7.0.2**, using a scratch copy of the real `s04.ts`, the project's compiler options, and an include narrowed to that source and its imports:

| Scratch source | Exit | Observation |
|---|---:|---|
| Unchanged | 0 | No diagnostics |
| Remove private `UNCONFIGURED_FAMILY` key, retain `satisfies` | 1 | TS2741 at `s04.ts(283,3)`, naming the missing key |
| Add private `REVIEW_EXTRA_KIND` key, retain `satisfies` | 1 | TS2353 at `s04.ts(277,3)`, naming the excess key |
| Missing key, replace `satisfies` with `as` | 0 | No diagnostics |

The scratch source was restored to SHA-256 `2bd4b0d69d964f1f2381ea2031bdcdfded807241df76dd65f6d0b0da8efbbe16`, matching the immutable head blob. **STRENGTH: experimentally observed compiler behavior.** This proves the guard on this literal; it does not claim that TypeScript prevents an additional runtime transformation from widening the resulting Set.

**F2 remainder — CLEAR.**

**File/line:** `logs/diag-class-a/20-producer-audit.log:66`, `:73`, `:81`, Part B at `:98`; filed script `audit-tools/derive-dev-set.py:32`; worker report at `:32` and withdrawal at `:123`.

**Input → former wrong outcome → reviewed outcome:** resolving the template inputs to their callers formerly produced two false unbounded classifications. My caller search confirms:

| Input | Source domain | Correct disposition |
|---|---|---|
| `override`, `dev-deployment-register.ts:163` | Environment/caller strings, passed at `:168` and `:169` | Unbounded; excluded by grammar |
| `label`, `dev-deployment-register.ts:189` | Private `requireMatch`, only `judge` and `composer` callers at `:202` and `:203` | Bounded to two messages; excluded by grammar |
| `service`, `validate-compose-postgres.mjs:8` | Private `serviceBlock`, only `postgres` and `hatchet-lite` callers at `:15` and `:16` | Bounded to two messages; excluded by grammar |

Every form contains a colon, which the historical `/^DEV_[A-Z0-9_]+$/u` does not admit. The audit now correctly calls the six sites **error-construction candidates**, distinguishes other output interpolations, and withdraws the two false free-input follow-ups. There are five bounded candidates and one unbounded candidate; boundedness alone is insufficient for admission.

**Required fix:** satisfied; keep the 152-entry implementation unchanged. Part B now contains an invocation, output, exit and the actual filed script's source. I ran that file from the lane's `dialectical-engine/` directory using its absolute mission path: exit **0**, **26 producer files, 145 quoted literals + 3 component-exit + 4 TLS probe codes = 152**, both set differences empty. Its SHA-256 is `37b54f928fb219ea2bb075cbb1d1b2105f2dd87670f73972bdebc04600562d5e`; the printed source matches the file exactly.

The script reads each producer via `git show` at base and compares the resulting set with the working-tree allow-list. It returns 1 on disagreement. Its file enumeration uses current globs; an independent base-tree enumeration confirms that the current and base populations are the same 26 files here. The template expansions are explicit, manually audited inputs to the script, not an automatic general template analyzer. Those qualifications do not undermine this tree's reproducibility.

**STRENGTH:** **entailed by fresh caller/source inspection, independent base-tree enumeration and successful script execution**. No new finding is asserted against the already-cleared four TLS entries or DEV snapshot repair.

## Mutants and custody

**J and K are killed for the intended assertion, not a collection or compiler failure.** Both transcripts show `expected 'SYNTHETIC_INJECTED_KIND' to be 'UNCLASSIFIED_MEMBER_ERROR'` at `judgement-s04.test.ts:415`, one failed/23 skipped, exit 1. J changes which storage is consulted; K widens the private storage's contents after the checked literal. K consequently tests the runtime output restriction, not the exhaustiveness guard. Together they discriminate the two claimed failure modes; they are not a proof against every possible widening.

| Current transcripts | Saved result |
|---|---|
| A, B, C | Intended raw-message/shape-rule assertions fail; exit 1 |
| G | Runtime out-of-domain kind assertion fails; exit 1 |
| H | Actual changing-message-accessor assertion fails; exit 1 |
| I | Exact four-TLS-code retention assertion fails; exit 1 |
| J, K | Exact injected-kind fallback assertion fails; exit 1 |
| D, E, F | Neighbor renames survive: 24/24, 22/22, 59/59; exit 0 |

For all eleven `-r2` files I compared the single commit/tree header, OLD anchor, NEW absence in the original, multiplicity, and before/after hashes against the corresponding Git blob. Every check matches `12e054d9…` / `2ed299a5…`. All record pre=0, applied=declared multiplicity, restored=0, matching hashes, empty porcelain and `RESULT: ok`. D/E have two anchors; the others have one. **STRENGTH: entailed by fresh transcript/blob comparison.** No reviewer mutation run was executed.

All **nine** `superseded-r1/` and **six** `superseded-r0/` mutant files also match their manifests, original commit/tree, anchors and source hashes. The stale r0 manifest tip pointer has been qualified and the r1 archive is named. This establishes the archived mutant sets' integrity; it does not retroactively reconstruct unarchived historical gate files or the intermediate appended-log incident.

## Gates and evidence

All saved focused captures are after the final commit's **18:59:16 CEST** time and carry its stamp and a clean-porcelain declaration.

| Saved record | Observed result |
|---|---|
| `10-gate-judgement-s04.log` | Three runs, each 24/24, exit 0 |
| `11-gate-dev-auth-stack.log` | Three runs, each 22/22, exit 0 |
| `12-gate-v2ui-data-layer.log` | Three runs, each 59/59, exit 0 |
| `13-gate-typecheck.log` | Three runs, each eight inherited diagnostics, exit 1; identity holds |
| `28-gate-neighbours-at-tip.log` | Named dedicated record: three files, 56/56, exit 0 |
| `25-wider-unit-suite-at-tip.log` | 17 failed, 2324 passed, 2341 total; 10 failed/114 passed files, 124 total; exit 1 |

I independently extracted each saved typecheck diagnostic stream. All three equal untouched baseline `03`, byte-for-byte, SHA-256 `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. Typecheck remains failing; the satisfied gate is diagnostic identity.

Fresh extraction of raw FAIL headings from the current wider run, selected untouched-base capture and round-0 pre-commit capture finds the same **17 failed test names plus one separate collection-failed suite**. The canonical test-name hash is `81d0fb09f5da90c6d5a6f674ecbab83b38bc71c975b5f225943e8522f351f0d7`. **STRENGTH: entailed by saved artifacts**, not proof against a changed failure inside an already-failing test. F4 remains cleared.

Two nonblocking report errata are worth preserving accurately: worker report `:77` calls 2314 passing tests “base”; that number belongs to the **round-0 pre-commit lane** full run. The selected untouched-base capture has 1097 passing tests of 1114. The +10 is the passing-test increase since that pre-commit lane run. Worker report `:125` also retains `s04.ts:305` for the unchecked note field; its current location is **`:329`**. Neither changes the verified failure-name comparison or the explicit scope exclusion.

The fresh read-only stamp comparator returns **28 records, 10 failures, exit 1**, matching the saved result. All **18 delivery records (`10`–`20`, `22`–`28`)** stamp the tip. Exceptions are precisely `01`–`06` (provision/base/round-0 RED), `30` (round-1 RED), `31` (round-2 RED), and the two unstamped frozen reviewer verdicts. They are named history, not unexplained delivery failures.

## Packet audit

**AMENDMENT 2 — CLEAR; P1 residual discharged.** `packets/diag-class-a-worker.md:53` expressly distinguishes declared spellings from mutable exported storage and permits a helper-owned vocabulary. Its F1 requirements at `:55` match the implementation and the two added tests; F2 at `:57` supplies the correct domains and requires the now-filed derivation. P2/P3 corrections remain in force. No expansion of the read/edit grant was needed; cumulative edits are confined to the seven granted files, TOOLING-TRAPS is append-only, and the four previously cleared source/test files are unchanged this round.

`31-red-r2.log` records 18:57:15, previous tip `f5236484`, only the S04 test dirty, source untouched, then **one failed/23 passed, exit 1**, with the injected-kind assertion failing. This supports the required tests-against-prior-implementation chronology before the 18:59:16 commit. **STRENGTH: entailed for the recorded state; consistent-with test-first authorship**, which a transcript cannot independently prove in full. Subsequent gates and required A/G/J mutants are recorded at the committed tip using new names. No packet charge remains.

The known `F-DEV-TLS-DOUBLE-WRAP` at `tls-front-door.mjs:263`/`:288`, the separately unchecked `failureKind` at `s04.ts:329` with runner consumers `:2650`/`:2698`, and Node version skew remain named exclusions. Approval of this lane's `reason` repair does not claim that the whole panel note has been sanitized.

## Landing

**APPROVE for landing into dev `1fc2dece2775ca77c56a57fd93e1d656a019c24b`.** Isolated `git merge-tree --write-tree <base> <head>` returned **exit 0**, no conflicts, tree **`2ed299a54b1948c67d710537125cb249bb9605b8`**, exactly HEAD's tree. Base is an ancestor of HEAD. Object writes were redirected to disposable `/private/tmp` storage with the original object store used only as a read alternate. No repository objects, refs, index or source were mutated; final ordinary Git reads confirm the same clean branch, HEAD and dev. **STRENGTH: entailed by isolated merge computation and fresh Git reads.**

The remaining change is confined to diagnostic formatting and its evidence. It adds no dependency, migration or shared module. Code rollback is straightforward; it would not remove previously persisted text. The two required remainders and packet premise are cleared, so no residual needs V's decision under the CHANGES path.

## Not verified

- The worker's delivery gates and mutants are saved evidence, not reviewer reruns. My single optional scratch invocation reported S04 24/24 and DEV 22/22, but UI collection failed because the archive omitted the generated `@debateai/contract` entry present in the lane. Overall: 46 passed, one collection-failed file, exit 1. The initial compiler experiment shared that scratch tree, so I do **not** use that unit run as immutable-tip gate evidence. It was not repeated. The later focused, serial compiler checks above are the retained independent measurement.
- The initial whole-project scratch typecheck had additional copy/dependency errors and was not a baseline-identity check. The eight-line identity conclusion comes from fresh comparison of the saved complete lane/base records.
- No live provider, database, TLS listener, browser flow, integration suite, wider-suite rerun or supported-Node rerun was performed. The installed and saved runtime is Node v25.7.0; the package declares 22.23.1.
- Getter exceptions, arbitrary global/intrinsic tampering, future producer completeness and a repository-wide formatter inventory are not established here. The conditional original vocabulary mutation was a local contract issue, not an observed production exploit.
- No board or DECISIONS edit, install, commit, push or actual merge was performed. Delivery consists only of this review and its companion self-report.

REWORK: approve — the private S04 vocabulary and exact accessor regression close F1, the corrected reproducible producer audit closes F2, and AMENDMENT 2 clears the remaining packet premise.
