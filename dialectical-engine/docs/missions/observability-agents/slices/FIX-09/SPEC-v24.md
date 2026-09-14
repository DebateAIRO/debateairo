# FIX-09 C3.5/C4 — bounded-memory canonical raw replay

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v23.md` without changing their bytes. It corrects only v23's component-level canonical reserialization allocation. Every captured byte, complete semantic validation, paper and five collision rederivations, coherent boundary, receipt, projection, trace, 39→32→20→17→3 ledger, C3.5 projection, and STOP law remains exact.

## 1. Frozen v23 authority and failure

The direct predecessor is commit `744ecf93572562c6b84305a3de7a6e1a841250ed`, parent `380b7389be61213cdfcc56000548102b4844fd72`, tree `a1c23e41602e0b193c68ee297f37bf1bbb9b405a`, subject `docs(obs): stream FIX-09 v23 pair replay`. Its documents are DECISIONS blob `8834d520fa884df436536bb63121d5bd478c2dc7` / SHA-256 `ce00ac9694b23f16dbe681d6ef0cec21d981f208f3a759001c142d2f0cb47dad`, PLAN-v23 blob `4d282254d306f828d84e60afd456aabfb7c1d0fb` / SHA-256 `57e84df653aff557185f8f7cba1d4961b2353180b40f564097b56719386066b6`, and SPEC-v23 blob `efff3acbce607cdecf8da59c9effea09425be053` / SHA-256 `74d1ceb9a8ae27df6803905b3aa05945612c6db982cf1553f5f393cc0dfa0dd4`.

V23 passed all safe/static gates. Its only canonical token `17a08839` stopped rc 2 at derive, with empty stdout and exact 44-byte stderr `FIX09_SHADOW_FATAL code=FIX09_SHADOW_DERIVE\n`, SHA-256 `39d16f5685b933cf6baaee6fda23601c58ded2d5c236735800a1be5206c24743`. It was not retried and no real scan or Task 0 followed.

The preserved v21 358,925,994-byte pair proved the root cause without another repository scan. V23 parsing each raw component still called `stable(value)`: after raw 1 RSS was about 1.64 GB; after raw 2 RSS about 1.98 GB and heap about 2.35 GB. The byte parser alone validated both exact 179,461,539-byte raws in 3.39 seconds with maximum RSS 821,051,392 bytes, maximum JSON depth 9, and 238,763 nodes per raw. The complete semantic replay, isolated one raw per retained-fd child, passed in 68.55 seconds under `--max-old-space-size=1536`; maximum child RSS was 1,675,018,240 bytes and parent peak footprint 376,785,104 bytes. V24 therefore fixes a strict ceiling of 1,800,000,000 bytes maximum per-process RSS and 1,536 MiB V8 heap for this measured 358,925,994-byte input. Both raws produced security digest `e16d7666015233e35fee6d7e16a4bc99336de1162bea0041dab9484715f37e93`, projection SHA-256 `c9b8a96de1678bd90948ba7ac9b6a2a17466684072b1d4cff25f35d1ebeeb630`, pair-manifest SHA-256 `8bb44885b5210fc8156cfa618de24b137547d9a7d94851ff9191ea54012cb7e6`, and exact pair SHA-256 `998ccce12ccf9c4ae41d3c733dd69ac8d07286bdbbc8b3fda977937ff8567c7f`.

## 2. Exact v24 identity

The exact subject is `docs(obs): stream-validate FIX-09 v24 raw scans`. T0-002 binds direct parent `744ecf93572562c6b84305a3de7a6e1a841250ed`; t0-003, self-check, runner, and receipt laws use that same subject. The exact Appendix C program is 240,516 bytes, SHA-256 `a8c2149e7efa1a565c24c9a84501760968423ef4e245bc954be98d1eae649c86`, Git blob `cf4577648f8221138733fc1f3445b90507ff6c33`. The exact runner is 23,746 bytes, SHA-256 `0e03a664d290fdf419ff284dbc7cd72b3227adb29102d377cf3b6a7252772137`, Git blob `4979c50356855cbb5f89862e705417e4156944d3`.

## 3. Streaming canonical grammar

The pair envelope and bytes are unchanged. Before `JSON.parse`, each manifest/raw component is validated directly over its existing Buffer span by a closed no-whitespace canonical JSON grammar. It admits only objects, arrays, strings, true, false, and null; transcript numeric counters remain canonical decimal strings. Object keys must be strictly increasing under the same JavaScript UTF-16 order used by `stable`; duplicate or reordered keys fail. Each string token receives fatal UTF-8 decode, JSON parse, and exact `JSON.stringify` roundtrip, killing noncanonical slash/Unicode/control escapes. Maximum nesting depth is 64; the measured production maximum is 9. Missing delimiters, raw controls, malformed UTF-8, numbers, trailing bytes, and over-depth input fail closed.

Persisted-file validation opens the exact regular, single-link, mode-0400 path once with O_NOFOLLOW/O_NONBLOCK and retains that descriptor. The parent validates and hashes the closed pair envelope, then invokes exactly two sequential copies of the same pinned program with that descriptor inherited as fd 3 and only canonical offset/length/authority arguments. A child cannot accept a path; it fstats fd 3, reads exactly one bounded span, performs byte-canonical plus unchanged complete semantic validation/rederivation, and emits only a small canonical receipt. The parent validates both receipts, trace, positions, projections, raw equality, manifest bindings, and unchanged pre/post fd/path identity before close. Thus no process retains two parsed raws, and no path reopen/race or general read mode is introduced.

The whole raw object is never canonically rebuilt. Only small receipt/projection/position/collision data survives to the next component. Pair receipts remain hashes of the exact original component+LF and original pair bytes. The runner's t0-039 parser also performs only the closed outer-envelope walk; the separate authority program remains the mandatory complete validator.

The bounded fixture proves four positives, twelve canonical-grammar hostiles, 64-depth ceiling, and zero whole-value canonical reserializations. Pair-wire, semantic-validation, derive binding, raw/projection/bundle serialization, and all inherited hostile fixtures remain mandatory.

## 4. Execution boundary

Commit exactly SPEC-v24, PLAN-v24, and one decision row after safe/static verification. Run immutable postcommit gates and one cryptorandom no-hardlinks canonical shadow. Stop without retry on any failure. Only after shadow PASS may the two exact bounded authority-verification scans run. Real Task 0 remains blocked on its literal fresh independent v24 authority review while reviews are held.

No product/test/migration/native/key/database/service/V/merge/push/board/acceptance/Done act is authorized.
