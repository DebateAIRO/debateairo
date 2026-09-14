# FIX-09 C3.5/C4 — nanosecond metadata admission repair

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v19.md` without changing their bytes. It replaces only the stopped v19 filesystem-metadata unsigned-integer validator. The v19 nameless Git-object grammar, closed shadow status renderer, coherent-snapshot boundary, raw replay, projection equality, pair manifest, claims, collisions, preserved failures, dependency pins, 39→32→20 ledger, C3.5 projection, and every STOP law remain fail-closed.

## 1. Frozen v19 authority and failure evidence

The direct predecessor is commit `39301ddfbd57e0b67fc0cd97cbd6a8fb2badddb5`, parent `9f105f11c96dbf04b0f022725e9a465eaddf0dae`, tree `a6dff79c0a349441e5dfc54178c191d1a3bb06e7`, subject `docs(obs): accept nameless Git objects in FIX-09 v19`. Its exact authority documents are:

| path | Git blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `c0f8a36fceeac9764892f91d738e6fb28db1f5d6` | `4f5de9921b5e18d6604d5c94987a1588917ed815f7cba07f5bf47b659f8fae02` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v19.md` | `28157ac0198139c4c9cfc7e361d4786a6c1ef624` | `f516f0bc8419be78a567fe4e1bfc34db84f1d9e1e28ce822efce86ecb5b5b6c5` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v19.md` | `b8c6f609e2dda7982e661666dce9abd5173137e9` | `3e1d14ca485898be9b3afb3f82b25018c80720d11181cbb3e984a065bdbaa8e9` |

The exact v19 program is 206,142 bytes, SHA-256 `c61e3a5698d3c04caf8e701527dbb60537fe8c4a118dc898d4f5c637824796e4`, Git blob `8eee27e9cb6aefe5d007272ccd02c4239c5e7bbe`; the exact runner is 22,786 bytes, SHA-256 `c7e2b72f8c6bffecba8b89fa5012e8724636123c10fdae5e07d828c9280cc1fc`, Git blob `0ff111ed34d08937249a22cc06ba9154b4c01af7`.

All v19 precommit and postcommit safe/static gates passed. Its sole canonical cryptorandom no-hardlinks shadow token `55d8fb9f` then stopped at rc 2 with empty stdout and exact 51-byte stderr `FIX09_SHADOW_FATAL code=FIX09_SHADOW_STATUS_T0_039\n`, SHA-256 `82ebca7812d2e9e2c3cac25f5aa2d9e64b05e3ebb5a0c992cf589176ef66a86e`. No real v19 scan or Task 0 identity was created. The ignored v19 STOP report is 7,830 bytes, 114 lines, SHA-256 `677302e74d5320998c4328333c61244b22ccaf6b4e20886d36bdc10e01e0dacd`.

Output-only one-shot diagnostics, never canonical retries, proved inner `FIX09_SECURITY_TRANSCRIPT` at `canonicalUint -> validateMetadataV19 -> validateWorktreeSnapshotV19`. The exact lawful metadata rejected was `ctime_ns=1788790962975345686` on a regular single-link 7,138-byte file. Its complete metadata object was `{"bytes":"7138","key":"ctime_ns","metadata":{"ctime_ns":"1788790962975345686","dev":"16777233","ino":"183957021","mode":"33188","mtime_ns":"1788790962975345686","nlink":"1","size":"7138"}}`. The diagnostic stderr is 2,693 bytes, SHA-256 `c0bfc50616d22021e2b61e7a33769c5ec5b0515291d25c64b70ab2ba9b9a3e6c`. V20 preserves every v19 stream, report, driver, and cleaned-root fact without retry or certification.

## 2. Exact v20 authority identity

The future v20 subject is exactly `docs(obs): accept nanosecond metadata in FIX-09 v20`. Future t0-002 binds direct parent `39301ddfbd57e0b67fc0cd97cbd6a8fb2badddb5`; t0-003, `AUTHORITY_SUBJECT`, program self-check, runner precheck, and receipt-bound subject fact use the same literal. `verifyPreviousAuthority` separately proves the frozen v19 parent/tree/subject and three document pins above.

The program, runner, manifests, pair bundles, receipts, branch, and worktree use v20-only paths and schemas. No v19 output path is reused.

The exact Appendix C v20 program is 207,755 bytes, SHA-256 `7e960d28e4fe67d2949a44955502ae6ba6c900ff4add832b2ac1d8e2411da2dc`, Git blob `df5d07feec0dfd20c51543430804d8d93250dc61`; the exact runner is 22,785 bytes, SHA-256 `b6a2f8933e2ae6f942330e6974c1e8e99d234264d01ed642ad0420398dec5755`, Git blob `60616c52f64f573c9468fd9063cbbb948e3b589f`.

## 3. Canonical filesystem-metadata unsigned integers

Trace and ledger counters remain canonical decimal strings whose parsed value must be a nonnegative safe JavaScript integer. They continue to use the inherited `canonicalUint`; no retry equation, cardinality, ordinal, or attempt-trace range changes.

Only descriptor-derived filesystem metadata fields `ctime_ns`, `dev`, `ino`, `mode`, `mtime_ns`, `nlink`, and `size` use `canonicalMetadataUintV20`. The exact lexical language is `0|[1-9][0-9]*`, the maximum is unsigned 64-bit `18446744073709551615`, and parsing/comparison uses `BigInt` without Number coercion. Empty, sign, leading zero, decimal point, exponent, whitespace, nonstring, or overflow is fatal `FIX09_SECURITY_TRANSCRIPT`. The existing regular-file mode, `nlink=1`, and exact byte-size checks remain unchanged and compare in the BigInt/string domain.

The immutable v19 program is RED on the exact observed nanosecond value. The production v20 fixture calls the actual validator and proves four positives (the observed value, the first integer above `Number.MAX_SAFE_INTEGER`, uint64 maximum, and a full metadata object), ten malformed/overflow values, and the exact old safe-number validator mutant. Its exact output is `FIX09_V20_METADATA_FIXTURES_PASS positive=4 hostile=11 observed=1788790962975345686 uint64_max=18446744073709551615\n`.

## 4. Preserved v19 parser, status, and coherent security boundary

`reachableMatchesV20` retains the v19 exact Git forms `OID`, `OID<space>`, and `OID<space><path>`, seals raw bytes, maps both nameless forms to no path match, and rejects malformed rows. `shadowStatusCodeV20` retains the closed 59-member ID set and renders `t0-039` as `FIX09_SHADOW_STATUS_T0_039`; arbitrary ledger IDs remain impossible.

Every scan remains `fix09-complete-security-scan/v2`: captured authority/ref/registry/preserved start and end, traversal only from captured OIDs, retained raw ref/per-tree/reachable/worktree/body evidence, independent OID type/peel validation, two descriptor-stable worktree passes, replayed paper plus five collision views, and shared snapshot digests. Only a difference between individually lawful snapshots is `FIX09_PAPER_UNSTABLE`; malformed/security/claim/collision/preserved/type/link/path/permission/read/parser failures remain immediately fatal.

`boundedCompleteCollectV20` retains three attempts/six scans, independently validates and seals both raws, derives both `fix09-security-projection/v2` values, accepts only byte-identical projection bytes, and binds both raws/projections/snapshot receipts plus the final accepted trace row in one `fix09-security-pair-bundle/v1`. Raw ambient evidence may differ; security decisions may not.

The 39 base facts, 32 candidate fields, 20 candidate outcomes, 17 result fields, three result outcomes, seven t0-032..038 zero-traversal bindings, sole t0-039 collector, 16-file/118-name/12,676-byte C3.5 projection, 33-path implementation ledger, FIX-10-v9 shape-only dependency, and downstream FIX-10 C0/C4 STOP boundaries remain unchanged.

## 5. Required v20 proof and execution order

Before commit, require the v19 metadata RED, the v20 metadata GREEN, the preserved v19 Git-row/status GREEN, `v20-precommit-fixtures`, syntax, exact fence equality, complete ledger/snapshot/replay/projection/pair/trace/C3.5/frozen-predecessor checks, exact three-path/one-row scope, empty index, and preserved FIX07 hash.

Commit exactly `SPEC-v20.md`, `PLAN-v20.md`, and one appended decision row with subject `docs(obs): accept nanosecond metadata in FIX-09 v20`. Repeat all immutable aggregate and postcommit static/fixture gates. Then execute exactly one cryptorandom no-hardlinks canonical v20 shadow; stop without retry on any failure.

If and only if the shadow passes, execute the two bounded real authority-verification `immutable-paper-scan` invocations exactly as inherited, retaining both raw streams and requiring independently derived security projections to match. They create no Task 0 branch/worktree/receipt/manifest. Stop after scan 1 on failure and never retry acceptance.

Even if both real scans pass, real Task 0 retains its literal fresh independent v20 review prerequisite. Because reviews are held, execution stops at that hard-authority boundary. C3.5, FIX-10 C0, and C4 remain downstream STOP.

This authority round creates only `SPEC-v20.md`, `PLAN-v20.md`, and one appended FIX-09 decision row. It creates no product/test/migration/native implementation, live key, database, service, V, merge, push, board, acceptance, or Done act.
