# GUIDE_HARNESS_REVIEW7 — strict diagnostic attribution recheck

- Ticket/run: `t_421d66b7` / `163`
- Reviewer: `/root/baseline`; native reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean detached checkout)
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Harness digest: `66a56435d7e0c664a12429498b5929b8f308f6217951700c506361d18554e30a`
- Verdict: **PASS_BOUNDED_DIAGNOSTIC_SHAPE**

## GH6-R1 disposition — resolved

`controls.mjs:253-316` now validates raw and already projected diagnostics against one status-dependent schema before a `DIAGNOSTIC_PROJECTED` stage can exist. `assertGuideObservation` revalidates the diagnostic at line 354, so a caller cannot bypass the schema before attribution.

- `ATTRIBUTED_RECOVERY` and `ATTRIBUTED_REFUSAL` require a recognized allowlisted predicate/category, exactly one candidate and one valid record, and zero invalid, duplicate, and unmatched records.
- `ACCEPTED_DRAFT` requires a null category and five zero counts.
- `AMBIGUOUS` requires a null category, complete non-negative counts, and `candidateCount === validCount + invalidCount`.
- `NOT_APPLICABLE` retains its public `candidateCount` while category and the four inapplicable fixed counts remain null.

Missing attributed records, unknown predicates, missing counts, and non-integer counts throw `GUIDE_HARNESS_DIAGNOSTIC_INVALID`. The real staged consumer catches that error, preserves the preceding `DOM_PROJECTED` checkpoint with API/DOM equality, keeps diagnostic null, adds the closed code, and leaves completed rows unchanged. Unknown predicates and malformed values are absent from the persisted record.

The five new controls at `verify-guide-harness.mjs:719-783` exercise the actual staged consumer for missing record, unknown predicate, missing/non-integer counts, valid accepted/attributed/ambiguous shapes, and legitimate `NOT_APPLICABLE` nullability. The earlier all-null diagnostic negative remains retained.

## Retained PASS dispositions

- **Staged custody and accounting:** canonical attempt and safe public API data are checkpointed before later session, DOM, or diagnostic work. Session-version, missing/read-invalid DOM, diagnostic throw/invalidity, and result assertions retain the last safe phase with closed codes. Missing stages do not invent equality or attribution. Attempted and completed rows remain separate.
- **Privacy:** only canonical public row/proof fields, public HTTP status/outcome/text/sources/actions, rendered public fields, completed equality, fixed validated diagnostic fields, and closed codes persist. Raw/rejected drafts, private/extra fields, headers, cookies, session identities, capabilities, credentials, attempt IDs, raw runtime bytes, and thrown details remain excluded.
- **Matrix and product contract:** the 54-row matrix and pre-request verifier are byte-identical to FIX5/FIX6. Rows 7/8 retain required `app-navigation`, optional `browse-public-debates` in either order, exact `app-navigation` recovery, and negative-set rejection. Product-owned policy and `selectSupportRecoveryEntry` remain authoritative at unchanged clean `0b9320ea...`; the Romanian alias correction did not alter source sets or harness expectations.
- **Custody:** all 124 indexed inputs matched hash and byte count. The recomputed ordered-eight digest equals `66a56435...`; the schema-2 proof binds exact product, KB, digest, and 105 unique passing names. All 100 FIX6 names are retained. The copied adapter pins the full digest before import and at constructor equality; its retained mutation negative is 3/3 with zero importer calls and zero successful rows.
- **Namespace and operational bounds:** GUIDE7 receipt, screenshots, and browser profile remain absent. Five groups, 31-second pacing, 42-model ceiling, 120-second freshness, strict body/source/action gates, no retry, pointer/keyboard destination checks, and unresolved/actionless Forgot remain unchanged.

## Evidence and limits

This was a static changed-consumer review. The 105/105 harness frame and 3/3 adapter negative are retained author evidence, not a reviewer rerun. No harness, test, probe, browser, runtime, status, capacity, HTTP, database, Support, model, lifecycle, product, KB, or Git operation ran.

This PASS authorizes preparation of one fresh reviewed GUIDE7 gate and one instrumented capture when capacity is naturally available. It does not authorize resampling, establish current live usefulness, identify the old LIVE3 predicate or origin, accept CP1, or advance CP2. Forgot remains unresolved/actionless.
