# FIX-09 C3.5/C4 — preserved-failure paper reconciliation

This successor incorporates `SPEC-v4.md` through `SPEC-v14.md` without changing their bytes and replaces only the v14 paper-claim treatment of two exact tracked documents in the preserved failed Task 0 worktrees. Every C3.5/C4 custody, delivery, materializer, SQL-probe, reporter, 39→32→20, retry, zero-I/O exclusion, exact-byte build/parser, FIX-10 v9 dependency, and STOP law remains as frozen by v14.

## 1. Frozen predecessor and observed v14 STOP

The direct predecessor is commit `fd2836f4539c34852d0985b777907bc803ee2bff`, parent `f73d9a8e785572193f9ab3676c8ae521196e0913`, tree `2c783f640758ea4d1ade82ba13341eabdea380e5`, subject `docs(obs): close FIX-09 v14 authority gaps`. Its three authority blobs and content hashes are:

| path | blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `6d884f8bac3f76826e41b220549c2dcb930f6d11` | `64c511bcbff59b1a515b5882e8f9413e75872dde876c0eb173371a1db503830d` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v14.md` | `1253150047c2f0d1c5e838783b13faacc99baae5` | `bc0e8822a34930e652575bc34419dc23acd56f50dd6606279bce8a66a9f9f11e` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v14.md` | `220efec5f9722df7a7ab5050914953f170219d00` | `932a262addef415c63d5c2a9ea773dbe9630c10b767ea1bcbfdf8b91c4c6befe` |

The committed v14 program SHA-256 was `5d19ec4d9964b680aecb49d79871470ed10f1a5569b472c328405885b6420aee`. Its first bounded real immutable paper scan stopped immediately at full-scan ordinal 1 with rc 2, empty stdout, and exact stderr `FIX09_FATAL code=FIX09_PAPER_CLAIM\n` (35 bytes, SHA-256 `bfc51e3f56e9fdf64c03386a253f2b345283f1a4a206963f880fc79fb97c2802`). No second scan, admission retry, candidate, receipt, branch, or v14 admission worktree was created.

The authorized one-shot read-only descriptor diagnostic returned exactly two matches in 864 canonical bytes, SHA-256 `1bb6e929dc1c6574dd95990279f20f2df0ca7af40e1f233ea2a63b3250a14c0a`, with empty stderr. Both are the same frozen FIX-10 v4 decision line inside the two preserved failed Task 0 worktrees. They are stale whole-document copies, not new allocation claims: the approved current FIX-10 v9 `DECISIONS.md` remains content SHA-256 `866212f1b760dec71532ada2bc125dbaefb574bc13687eebb4629548714c1353`, blob `cb3c71265b43502e55acad5cd083f829d55f035e`.

All v14 artifacts and the failed v10/v11 worktrees/evidence remain append-only. V15 does not amend, delete, update, clean, detach, or otherwise mutate them.

## 2. Exact preserved-failure tuples

The scanner still walks every ref-tip Markdown blob and every registered worktree's tracked plus nonignored-untracked Markdown under v14's exact exclusion and stable-read laws. It adds no path exclusion and no generic historical or dependency exception.

The following two rows are the complete closed preserved-failure policy. Field order is binding.

| field | failed v10 row | failed v11 row |
|---|---|---|
| `branch_ref` | `refs/heads/codex/fix09-c35-admission` | `refs/heads/codex/fix09-c35-admission-v11` |
| `blob` | `7b3407d43bff10c572bb6413c06e2c52fcee1ac6` | `7b3407d43bff10c572bb6413c06e2c52fcee1ac6` |
| `content_sha256` | `2b3c3737f166d5e6fb25a467bc27772e168be0e8bc8f499a73ce7fda5c93ee0f` | `2b3c3737f166d5e6fb25a467bc27772e168be0e8bc8f499a73ce7fda5c93ee0f` |
| `line` | `20` | `20` |
| `line_sha256` | `72dd1f5a244c325fe3f8e27b10003e65b6f9b4685d8a392f130210c314cd520f` | `72dd1f5a244c325fe3f8e27b10003e65b6f9b4685d8a392f130210c314cd520f` |
| `mode` | `100644` | `100644` |
| `owner` | `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission` | `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v11` |
| `path` | `dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md` | same |
| `tip` | `c20e38f1695ecbf72ab2624c9f72dfe4e634d07b` | `61313a1d89cd354743f8bc94329f716fe4f2bdf5` |
| `token` | `0064` | `0064` |
| `tracked_clean` | `1` | `1` |

