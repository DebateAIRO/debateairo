# FIX-09 C3.5/C4 — component-canonical pair replay

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v22.md` without changing their bytes. It corrects only v22's whole-pair replay allocation and runner summary allocation. Every complete raw scan, canonical pair byte, raw receipt, coherent captured-OID/worktree boundary, paper and five-collision rederivation, security projection, derive-bound candidate field, 39→32→20→17→3 ledger, C3.5 projection, and STOP law remains exact.

## 1. Frozen v22 authority and terminal evidence

The direct predecessor is commit `380b7389be61213cdfcc56000548102b4844fd72`, parent `524457b7aeef194403d604c2b70f984922a4ba66`, tree `27cefcf0eb9cb9ecc318795f96dd05d37e24b171`, subject `docs(obs): bind FIX-09 v22 validation evidence`. Its documents are DECISIONS blob `86de653827f57b96bb940fe010ad9473e7be14ae` / SHA-256 `28c06903b9f4f7411519ce738db08f4ba78d5833ef9e26284d1a9596501d34c1`, PLAN-v22 blob `3bd10d2b3fe4d490961e4f3b70fe270f16aaebf9` / SHA-256 `e323f774da0d8bc939feb4b1eda8aefd57e0d446bc3df04ae161906a2c5378e5`, and SPEC-v22 blob `4ceac7bf3472de228e4b2572758fde7ce163fbe3` / SHA-256 `63c62a7e8c7de757d14b4377d8727a31a6eb22806bc2b8be139b426a7150039a`.

V22 passed every pre/postcommit safe/static gate. Its sole canonical launcher token `f9cc4a53` stopped rc 2 after the 39-fact base capture, at derive. Stdout was empty. Stderr was the exact 44 bytes `FIX09_SHADOW_FATAL code=FIX09_SHADOW_DERIVE\n`, SHA-256 `39d16f5685b933cf6baaee6fda23601c58ded2d5c236735800a1be5206c24743`. The runner removed itself and its disposable root. No canonical retry, real authority scan, or Task 0 followed.

The failure is localized without another live diagnostic by immutable v22 control flow and already measured evidence. Replay first called `canonicalJson` on the approximately 359 MB pair, creating a whole-file UTF-8 string and a second whole-pair `stable(value)` string; `validatePairBundle` then rebuilt both approximately 180 MB raw transcripts; `pairEvidence` could rebuild the whole pair again. The runner later repeated whole-pair text/parse/stable for all three artifacts. V20/v21 evidence already proved the exact transcript scale and native string ceiling; v22's derive-only STOP proves the remaining allocation path was executable before any candidate mutation. Under the explicit instruction not to rerun a whole-repository diagnostic, v23 removes that source-proven allocation path and tests the production-shaped boundary through bounded adapters.

## 2. Exact v23 identity

The future subject is exactly `docs(obs): stream FIX-09 v23 pair replay`. T0-002 binds direct parent `380b7389be61213cdfcc56000548102b4844fd72`; t0-003, self-check, runner, and receipts use the same subject. `verifyPreviousAuthority` proves v22's exact graph and documents.

The exact Appendix C program is 231,991 bytes, SHA-256 `bf855bb109c51550556f9a8d28ddd2909969f85aa6534728ce4af212a34950a3`, Git blob `4335df2664d2531d0a2e6ba1da34c90c4c2b64f2`. The exact runner is 22,826 bytes, SHA-256 `1eaaa03c64c0040f2aac215e35c869bdd8ca83fc7f806ba6c3c441961ef46847`, Git blob `ebe91400592084716ff695ab9c058cc4158e1627`.

## 3. Component-canonical pair parser

Persisted pair bytes remain exactly `fix09-security-pair-bundle/v1` canonical JSON plus LF. The outer wire is a closed byte grammar with exact ordered keys and delimiters: canonical manifest, exactly two raw transcript objects, and exact schema suffix. A quote/escape/depth byte walker identifies the three component spans without decoding or rebuilding the whole file. It rejects malformed depth, raw control bytes in strings, missing/extra/reordered delimiters, truncation, trailing bytes, and wrong prefix/suffix.

The manifest and each raw transcript are independently decoded with fatal UTF-8, parsed, and compared to their own canonical serialization. No canonical component may equal or exceed the pair byte length. Each raw receipt is recomputed directly over its canonical component bytes plus the exact LF that defined the original raw seal; the pair file SHA is computed directly over its original bytes. Each raw transcript is then fully validated and rederived before its large parse/string becomes eligible for collection; only its small position, raw/projection/snapshot receipt, projection bytes, and second-scan collision counts survive. The two projections, manifest scans/trace/context/positions/receipts, raw-equality flag, and pair-manifest digest are validated exactly. There is no whole-pair `JSON.parse`, `stable`, reconstruction, or trust of stored receipts.

Manifest replay performs only the exact closed outer-envelope check while loading the sealed stream, then the base derive path performs the full component validation exactly once before discarding its large artifact reference. File replay returns only validated small evidence. Freshly collected pairs retain v22's exact 2 raw / 2 projection / 1 bundle serialization law.

## 4. Runner receipt boundary

The runner never decodes a large pair. It invokes exact `security-pair-receipt` once in a separate process for each base, derive, and candidate-positive pair. That mode performs full component validation and emits only a small canonical receipt containing pair bytes/hash/manifest digest, context, projection receipt, and both scan receipts. The runner requires contexts `[base,derive,candidate-positive]`, byte-identical projection receipts, and exact two scans per receipt before building the proof. This replaces seven redundant large validations/whole-pair materializations with three isolated sequential validations.

The bounded production-shaped fixture exercises the real envelope walker, component parser, complete validator, rederivers, raw/projection receipt construction, pair-manifest comparison, and original-byte hash. It proves one positive, nine wire hostiles, exactly two raw components, three canonical components, maximum component smaller than pair, and zero whole-pair rebuilds. Existing v22 validation fixture still proves 39→32→20→17→3, derive binding, four distinct pair identities, sixteen hostiles, exact 5/8 argv, and 2/2/1 fresh serialization.

## 5. Preserved security and execution boundary

All v22 authority/ref/registry/preserved start=end, captured-OID traversal, strict raw NUL/body/metadata replay, descriptor-stable reads, claims, five collision views, projection, retry trace, compact snapshot, pair paths, receipt schema, C3.5 16/118, 33-path and FIX-10-v9 shape-only laws remain unchanged. No ambient or security field is dropped.

Commit exactly SPEC-v23, PLAN-v23, and one decision row only after safe fixtures, syntax, exact fences, frozen predecessors, exact scope, empty index, and FIX07 preservation pass. Repeat immutable gates, then run one cryptorandom no-hardlinks canonical shadow. Stop without retry on failure. If it passes, run only the two bounded real authority-verification scans. Real Task 0 remains blocked on its literal fresh independent v23 authority review while reviews are held.

No product/test/migration/native/key/database/service/V/merge/push/board/acceptance/Done act is authorized.
