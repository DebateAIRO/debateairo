# FIX-09 C3.5/C4 — executable admission identity correction

This successor incorporates `SPEC-v4.md` through `SPEC-v16.md` without changing their bytes. It corrects only the two executable authority-identity literals that made the committed v16 shadow stop before composition. Every v16 complete-scan projection, raw-evidence, bounded retry, preserved-failure, signer/session, delivery adapter, materializer, SQL-probe, build/parser, C3.5, 39→32→20, and STOP law remains unchanged.

## 1. Frozen v16 authority and failure

The direct predecessor is commit `dd2ae8c7124ef50aef83ee7a0f5ad25a4ae2900d`, parent `c825d75d20782e4cd8390977135ddb8cfafc40c6`, tree `4a193eb5570d32eaf63618767278bc2c74160a5e`, subject `docs(obs): make FIX-09 v16 admission live`. Its exact authority documents are:

| path | Git blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `3e549f51401ba79af7c8f671a4c500a91033fea1` | `768f9ab349ed5c7042537a65b904c28574f1ed893ca6a1873890bd160a61cf31` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v16.md` | `af512216fa14d1b83e9f729f2271c9ed4b55a2c6` | `1dfdb38e594d310e2a8c00fa5f3123ecbdaf7396886b165ee75e5b9839a668ce` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v16.md` | `dda599ce32d7da7e395bf2fd2bf61ea377258371` | `d412a05e21c4d0c8fb7576ea8142f495b254a7f6f6a57a2278d1c11a6f90a89f` |

The committed v16 program is 140,366 bytes, SHA-256 `0fcc2445644fa6d390fb76574f02e8f86ada084f6fecdfdccd329a8b622a9c48`, Git blob `f8bb23e80e3ef7e5d8d6f3ab0d4cec3d453ca7be`. Its runner is 20,193 bytes, SHA-256 `fa3bc86487e4846f1461c1ce5f5dc14597c3b4c26d7c9988ac98a3220ad27492`, Git blob `cc378c61254e601ff2f3fdfd1355a8c2e0794076`.

The sole authorized v16 shadow used cryptorandom token `27454d9d`. It returned rc 2, empty stdout (0 bytes, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`), and exact stderr `FIX09_SHADOW_FATAL code=FIX09_SHADOW_PARSER\n` (44 bytes, SHA-256 `524aa773d77582dd222551e68a77e1bdb36753eeac93994998264507ed759ec7`). The runner and disposable root were cleaned. Both streams are preserved; no retry, real complete-security scan, Task 0 identity, candidate, branch, or worktree followed.

## 2. Closed cause

The failure is deterministic and precedes all Task 0 composition:

- v16 t0-002 ran `git rev-parse HEAD^` but expected v14 `fd2836f4539c34852d0985b777907bc803ee2bff`; actual `dd2ae8c7124ef50aef83ee7a0f5ad25a4ae2900d^` is v15 `c825d75d20782e4cd8390977135ddb8cfafc40c6`;
- v16 t0-003 expected `docs(obs): reconcile FIX-09 v16 paper evidence`, while the committed subject is `docs(obs): make FIX-09 v16 admission live`.

The exact runner stops at t0-002 with `FIX09_SHADOW_PARSER`; it never reaches admission worktree creation. This is an authority identity error, not an ambient repository, collision, claim, preserved-state, or security-projection mismatch.

## 3. Exact v17 identity law

The v17 authority commit subject is exactly:

`docs(obs): correct FIX-09 v17 admission identity`

That literal appears identically in t0-003, program `AUTHORITY_SUBJECT`, program `selfCheck`, the runner's pre-composition authority check, and the subject fact transitively sealed into the 32-field candidate by `capture_evidence_manifest_sha256`. No new receipt field changes the frozen 32-field schema.

Future v17 t0-002 expects exactly `dd2ae8c7124ef50aef83ee7a0f5ad25a4ae2900d\n`, because the successor commit's direct parent is v16. Separately, `verifyPreviousAuthority` proves v16's parent is `c825d75d20782e4cd8390977135ddb8cfafc40c6`, tree is `4a193eb5570d32eaf63618767278bc2c74160a5e`, subject is exact, and all three predecessor document blobs/hashes match. Conflating those two graph edges is forbidden.

The runner verifies the future v17 commit's direct parent and subject before reading its executable ledger or creating its disposable clone. The program verifies the subject on every self-check and derives the candidate only when sealed t0-002/t0-003 match live Git. Wrong parent, predecessor parent, subject, tree, path, document, or program bytes fail closed.

## 4. Frozen v16 security and architecture

Every v16 rule remains exact:

- every invocation obtains an internally byte-identical bounded pair over paper plus all five collision views, with maximum three pairs/six scans and only `FIX09_PAPER_UNSTABLE` retryable;
- every accepted raw transcript is retained and hashed independently before the closed `fix09-security-projection/v1` comparison;
- the projection binds current authority commit/parent/tree/docs/allow, actual program bytes/SHA/blob, full scope/request/historical/FIX-10-v9 identity, exact two preserved policy/live rows and hits, five zero collisions, and zero independent claims;
- only ambient unrelated root/ref/document/enumeration/content/metadata counts and digests are excluded from cross-invocation equality;
- positive derive/candidate/result and both independent reviewers perform their required fresh complete scans; hostile candidate/result mutations reuse sealed evidence and cheap anchors;
- the exact corrected 16-file/118-name C3.5 projection, 33-path future implementation ledger, native signer/session, generation-scoped delivery adapter, materializer, SQL helper/probes, and FIX-10 v9 pins are unchanged.

## 5. Deterministic identity proof

Before commit, a zero-I/O static fixture must parse the prospective 39-row ledger and prove t0-002 equals the prospective direct parent, t0-003 equals the one subject literal, `PREVIOUS_AUTHORITY_REF^` equals its separately pinned predecessor parent, all v16 document pins match Git, and program/runner subject constants match. Parent-vs-grandparent, stale-v16 subject, alternate-v17 subject, missing self-check, missing runner precheck, wrong scope path, or changed 39/32/20 counts must fail.

After a zero-finding narrow review, one fresh cryptorandom no-hardlinks shadow may run. Only its exact 39→32→20 PASS with six full scans/three pairs permits the two separately invoked real v17 complete-security scans. Both raw transcripts remain preserved and may differ only when their independently derived security projections are byte-identical. Any identity, claim, collision, preserved-state, raw-validation, or projection mismatch stops without acceptance retry.

## 6. STOP boundary

This authority round creates only `SPEC-v17.md`, `PLAN-v17.md`, and one appended FIX-09 decision row. It creates no real Task 0 program/branch/worktree/receipt, product/test/migration/native implementation, live key, database, service, V, merge, push, board, acceptance, or Done act.

Task 0 remains STOP until the committed v17 authority receives a fresh independent zero-finding review and its one authorized shadow passes. C3.5 remains STOP until a future real v17 Task 0 candidate and result each receive their separately required independent acceptance.
