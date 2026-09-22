# GUIDE_HARNESS_REVIEW6 — staged observation recheck

- Ticket/run: `t_70110160` / `161`
- Reviewer: `/root/baseline`; native reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean detached checkout)
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Harness digest: `6444862b9d465565a5416cec763a92216a04eb042bafe833dab43135c00debd2`
- Verdict: **REWORK_BOUNDED_DIAGNOSTIC_SHAPE**

## Blocking finding

### GH6-R1 — a partially malformed attributed diagnostic can become successful attribution

`controls.mjs:248-263` validates only the diagnostic status and `candidateCount`. It converts a missing or malformed `record.predicate` to `category:null` and converts malformed `validCount`, `invalidCount`, `duplicateCount`, and `unmatchedCount` values to `null`. `assertGuideObservation` at lines 330-337 then declares `REVIEWED_FALLBACK` or `MODEL_REFUSAL` from only an attributed status plus `candidateCount === 1`.

A diagnostic such as `{status:"ATTRIBUTED_RECOVERY", candidateCount:1}` therefore projects as a completed `DIAGNOSTIC_PROJECTED` stage with null category/count fields. When the grounded API/source checks pass, it is accepted as successful reviewed recovery even though the producer record and fixed counts are missing. An unrecognized predicate or non-integer fixed count follows the same path. This violates the REVIEW6 requirement that missing or invalid diagnostic stages never be successfully attributed.

The added control at `verify-guide-harness.mjs:693-699` supplies only `null`. It proves complete absence is rejected but does not exercise the partially malformed attributed shapes that the projector admits.

## Minimum correction

In a new immutable harness namespace, change only the shared diagnostic projector and its actual-consumer controls:

1. Validate the status-dependent producer shape before returning `DIAGNOSTIC_PROJECTED`. `ATTRIBUTED_RECOVERY` and `ATTRIBUTED_REFUSAL` must require a recognized allowlisted predicate/category and every fixed count emitted by `consumeSupportDiagnosticWindow` as a non-negative safe integer. Reject missing records, unknown predicates, missing counts, and malformed counts with `GUIDE_HARNESS_DIAGNOSTIC_INVALID` while retaining the preceding `DOM_PROJECTED` safe checkpoint.
2. Apply the correct explicit schema for `ACCEPTED_DRAFT`, `AMBIGUOUS`, and deterministic `NOT_APPLICABLE`; keep unavailable fields null only where that producer status legitimately omits them. Do not fabricate equality or attribution.
3. Add actual `consumeGuideObservationStages` negatives for attributed status with missing record, unknown predicate, and missing/non-integer fixed counts. Prove each stops at the prior DOM stage, retains safe API/DOM/equality, records the closed diagnostic code, adds no completed row, and leaks no raw diagnostic fields.
4. Recompute the ordered-eight digest, canonical proof, and adapter pins. Keep product revision, KB, matrix, source policy, timing, and live-output absence unchanged.

## Retained PASS dispositions

- **Staged attempt custody:** the capture records attempted sequence/count before response handling. `consumeGuideObservationStages` checkpoints a strict canonical attempt on API-projection failure and checkpoints a validated public API projection before session-version, DOM, or diagnostic work.
- **Phase failures:** session-version, missing assistant DOM, rendered-reply read, DOM projection, diagnostic throw, complete absence, and later result assertion failures retain the last safe stage with a closed code. DOM equality and diagnostic attribution remain null before those stages complete. Completed `rows` and `completedRowCount` advance only after result predicates pass.
- **Privacy:** persisted stages admit canonical public row/proof fields, public HTTP status/outcome/text/sources/actions, rendered public fields, equality, and fixed diagnostic values. Raw/rejected drafts, private/extra fields, headers, cookies, session identities, capabilities, credentials, attempt IDs, and runtime bytes are stripped. Raw thrown messages do not survive.
- **Matrix and product binding:** the 54-row matrix and pre-request verifier are byte-identical to FIX5. Rows 7/8 retain required `app-navigation`, optional `browse-public-debates` in either order, exact `app-navigation` recovery, and rejection of missing/browse-only/unrelated sets. The verifier still consumes product `SUPPORT_SOURCE_POLICIES`, `supportSourceIdsSatisfyPolicy`, `SupportKnowledgeContext.sourcePolicy`, and `selectSupportRecoveryEntry` at exact product `0b9320ea...`; the Romanian alias correction did not loosen the matrix.
- **Custody:** all 125 indexed inputs matched hash and byte count. The recomputed ordered-eight digest is `6444862b...`; the schema-2 proof binds exact product, KB, digest, and 100 unique passing control names, including all 91 retained names. The copied adapter pins that digest before import and at constructor equality; its mutation negative remains 3/3 with zero importer calls and zero successful rows.
- **Namespace and safeguards:** GUIDE6 receipt/screens/profile remain absent. Five groups, 31-second pacing, 42-model ceiling, 120-second freshness, strict body/source/action gates, no retry, pointer/keyboard destination checks, and unresolved/actionless Forgot remain bound by exact retained bytes.

## Limits

This was a static consumer review. No harness, test, probe, browser, runtime, HTTP, database, Support, model, capacity, lifecycle, product, KB, or Git operation ran. The 100/100 and 3/3 results are retained author evidence, not a reviewer rerun. The sealed LIVE3 predicate, response origin, and cause remain unknown. This report makes no live usefulness, readiness, checkpoint, owner-acceptance, or CP2 claim.
