# FIX-09 C3.5/C4 — bounded canonical security-transcript representation

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v20.md` without changing their bytes. It replaces only v20's oversized worktree wire representation and its prematurely advanced equality counter. Every v20 metadata uint64 law, v19 Git-row/status law, coherent captured-OID scan, raw enumeration/body replay, paper/five-collision rederivation, security projection, pair manifest, 39→32→20 ledger, C3.5 projection, and STOP law remains fail-closed.

## 1. Frozen v20 authority and failure evidence

The direct predecessor is commit `b0205a2e45a112801652a078165ffda760bd0551`, parent `39301ddfbd57e0b67fc0cd97cbd6a8fb2badddb5`, tree `69bf9b27c7ee5ca6ff953be7a83883f9ba380590`, subject `docs(obs): accept nanosecond metadata in FIX-09 v20`. Its documents are DECISIONS blob `1a3309fd8b0c742b13b93ad6ff006f97f75971ca` / SHA-256 `8d96d3ec819e00b05d8c0070c48b0ce338c8b54d36096bab27fe4fd98fcb4646`, PLAN-v20 blob `011cb0257c82f0cf0f5b32f73b608228868b0433` / SHA-256 `05ee73f6fdf96972fe7ac72e1241561b9c074f1384620e8ecba4c2cc3e1c659d`, and SPEC-v20 blob `9fe2778d1c198f8525e14258106bdae4cc7e7ade` / SHA-256 `09f3adbb8d22aa17edd77227468db9bdf9936c1f5dd61ca193924b3f07f68100`.

V20 passed every safe/static gate. Its sole canonical token `de3e1c8e` stopped rc 2 at t0-039 with empty stdout and exact 51-byte `FIX09_SHADOW_FATAL code=FIX09_SHADOW_STATUS_T0_039\n`, SHA-256 `82ebca7812d2e9e2c3cac25f5aa2d9e64b05e3ebb5a0c992cf589176ef66a86e`. The ignored report is 5,617 bytes, 64 lines, SHA-256 `eb869edf324802f6e2d86bb107670af20cbc090dbf9b25b3c97172190b14050c`.

Output-only diagnostics proved native `RangeError: Invalid string length` at `stable -> sealCompleteScanV20`. One validated transcript was exactly 670,366,125 canonical bytes; its 665,332,229-byte worktree snapshot contained passes 333,504,801, accepted 166,752,399, and documents 164,189,725 bytes. Thus 330,942,124 bytes came from serializing duplicate aliases after pass equality. The error occurred after `equality_checks` had advanced, so conversion to PAPER_WORKTREE produced invalid fatal trace `p=1,f=2,e=1,q=2,u=0` and was masked by PAPER_TRACE. All v20 evidence is immutable and no real scan or Task 0 identity followed.

## 2. Exact v21 authority identity

The future subject is exactly `docs(obs): compact FIX-09 v21 security transcripts`. T0-002 binds direct parent `b0205a2e45a112801652a078165ffda760bd0551`; t0-003, self-check, runner, and receipts use the same subject. `verifyPreviousAuthority` proves v20's exact graph and document identity.

The exact Appendix C program is 211,302 bytes, SHA-256 `83695239238357b07373c0bf798d5a58217eabeb5cf345e1ddf578d39de483f1`, Git blob `323623d21c420100e1e52e711babfbca35677967`. The exact runner is 22,782 bytes, SHA-256 `b8539b765337d6b41800048b7de2c0d5af64377e0c1aeb639632abbd44af9b80`, Git blob `aa46230b6d9ed1d7dee077d4c445314f698dd77c`.

## 3. Compact worktree snapshot v2

The scanner still performs two complete descriptor-stable worktree reads and compares their full in-memory projections byte-for-byte before admission. The wire snapshot is exactly `fix09-worktree-snapshot/v2` with fields `bodies,digest,pass_count,passes,registry_digest,roots,schema`.

- `bodies` contains one ordered exact `{body_base64,bytes,content_sha256}` per admitted Markdown document.
- Each of the two ordered `passes` retains its complete raw NUL tracked/untracked enumeration seals and one ordered observation `{bytes,content_sha256,kind,metadata,path,root}` per document.
- The two pass observations must be byte-identical, every path/kind/root must be rederived from its own admitted enumeration, and every body is decoded with strict canonical base64/UTF-8 and cross-bound to both observations' length/hash/metadata/order.
- Missing, extra, reordered, altered, duplicated, or legacy `accepted`/`documents` aliases are fatal or, only for two individually lawful unequal passes, unstable. The compact digest is domain-separated `fix09-worktree-snapshot/v2\0`.

Nothing is omitted semantically: two independent live observations and both raw enumerations remain, while identical body bytes are stored once after equality. Paper and collision consumers reconstruct only the validated accepted projection. Paper worktree evidence advances to domain `fix09-paper-worktrees/v7\0` and binds the reconstructed exact accepted pass.

The production fixture proves one body copy per document, two observations per document, the measured v20 overflow, a valid late-fatal trace, and sixteen schema/body/pass/alias/old-order hostiles. Existing coherent snapshot hostiles remain 82, including all paper/claim/collision/preserved/ref/worktree/raw/pair/carry cases.

## 4. Late-fatal trace law

`equality_checks` counts completed projection comparisons only. Sealing and projection derivation occur first; only after both succeed is the counter incremented. A fatal during scan 2 or either pre-comparison seal therefore records `e=0`, so exact fatal equations remain valid. The old `p=1,f=2,e=1,q=2,u=0` ordering mutant is killed. No fatal becomes retryable and no mismatch is accepted.

## 5. Preserved security boundary and execution

Each scan independently closes authority/ref/registry/preserved start=end, traverses captured OIDs only, retains raw ref/per-tree/reachable/worktree evidence, validates OID type/peel, rederives paper plus all five collision views, and requires exact two preserved hits, zero independent claims, and five zero collision counts. A bounded pair still retains both validated transcripts, derives each security projection independently, and accepts only equal projection bytes.

The runner validates large pair files sequentially and retains only their sealed summaries, avoiding three simultaneous parsed pair objects. This is a memory-liveness change only; every raw/pair hash, scan receipt, attempt trace, and security digest is retained.

The 39 base facts, 32 candidate fields, 20 candidate outcomes, 17 result fields, three result outcomes, t0-032..038 bindings, sole t0-039 collector, 16-file/118-name C3.5 projection, 33-path ledger, FIX-10-v9 shape-only dependency, and downstream STOP boundaries remain unchanged.

Before commit, require the v20 real size/trace RED evidence, v21 compact GREEN, all safe fixtures, exact fences/syntax/ledgers/C3.5/frozen predecessors/scope/index/FIX07 checks. Commit exactly SPEC-v21, PLAN-v21, and one decision row. Repeat immutable gates, then run one cryptorandom no-hardlinks canonical shadow. Stop without retry on failure. If it passes, run only the two bounded real authority-verification scans. Real Task 0 remains blocked on its literal fresh independent v21 review while reviews are held.

No product/test/migration/native/key/database/service/V/merge/push/board/acceptance/Done act is authorized.
