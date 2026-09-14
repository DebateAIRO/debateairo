# FIX-04 C1 — fresh independent Sol review

Date: 2026-09-05

Review range: `34ebf866f7801d9620ee56f14f548b220b6ad442..6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`

Controller authority inspected at: `65b6778d3a636b5bbc9e7bba03cef6c32737f069`

Scope: FIX-04 C1 only. This review inspected the current FIX-04 SPEC-v2, corrected PLAN-v2 Task 2, DECISIONS, authority report/review, admission receipt/review, implementation report, exact commit range, and exact committed test source. It performed read-only repository checks, focused tests, and in-memory adversarial controls. This report is the only review write. It does not assess or implement C2/C3, change product/specification/plan/test/Git metadata, merge, push, act on services or production, execute V acceptance, exercise a veto, or claim FIX-04 Done.

## Verdicts

- **SPEC-v2: PASS.** C1 satisfies the authorized immutable per-slice zone-delta contract and the one-test-file write boundary.
- **CODE QUALITY: PASS.** The committed test is byte-for-byte the current PLAN-v2 Task-2 source, is narrowly scoped, fails closed on admission identity, and exercises the required semantic controls without zone-file custody.
- **C1: PASS.** No rework is required for C1 at tip `6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`.

## Findings by priority

- P0: none.
- P1: none.
- P2: none.
- P3: none.

## Immutable commit and scope evidence

- The admitted base is commit `34ebf866f7801d9620ee56f14f548b220b6ad442`, with exactly the ordered parents `d935aad03aa56e752016011c57a81c5d33d27680` then `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`, and subject `chore(obs): compose FIX-04 reviewed dependencies`.
- Tip `6d55ed4c5e3e8fef20b93ed91850cdd1766eac12` is a commit with exactly one parent, the admitted base, and exact subject `test(api): FIX-04 C1 — pin immutable zone delta`.
- Both the direct tip delta and the admitted-base-to-tip range contain exactly one added repository-root path, `dialectical-engine/tests/architecture/fix04-zone-region.test.ts`; the package-relative path is exactly `tests/architecture/fix04-zone-region.test.ts`. Range diff-check passes.
- The admitted base is the exact merge base and an ancestor of the tip. Both objects retain API blob `174ee8ff60461eb4f5aa233441b0367bb3d174b7`.

## Source fidelity and custody

- The committed C1 source is byte-for-byte the TypeScript block at current PLAN-v2 Task 2 lines 490-600. Both have SHA-256 `52a693cfee318e5ec9c5247e88ef9e6970129341f82d833bdf29fb6bd461fcb2`.
- Imports are limited to Node built-ins, Vitest, and `../support/zone-boundary.js`. The only worktree file read is `readFileSync(indexPath, "utf8")`, where `indexPath` is the API index. The immutable side is loaded only with `git show <explicit-base>:dialectical-engine/apps/api/src/index.ts` after exact topology, subject, and blob attestation.
- The source contains exactly two `readFileSync` tokens—the import and the single permitted call—and no `statSync`, `lstatSync`, `readdirSync`, `opendirSync`, `glob`, obs-capture zone path, zone module path, adjacent auth module path, broad inventory, or `assertZoneBoundaryIntact()` call.
- In-memory source-custody mutants were rejected: changing the Git-show target to the adjacent registration module produced `FIX04_SOURCE_FORBIDDEN_SURFACE`; changing the filesystem read target produced `FIX04_SOURCE_READ_TARGET_MISMATCH`. No live source was changed.

## Receipt and report evidence

- The controller-owned admission receipt has exactly eight physical lines, eight assignment lines, eight unique allowed keys, no blank/comment/extra line, and exact SHA-256 `ff09740af2abbdcfda3b0e9584820bec5d7bee30c083c1f1150859c0bb22de11`.
- Its base, ordered parents, authority/FIX-01 refs, API blob, `1653` bytes, and `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d` digest agree with immutable Git objects and independent semantic resolution.
- The implementation report contains exactly one full assignment each for `FIX04_BASE_REF=34ebf866f7801d9620ee56f14f548b220b6ad442` and `FIX04_TIP_REF=6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`. Its statements remain within the C1 claim boundary.

