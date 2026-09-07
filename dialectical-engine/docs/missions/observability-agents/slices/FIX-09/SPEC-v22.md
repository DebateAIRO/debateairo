# FIX-09 C3.5/C4 — validation-evidence liveness and derive-binding correction

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v21.md` without changing their bytes. It corrects only the v21 positive-validation evidence binding, repeated large-transcript materialization, validation argv plumbing, and three pair-artifact path literals. Every coherent captured-OID scan, descriptor-stable worktree read, raw enumeration/body replay, paper and five-collision rederivation, security projection, pair manifest, 39→32→20→17→3 ledger, C3.5 projection, and fail-closed STOP law remains exact.

## 1. Frozen v21 authority and failure evidence

The direct predecessor is commit `524457b7aeef194403d604c2b70f984922a4ba66`, parent `b0205a2e45a112801652a078165ffda760bd0551`, tree `8342eb0b9d64e5a54628575aff8a91090d02bf6b`, subject `docs(obs): compact FIX-09 v21 security transcripts`. Its documents are DECISIONS blob `10058776fb06db27d25367485dab87a55cb1cb0e` / SHA-256 `63a423d639c6a83147714fc8fd991139b235b861bd0283a36b823eb157658adf`, PLAN-v21 blob `5f9e7f33d7e2caf596e70099828348ed03ea0d23` / SHA-256 `2d36e8fa35d3588375b5942949c90b1913f00ec2504066e00ebb5858a3f14746`, and SPEC-v21 blob `625a5defbc3411460f89f2027b841be1936529c2` / SHA-256 `fd0517fa05bb876724c677b76f40d460c8b25fc8b94a22af1446646b77fae6f7`.

V21 passed every safe/static gate. Its sole canonical launcher token `3b45dc39` and shadow token `be96c7c3` stopped rc 2 at t0-040. Stdout was empty. Stderr was the exact 51 bytes `FIX09_SHADOW_FATAL code=FIX09_SHADOW_STATUS_T0_040\n`, SHA-256 `133a2b42740a5721c54017c05b4673eee9d50088f45d7999b06e5c829f411858`. No v21 canonical retry, real authority scan, or Task 0 followed.

The preserved one-shot diagnostic token `fc0468a2` exposed the inner 39-byte stderr `FIX09_FATAL code=FIX09_COLLISION_COUNT\n`, SHA-256 `49c86d4a4f25665966f21a7f4455fd15f686e18a6802246eebd848c58562db84`. The derive pair was 358,925,994 bytes; the candidate-positive pair was 358,926,030 bytes. The candidate sealed derive manifest digest `8bb44885b5210fc8156cfa618de24b137547d9a7d94851ff9191ea54012cb7e6`; the fresh candidate manifest digest was correctly different, `8d345f89490ceb1aa47247d1689cb02cf89058365de1f6e84a6086dd962e671e`; all four independently derived projections were exactly `e16d7666015233e35fee6d7e16a4bc99336de1162bea0041dab9484715f37e93`, with all five collision counts zero. This proves the positive validator incorrectly substituted a context-specific fresh pair digest for the candidate's derive-bound evidence. Source tracing also proved that hostile candidate/result dispatch dropped the new fresh-pair positional argument and that the runner used `*-security-scan.json` while the program required `*-security-pair.json`.

## 2. Exact v22 authority identity

The future subject is exactly `docs(obs): bind FIX-09 v22 validation evidence`. T0-002 binds direct parent `524457b7aeef194403d604c2b70f984922a4ba66`; t0-003, self-check, runner, and receipts use that same subject. `verifyPreviousAuthority` proves v21's exact graph and document identity.

The exact Appendix C program is 222,554 bytes, SHA-256 `523dcae6173629ed517f40a26286723ee7c31b193588a5619971d0481e1b55c0`, Git blob `52cde3d3f750b1a86a015b02b9a49dedd338a56a`. The exact runner is 22,789 bytes, SHA-256 `c6c192ae941cf5f624bd688654bad4c60a403a0f080b9eed0283b0e9729e80fe`, Git blob `d0dc1a781127f80db34409516ac9a672e66549d7`.

## 3. Derive-bound candidate evidence

The candidate's `migration_collision_evidence_sha256` remains the exact accepted derive pair-manifest digest. Positive candidate and result validation MUST NOT replace it with the fresh context's pair digest. Each positive validator independently validates and seals three pair bundles: the base pair replayed from the base manifest, the persisted derive pair, and one newly collected candidate-positive or result-positive pair. It requires byte-identical canonical security projections for base↔derive and base↔fresh, authenticates the candidate field against the derive pair-manifest digest, and separately retains the distinct full pair-file bytes/hash, pair-manifest digest, projection bytes/hash/security digest, context, and collision counts. Any context, schema, byte/hash, projection, or derive-digest mismatch is fatal. Hostile receipt mutations reuse sealed evidence and cheap anchors and never run a fresh full scan.

## 4. Bounded serialization and exact paths

Within one bounded pair attempt, each validated raw transcript is canonically serialized exactly once, each security projection exactly once, and the pair bundle exactly once: metrics `raw=2, projection=2, bundle=1`. A WeakMap private cache reuses those immutable bytes and digests during same-process validation; it is not wire authority. Base replay validates the t0-039 pair once, extracts the small projection/manifest/collision evidence, and releases the large artifact/cache entry before the rest of derive. File replay keeps the original pair bytes and does not rebuild them merely to compute evidence.

The three exact persisted artifacts are `derive-security-pair.json`, `candidate-security-pair.json`, and `result-security-pair.json` in both program and runner. Candidate validation receives four path operands plus the mutant token; result validation receives seven path operands plus the mutant token. One closed argument mapper enforces exact arities 5 and 8 including `--mutant=...` before either positive or hostile dispatch, killing missing, shifted, and mismatched-mutant forms.

The production-shaped fixture proves exact 39 base facts, 32 candidate fields, 20 candidate outcomes, 17 result fields, three result outcomes, four distinct pair manifests, preserved derive binding, sixteen evidence hostiles, exact 5/8 call arity, and serialization 2/2/1. It exercises the actual evidence validator, bounded collector, pair validator, cache, serializer, ledger constructors, receipt parser, and validation dispatcher argument mapper through bounded abstract adapters.

## 5. Preserved boundary and execution

All v21 compact transcript, metadata uint64, Git row, no-touch, special-file, retry trace, raw replay, coherent snapshot, five-collision, paper, preserved-state, FIX-10-v9 shape-only, 16-file/118-name C3.5, 33-path, authority and STOP laws remain unchanged. No security decision field is omitted; raw pair bytes remain separately sealed even when projections match.

Before commit, require the v21 RED evidence, v22 GREEN fixtures, syntax, exact fences, frozen predecessors, exact three-path scope, empty index, and preserved FIX07 hash. Commit exactly SPEC-v22, PLAN-v22, and one decision row. Repeat immutable gates, then run one cryptorandom no-hardlinks canonical shadow. Stop without retry on failure. If it passes, run only the two bounded real authority-verification scans. Real Task 0 remains blocked on its literal fresh independent v22 authority review while reviews are held.

No product/test/migration/native/key/database/service/V/merge/push/board/acceptance/Done act is authorized.
