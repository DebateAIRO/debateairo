# GUIDE_CORRECTNESS5 — composed public-guide correctness recheck

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_fbbc6b8b`  
**Revision:** `f3be0af81f1691db6c23494f9e286bb6b10f13bf`  
**Delta base:** `c8784902f78ed4ba1d637d122e1f32f598415f4e`  
**Verdict:** **PASS for the finite five-path correction**

## Finding dispositions

- **B1 — RESOLVED.** The correction replaces the partial manual action vocabulary with the closed bilingual `SUPPORT_GUIDE_LABELS` authority, which binds labels to reviewed articles and optional closed actions (`packages/support-kb/src/catalog.ts:95-159`). Exact label matches now contribute source evidence (`packages/support-kb/src/context.ts:299-332`) and action evidence can admit its containing capability before the final production-availability intersection (`packages/support-kb/src/context.ts:333-395`). The byte-identical 28-row discriminator passed all 16 supported-navigation rows with a nonempty reviewed source and the one exact expected action. This includes all thirteen action rows that failed at `c8784902`: New debate, Account, How it works, Sample debate, Public debates, Your debates, and Privacy in EN/RO. Parent/child selection returned `privacy-preferences`, not `settings`.
- **B2 — RESOLVED.** The exact Romanian prose-only label `Ce arată vizualizarea Fir?` now retrieves `debate-workspace-menus` and remains actionless. It passed both the preserved independent row and the authored direct assertion at `tests/unit/support-context.test.ts:517-526`.
- **Prior GUIDE_CORRECTNESS3 guard PASS — RETAINED.** Its seven defining paths remain outside this five-path delta. No guard matrix was rerun or relabeled.

## Independent discriminator

The probe is byte-identical to GUIDE_CORRECTNESS4 (SHA-256 `24a66dd53aba3ccba23119310ee6ce3576469b8b604de9b74f561f343e13bfb7`) and keeps every assertion unchanged. It uses the reviewed production corpus and production `resolveSupportActions` availability.

- Result: rc `0`; 28/28 rows passed; zero failures.
- Supported navigation: 16/16 had useful sources and the exact expected single action.
- Prose-only controls: 12/12 had useful sources and 12/12 remained actionless.
- The prose controls cover Pricing, Theme, Thread/Fir, Replay, Export, and the public-guide/human-case distinction in EN/RO.

## Changed-path checks

The three changed authored files passed at rc `0`: 3/3 test files and 183/183 tests. They include the 16 exact action-label rows, eight negated-unrelated-label context controls, the RO `Fir` source control, two EN/RO model-and-response sink controls, and catalog referential-integrity checks (`tests/unit/support-context.test.ts:463-526`; `tests/unit/support-answer-context.test.ts:231-262`; `tests/architecture/support-catalog-coverage.test.ts:108-123`).

Retained author evidence at the exact revision reports focused 391/391, exact33 1,661 passed plus one TODO, strict 44, inert 62/62, and a byte-identical 76-diagnostic baseline typecheck with zero mission additions. Structural evaluation remains 3 × 60/60 with rubric `PENDING`; this review does not convert that structural result into a live-quality verdict.

## Custody and cleanup

- Freeze `0c2d03b915a0e988024d73fc3e0e71c91379dc95`; freeze receipt SHA-256 `5e07d3be277935be18372028688bb119efb5d1036d9811dfc5d127cc9f15e820`.
- Custody passed: 66/66 indexed inputs and 143/143 product files in each lane; the delta exactly matches the five declared paths.
- Detached reviewer and frozen primary were clean and exact at `f3be0af81f1691db6c23494f9e286bb6b10f13bf` before execution and after cleanup.
- All five temporary dependency links are absent. The sole heavy lease was released before report packaging.

## Limits

No full 33-file suite, typecheck, strict/harness/evaluation frame, unbounded language sampling, actual HTTP/model/provider traffic, browser/DOM, or preview lifecycle was run here. The Forgot-password destination remains unresolved and actionless. This finite PASS is not a runtime/readiness, rubric-quality, checkpoint, owner-acceptance, or general language-completeness claim.

