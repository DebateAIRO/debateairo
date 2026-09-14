# FIX-09 C3.5/C4 — closed base-evidence shape

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v24.md` byte-immutably. It changes only the deterministic evidence-shape contradiction that stopped v24 derive. V24's bounded-memory streaming parser, retained-fd workers, complete semantic validation, receipts, security decisions, and every other inherited law remain exact.

## 1. Frozen v24 and proven cause

The direct predecessor is commit `6ebb2a1be0012a5d7f4f62b2be10652014448cd1`, parent `744ecf93572562c6b84305a3de7a6e1a841250ed`, tree `542ad4bc1584fc9c3f8a43fd063612f55bbee329`, subject `docs(obs): stream-validate FIX-09 v24 raw scans`. Its exact documents are DECISIONS blob `7da2499e7f624e1197cc28928946d743deba8da8` / SHA-256 `c35cd1ec4dd298677b67f2fc6ecfa295480ca0633eed879871a0da3e33570c4b`, PLAN-v24 blob `9e36fd0a4826715cce69ae7e4df5174e3ba03c98` / SHA-256 `1ffc4a35a9b6d3e23d2c953ee2f779c64b932eae74e8eea6ef2753047e852963`, and SPEC-v24 blob `e2ba21cae4ea18a4d7ea896a451010f6e65e9b93` / SHA-256 `0552cb31f6cbde37ab9407f648071b8a5c5cc5eedbde12066532916af9d53946`.

V24 safe/postcommit gates passed. Its sole canonical token `b2119bd4` stopped rc 2 at derive. Stdout was empty; stderr was exact 44-byte `FIX09_SHADOW_FATAL code=FIX09_SHADOW_DERIVE\n`, SHA-256 `39d16f5685b933cf6baaee6fda23601c58ded2d5c236735800a1be5206c24743`. No retry, real scan, or Task 0 followed.

A read-only diagnostic over preserved production artifacts proved the exact cause. `baseSecurityEvidenceV24` returned a validated evidence object flattened together with `collision_counts`. `freshCollisionGateV24` passed that value to `sameProjectionEvidenceV24`, whose closed `validateEvidenceShapeV24` rejects the extra key with `FIX09_SECURITY_TRANSCRIPT`. The stack was `validateEvidenceShapeV24 → sameProjectionEvidenceV24 → freshCollisionGateV24 → derive`. This is deterministic and unrelated to the v24 parser: exact base, derive, and candidate-positive 358.9 MB pairs each passed full semantic retained-fd validation with identical projection/security digests.

## 2. V25 correction and identity

The subject is exactly `docs(obs): close FIX-09 v25 base evidence shape`. T0-002 binds `6ebb2a1be0012a5d7f4f62b2be10652014448cd1`. The exact program is 243,004 bytes, SHA-256 `5eec3ebc8c9fa71b2605f98a42b206fa5b1715f74147a076fe3ff1fdbf3a4ab0`, Git blob `2d37fabf7906a09ce1d9b40b950627178141bfc5`; runner 23,746 bytes, SHA-256 `7adb45e82d2dbb67600bc875e9a264011a27e164894d697acd4ee57a92699319`, Git blob `e8ad8c99676224cd67c6af83a7f535883ed187ee`.

`baseSecurityEvidenceV25` returns exactly `{collision_counts,evidence}`. The nested evidence is the unchanged exact `fix09-validated-pair-evidence/v1` value and is the only value passed to projection/evidence validators. Collision counts stay separate, receive their own closed nine-key schema and zero-hit checks, and alone populate `migration_collision_counts`. Derive binds `migration_collision_evidence_sha256` to the nested evidence's pair-manifest digest.

The production-shaped RED/GREEN fixture kills v24's flattened value plus missing/extra wrapper, evidence, and collision keys: `FIX09_V25_BASE_EVIDENCE_SHAPE_FIXTURES_PASS positive=1 hostile=6`. With the correction injected into the preserved full path, derive produced an exact 5,629-byte candidate receipt (SHA-256 `37bf2810585d188ae0f8f96e7159416c86c3311822c367cc3ac4b3d8edd90f4d`) binding derive digest `8bb44885b5210fc8156cfa618de24b137547d9a7d94851ff9191ea54012cb7e6`, and positive candidate validation returned `FIX09_CANDIDATE_PASS` against distinct candidate pair `8d345f89490ceb1aa47247d1689cb02cf89058365de1f6e84a6086dd962e671e`.

## 3. Execution boundary

Commit exactly SPEC-v25, PLAN-v25, and one decision row after all safe/static gates. Then immutable postcommit gates and one canonical v25 shadow are authorized. Stop without retry on failure. Only shadow PASS permits the two bounded real authority scans. Real Task 0 remains STOP on literal independent v25 review while reviews are held. No product/test/migration/native/key/database/service/V/merge/push/board/acceptance/Done act is authorized.