## Focused execution evidence

- The complete eight-case invalid-input matrix ran three times per case: 24/24 invocations exited nonzero, named `matches the admitted immutable region to the worktree region`, reported exactly two executed tests, and contained the case-specific reason. Missing, short, and non-hex values produced `FIX04_BASE_REF_REQUIRED_FULL_SHA`; the nonexistent object produced `FIX04_BASE_REF_NOT_COMMIT`; predecessor, authority tip, FIX-01 tip, and stale S04 merge produced `FIX04_BASE_REF_TOPOLOGY_MISMATCH`.
- The admitted command ran three times: 3/3 exited zero with exactly two passing tests. Every run printed full base `34ebf866f7801d9620ee56f14f548b220b6ad442`, base/work bytes `1653/1653`, and fixed base/work SHA-256 `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.
- Independent semantic execution confirmed that an inserted in-region space changes the digest to `fc7ce6bed3497d1de1aa373fd6fee588b451947315bdc58c148455b297931031` and bytes to `1654`; forty leading newlines preserve the exact 1,653-byte region and digest; and actual removal of the register mount is rejected with `ZONE_BOUNDARY_UNRESOLVED: registration block does not contain exactly the ruled mounts and dispatches`.

## Adversarial and path-custody evidence

- Same-bytes stale ref: `3e91cf4222767d1eafc2c1dde8d336f87b8fc448` independently resolves to the same 1,653 bytes and fixed digest, yet all three focused invocations reject it by topology. Admission identity therefore does not collapse to byte equality.
- Wrong parent order: the in-memory topology string with reviewed FIX-01 first and authority second is rejected with `FIX04_BASE_REF_TOPOLOGY_MISMATCH`.
- Zero-test/vacuity: an in-memory failed-output fixture containing the intended name and reason but `Tests 0 passed (0)` is rejected by the executed-test-count gate.
- Corrected Step 4: the exact repository-root status `?? dialectical-engine/tests/architecture/fix04-zone-region.test.ts` with package prefix `dialectical-engine/` normalizes to exactly `?? tests/architecture/fix04-zone-region.test.ts`. An in-memory second untracked path is rejected with `FIX04_PRESTAGE_PATH_SET_MISMATCH`; a wrong prefix is rejected with `FIX04_C1_PACKAGE_PREFIX_MISMATCH`.
- Post-commit dual-domain readback reports exactly the one added root path and the one package-relative path, and the lane index and tracked worktree delta are empty.

## Product hold and claim boundary

C2/C3 was not assessed or implemented. The existing ABI blocker remains: at reviewed endpoint `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`, `emit.ts=decdbb7be2cfeec8c24514058f355981f4bf484f`, `redactor.ts=0ffff01c90f996573a7c97f5817c7d3f775b8cd9`, and `runtime/index.ts=73a77fee4d66c9dd66b36b7ee0590c4ee5846bbf`. `emit()` and `captureHandled()` return `void`; source-event identity is generated privately; and no safe per-event `component.route_template` projection exists. Product work still requires separate V-approved ABI authority.

## Hygiene at the pre-write boundary

- Lane branch and HEAD were exactly `slice/oa-fix-04` and `6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`; index and tracked worktree delta were empty; the sole untracked path was the normal implementation report.
- Controller branch and HEAD were exactly `codex/fixagent-plan` and `65b6778d3a636b5bbc9e7bba03cef6c32737f069`; its index was empty. Its sole tracked unstaged path remained the pre-existing FIX-07 DECISIONS delta with working-file SHA-256 `f9b139ea3818820e4bdaa4c23ee08e5667a155f8e3112b23832d358b7a0f481d` and binary-diff SHA-256 `b6c374428dcfb5926290a269fe821ce2235896861cf936a20a869cd9b94b09f9`; its 18 unrelated untracked paths were untouched.
- Fresh post-write verification must retain the exact branch/HEAD/index/tracked states above, preserve the raw controller porcelain SHA-256 `e7b688bfdb1500642517c54e6691b90bfd9e7884fc1b488ed714115853ed258f`, and show exactly the implementation and this normal review report as lane untracked paths.
