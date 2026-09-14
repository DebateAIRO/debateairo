# FIX-09 C3.5/C4 — cross-invocation admission liveness

This successor incorporates `SPEC-v4.md` through `SPEC-v15.md` without changing their bytes. It replaces only v15's requirement that two separately valid complete security-scan transcripts be byte-identical across invocations. All C3.5/C4 custody, delivery, materializer, SQL-probe, reporter, 39→32→20, zero-I/O exclusion, stable-read, exact-byte build/parser, FIX-10 v9 dependency, preserved-failure, and STOP laws remain frozen.

## 1. Frozen predecessor and observed v15 STOP

The direct predecessor is commit `c825d75d20782e4cd8390977135ddb8cfafc40c6`, parent `fd2836f4539c34852d0985b777907bc803ee2bff`, tree `d3b8d1bb380dcde1e2be7c63e3cd987bdbdd08d3`, subject `docs(obs): reconcile FIX-09 v15 paper evidence`. Its authority documents are:

| path | Git blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `80d0b8fa1b19b8a39e4d4e7cae84e4f39e2e14a0` | `147e2cba893d26057c0b1b758518c10a958fe6c7657dd0004392c3626c7cf7da` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v15.md` | `a76f485ed641acce6e37fea78d03f07751155e4f` | `2ece72171172b39dcbbeec9e946a192ff3dfa93488eca8b4b8571de581f19ef4` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v15.md` | `3cf2e7edc62671ffd9629e6a5290405f6aa300cb` | `9267e45aabd3b3ee149412dfb7bed8122ef374ae034aa722464511ee78b20129` |

The committed v15 program was 125,240 bytes, SHA-256 `9b1e60ec4cdc213766def99ea946f9714aa27fa5c7608dfcbf8b306f411ea469`, Git blob `07a5b98172431f58203a1cda8072d2f5158ab031`. Its no-hardlink shadow passed exact 39→32→20 with six full paper scans in three stable pairs. Two later real immutable paper-scan invocations independently returned rc 0, empty stderr, zero independent-claim hits, and the exact two preserved-failure states, but their raw stdout differed:

| invocation | bytes | SHA-256 |
|---|---:|---|
| v15 scan 1 | 7,842 | `ef7180f34d8cb1777eba1a67ca2cbb85515b08f87eb6e4a768258c09f0335ac1` |
| v15 scan 2 | 7,842 | `4952115f6ae814d1767d953f13dfd9af164f84f0d5f8dc4f22ec813427e7905d` |

Only `worktree_evidence_sha256` differed. A preserved read-only diagnostic localized unrelated non-claim Markdown drift in the consent-UI worktree; the registered root set also later changed. V15 therefore stopped without acceptance retry, candidate, receipt, admission branch, or admission worktree. Both raw scans, the diagnostic, the v14 fatal evidence, both failed v10/v11 worktrees, and every older failed/rejected artifact remain append-only.

## 2. Complete scan and bounded stable-pair law

Every base, positive derive, positive candidate validation, positive result validation, and independent reviewer invocation performs a complete security scan. A complete scan is one `fix09-complete-security-scan/v1` transcript containing:

1. one `fix09-paper/v4` paper envelope over all ref-tip Markdown and all registered-worktree tracked plus nonignored-untracked Markdown under the exact closed `WORKTREE_MARKDOWN_REQUEST`;
2. reachable-object `0064` collision view;
3. reachable-history `0064` collision view;
4. all-ref-tip-tree `0064` collision view;
5. all-registered-worktree tracked `0064` collision view; and
6. all-registered-worktree nonignored-untracked `0064` collision view.

Each invocation applies the inherited maximum three complete pairs / six complete scans. Both scans in the accepted pair must be byte-identical complete transcripts. A change between individually lawful complete snapshots discards the entire pair and restarts from no carried evidence. `FIX09_PAPER_UNSTABLE` is the only retry class. A late symlink, hardlink, wrong type, permission/path/registry/UTF-8/parse failure, authority/dependency/program/policy mismatch, independent claim, or any nonzero collision view is immediately fatal. Exhaustion is exactly `FIX09_PAPER_RETRY_EXHAUSTED`; no mismatch is accepted.

The exact accepted/exhausted/fatal safe-integer retry equations and the literal fatal-code set remain executable. Complete-scan validation precedes projection. Projection cannot turn a fatal transcript into a passing one.

## 3. Raw transcript sealing

The accepted raw transcript from every invocation remains first-class evidence. It is canonical JSON plus LF, retained separately, and reported with exact byte length and SHA-256:

- base: t0-039 stdout inside the sealed 39-command manifest;
- derive: `fix09-task0-v16-derive-security-scan.json`;
- positive candidate validation: `fix09-task0-v16-candidate-security-scan.json`;
- positive result validation: `fix09-task0-v16-result-security-scan.json`;
- each independent reviewer: its own separately named ignored evidence.

Every standalone scan file is created exclusively, fsynced, atomically renamed, directory-fsynced, mode `0400`, regular, nonsymlink, single-link, and canonical-path checked before reuse. A projection is always recomputed from its validated raw transcript. A raw transcript never contains a caller-supplied or trusted projection. Neither raw transcript is overwritten, discarded, or replaced by its projection.