A token is preserved-failure evidence only when all of these predicates hold simultaneously:

1. The document is from the `tracked` worktree domain, its physical canonical owner equals exactly one row, and the owner occurs exactly once in the registered-worktree projection.
2. The registry's exact `HEAD` and `branch` fields equal the row and equal live `rev-parse HEAD` and `symbolic-ref HEAD` results for that owner.
3. `git ls-files -s -- :(top)<path>` returns exactly one stage-zero row with the row's mode, blob, and path; tracked-only porcelain for that exact path is empty. A staged, unstaged, deleted, type-changed, or otherwise tracked modification is not allowed.
4. Stable-read bytes have exactly the row's full content SHA-256 and Git blob hash.
5. The entire document has exactly one claim-regex match. It is exactly token `0064` on line `20`, and the LF-terminated full line has exactly the row's line SHA-256.
6. The closed policy contains exactly these two distinct rows, and the observed state projection contains no duplicate or unrecognized owner.

Any missing predicate leaves the token independent and `validatePaperEnvelope` fails immediately with `FIX09_PAPER_CLAIM`; malformed registry, live/registry disagreement, unreadable Git state, path/type/link/permission/UTF-8 failure, or fabricated policy/state fails closed under the existing literal fatal set. Nothing is retryable except v14's `FIX09_PAPER_UNSTABLE` changes between individually lawful complete snapshots. A mismatch is never accepted.

## 3. Separate authority domains and evidence

`FIX10_DEPENDENCY_ALLOW` remains exactly the four v14 entries and continues to accept only the approved current document bytes/blobs. The two rows above live only in `PRESERVED_FAILURE_CLAIMS`; they are never inserted into, aliased by, or treated as a general FIX-10 dependency allow.

The paper envelope becomes `fix09-paper/v3` and adds exactly:

- `preserved_failure_entries`: canonical decimal `0`, `1`, or `2`, equal to the observed unique preserved-state rows. A disposable clone may legitimately have zero; the shared controller currently has exactly two.
- `preserved_failure_evidence_sha256`: SHA-256 over ASCII `fix09-preserved-failure-evidence/v1`, NUL, then canonical JSON of the observed state rows.

`authority_allow_sha256` moves to domain `fix09-paper-authority/v3` and includes the prior authority projection, the unchanged approved FIX-10 dependency projection, and both closed rows tagged `preserved-failed-task0-worktree`. The complete paper object remains sealed into t0-039, collision evidence, candidate derivation, and independent candidate/result review exactly as inherited.

## 4. Deterministic proof and mutants

Before a draft is reviewable, the exact program must prove two positive preserved rows and kill seventeen literal hostiles: wrong physical root, registry branch, tip, path, Git mode, Git blob, content SHA, line number, line SHA, token, document match count, dirty tracked state, extra claim, missing observed state, duplicate observed state, missing policy row, and duplicate policy row. The fixture reads the immutable pinned blob object and exercises the real classifier; it does not enumerate worktrees, perform a full paper scan, create Task 0 identities, or access an excluded private component.

The v14 fatal scan is the RED proof. Green fixture output is exactly `FIX09_PRESERVED_FAILURE_FIXTURES_PASS positive=2 hostile=17\n`. Program syntax, runner syntax, embedded-byte equality, v15-only identity scan, paper-v3 parser/schema scan, frozen-v14 hash verification, and exact three-path scope must pass before narrow independent review.

## 5. Fresh v15 identities and STOP boundary

The future real identities are only `fix09-task0-v15.mjs`, `fix09-c35-admission-v15`, `codex/fix09-c35-admission-v15`, the v15 base/candidate-validation/result-validation manifests, candidate/result receipts, and review report. All must be absent before Task 0 and must never reuse a v10-v14 path or artifact.

Only a fresh independent zero-finding review of uncommitted v15 may authorize the three-path docs commit and later disposable no-hardlink shadow. Only a fresh zero-finding post-commit authority review plus exact shadow PASS may authorize a future real v15 Task 0. C3.5 remains STOP until Task 0 candidate and result both receive their separately required independent acceptance.

This authority creates no product, test, migration, native source/binary, admission branch/worktree/receipt, live key, database, service, V, merge, push, board, acceptance, or Done act. The 39→32→20 semantics, three-pair/six-scan ceiling, corrected 16-file/118-name C3.5 projection, exact 33-path future implementation ledger, signer/session, delivery adapter, materializer, SQL probes, and all reviewed FIX-10 v9 pins remain unchanged.
