# FIX-04 C1 implementation report

Date: 2026-09-05

Status: C1 implementation committed; pending fresh independent Sol review. Product C2/C3 remains held.

## Immutable receipt

FIX04_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
FIX04_BASE_REF=34ebf866f7801d9620ee56f14f548b220b6ad442
FIX04_BASE_PARENT_1=d935aad03aa56e752016011c57a81c5d33d27680
FIX04_BASE_PARENT_2=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
FIX04_API_BLOB=174ee8ff60461eb4f5aa233441b0367bb3d174b7
FIX04_ZONE_BYTES=1653
FIX04_ZONE_SHA256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d
FIX04_TIP_REF=6d55ed4c5e3e8fef20b93ed91850cdd1766eac12

The controller authority head was `65b6778d3a636b5bbc9e7bba03cef6c32737f069`. The admission receipt contained exactly eight unique assignment lines and retained SHA-256 `ff09740af2abbdcfda3b0e9584820bec5d7bee30c083c1f1150859c0bb22de11`. Git readback matched the exact two-parent admission topology, composition subject, API blob, and semantic-region evidence.

## C1 evidence

- The implementation file is verbatim PLAN-v2 Task 2 source. Its SHA-256 is `52a693cfee318e5ec9c5247e88ef9e6970129341f82d833bdf29fb6bd461fcb2`.
- The complete eight-case invalid-input matrix ran three times: 24 of 24 invocations exited nonzero, named the intended identity test, and reported exactly two executed tests. Missing, short, and non-hex inputs produced the required-full-SHA reason; the nonexistent object produced the not-commit reason; predecessor, authority-tip, FIX-01-tip, and stale-S04 inputs produced the topology-mismatch reason.
- The admitted focused command ran three times: 3 of 3 runs exited zero with exactly two passing tests. Every run printed base/work byte counts `1653/1653` and the fixed SHA-256 on both sides.
- Each admitted run exercised all three in-memory controls: a one-space edit inside the resolved region changed its content hash; forty leading newlines preserved the exact region and hash; changing the ruled register mount from POST to GET made resolution fail.
- Corrected pre-stage custody passed with the exact repository-root path and normalized package-relative path. The synthetic second-untracked state failed with `FIX04_PRESTAGE_PATH_SET_MISMATCH`; the wrong-prefix state failed with `FIX04_C1_PACKAGE_PREFIX_MISMATCH`.
- Source custody found exactly the built-in file-read import plus the one permitted API-index read. The test contains no zone-file path, metadata API, adjacent API module path, or broad source inventory.
- The pre-merge topology verifier exited zero: the admitted merge is the implementation tip's exact ancestor, and the tip has the fixed subject and one-path added-file delta.
- The post-commit focused smoke exited zero with one passing test file and exactly two passing tests, reproducing the `1653/1653` byte counts and fixed digest on both sides.

## Commit and scope

The implementation commit has subject `test(api): FIX-04 C1 — pin immutable zone delta` and adds exactly `dialectical-engine/tests/architecture/fix04-zone-region.test.ts` in the repository-root domain, corresponding to `tests/architecture/fix04-zone-region.test.ts` in the package domain. No product, capture-package, support-resolver, zone, C2/C3 test, controller, specification, plan, decision, receipt, or Git-configuration file was changed.

## Remaining product blocker

C2/C3 remains blocked at the reviewed capture ABI: `emit()` and `captureHandled()` return `void`; the redactor privately generates `source_event_ref` without accepting a caller value; and runtime construction has no safe per-event `component.route_template` projection. API-only product work cannot establish the required response-to-occurrence correlation or route-template persistence. A separately ratified narrow capture reservation/acknowledgement and safe route-template projection contract is still required before product work.

## Claim boundary

This report records only the local C1 guard, its immutable admission evidence, and its verification commands. It records no product requirement satisfaction, persisted-data proof, integration merge, push, service or production action, V acceptance or veto, or slice completion.