## 4. Exact security projection

After and only after full raw validation, each transcript deterministically yields `fix09-security-projection/v1`. Its complete field list is:

| field | exact bound value |
|---|---|
| `schema`, `domain` | `fix09-security-projection/v1` |
| `complete_scan_schema` | `fix09-complete-security-scan/v1` |
| `paper_schema` | `fix09-paper/v4` |
| `scope` | full frozen `SCOPE`, including claim, exclusions, paper, regex, tracked, and untracked lists |
| `authority` | actual v16 authority commit, parent `c825d75d…`, tree, exact three-document digest, and exact authority/allow digest |
| `program` | actual materialized program byte length, SHA-256, and Git blob |
| `worktree_request` | exact frozen `fix09-worktree-markdown-request/v1` object |
| `historical` | exact historical path and line SHA-256 `5ed8a3e7…` |
| `fix10` | v9 ref/parent/tree, three document pins, four allow tuples, review blob/SHA/verdict |
| `preserved_failure` | exact two policy rows with all eleven fields, exact two live rows with all seven fields, and `preserved_claim_hits="2"` |
| `collision_hits` | exact five named counts, all `"0"` |
| `independent_claim_hits`, `matches` | exactly `"0"`, `[]` |

The projection digest is SHA-256 over ASCII `fix09-security-projection/v1`, NUL, and the canonical projection bytes. Candidate field `migration_collision_evidence_sha256` is this digest. A later positive stage succeeds only if its independently recomputed projection is byte-identical to the base projection. Hostile candidate/result mutations reuse the sealed accepted digest and cheap immutable/live Git/topology anchors; they do not repeat a full scan.

Cross-invocation comparison excludes only these ambient, non-decision observations: unrelated ref/worktree enumeration sets and counts; unrelated Markdown document counts; unrelated content/metadata/enumeration digests; and raw collision-command byte counts/hashes when their validated match counts remain zero. Registered root-count drift is allowed. Preserved policy cardinality and live-state cardinality remain exactly two and are never excluded.

Any new `0064` token, allowed-authority document mutation, preserved tuple/state/count drift, FIX-10 dependency drift, historical pin drift, nonzero collision hit, scope/request/schema change, authority commit/tree/docs/allow change, or program byte/SHA/blob change changes or invalidates the projection and fails closed with its literal cause. Scanner or policy changes necessarily change the program or authority-document binding.

## 5. Fixed dependency and preserved failure

FIX-10 authority remains exactly approved v9 commit `a539ba114bd80e9234c08ba77c75772d0d111d94`, parent `e3f613efbad63ffdc72b3494143c45583e3738f9`, tree `5012c7a196d6977af41a888817b336b4248605e9`, its exact SPEC-v9/PLAN-v9/DECISIONS blobs and hashes, and review blob `b9b52407e4978ea78bf354df3d3ca33f2f154418` / SHA-256 `637f707109790d9799016dd2ba440d4974819367a1bb0fd1ddae0d8654d5006b` with zero-finding PASS verdict. The four-entry FIX-10 allow remains distinct from the two-row preserved-failure policy.

Both v15 preserved-failure rows remain byte-identical and fully bound: all eleven policy fields, all seven live-state fields, exactly two observed entries, and exactly two preserved claim hits. No wildcard, prefix, branch family, owner family, stale-document family, or generic dependency/historical exception exists.

## 6. Deterministic proof

Before review, the exact program must prove:

- unrelated non-claim document/content/metadata/enumeration/root-set drift produces different raw byte lengths/hashes but the same security projection;
- twenty-one hostiles fail: new claim; allowed-document mutation; preserved policy/live/count drift; dependency drift; all five collision views; authority commit/docs; program byte length/SHA/blob; request; scope; paper schema; complete schema; historical pin;
- stable, transient mismatch, persistent exhaustion, first-scan fatal, second-scan fatal, reset omission, equality omission, hostile-scan amplification, late type/link, and fabricated fatal-code cases retain their inherited exact outcomes;
- exact 39→32→20 and the corrected 16-file/118-name C3.5 projection remain unchanged.

The disposable no-hardlink shadow must retain all three raw accepted transcripts, compare their independently recomputed projections, report each raw byte length/SHA, and prove six full scans / three pairs in contexts `[base,derive,candidate-positive]`. Real acceptance later requires two separately invoked complete bounded scans, each internally stable; their raw hashes may differ, but their independently recomputed projections must be byte-identical.

## 7. STOP boundary

This authority round creates only `SPEC-v16.md`, `PLAN-v16.md`, and one appended FIX-09 decision row. It creates no Task 0 identity, product/test/migration/native source or binary, admission branch/worktree/receipt, live key, database, service, V, merge, push, board, acceptance, or Done act.

Task 0 remains STOP until a fresh independent zero-finding review approves the committed v16 authority and the exact no-hardlink shadow passes. C3.5 remains STOP until a future real v16 Task 0 candidate and result each receive their separately required independent acceptance. All v15 architecture, exact 33-path implementation ledger, native signer/session, generation-scoped delivery adapter, ChainedOccurrenceInput materializer, SQL probe, package/export, C3.5 projection, and FIX-10 v9 laws remain unchanged.
