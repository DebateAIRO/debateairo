# GUIDE_HARNESS_FIX7 evidence

## Verdict

`PASS_INERT_STRICT_DIAGNOSTIC_SHAPE_SEPARATE_REVIEW_REQUIRED` at clean product revision `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` and KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`.

The ordered digest of the eight executable FIX7 harness files is `66a56435d7e0c664a12429498b5929b8f308f6217951700c506361d18554e30a`. The canonical schema-2 proof records 105/105 controls: all 100 FIX6 control names remain present, plus five controls for the reviewed status-dependent diagnostic contract. The copied row-proof adapter rejects a changed executable before dynamic import (3/3 controls, `importerCalls=0`, `successfulRows=0`) and parses successfully.

## GH6-R1 correction

Attributed recovery or refusal is projected only when the producer supplies a recognized predicate and all four non-negative fixed counts with the exact successful-attribution shape: one candidate, one valid record, and zero invalid, duplicate, or unmatched records. Missing records, unknown predicates, missing counts, and non-integer counts stop at the preceding `DOM_PROJECTED` checkpoint with `GUIDE_HARNESS_DIAGNOSTIC_INVALID`. They do not create diagnostic attribution or completed rows, and their raw values do not survive.

`ACCEPTED_DRAFT`, `AMBIGUOUS`, and `NOT_APPLICABLE` have explicit separate schemas. Accepted draft requires the producer's zero-count shape. Ambiguous requires complete non-negative counts consistent with candidate count and cannot carry an attributed category. Deterministic `NOT_APPLICABLE` preserves legitimate `null` projected counts and category while retaining its public candidate count. Downstream observation validation applies the same schema to raw and already projected diagnostics.

## Preserved contracts

- The exact 54-row matrix and pre-request verifier bytes are unchanged from FIX6.
- All staged API/DOM/privacy controls, source-policy and production fallback bindings, five sessions, 31-second pacing, 42-model ceiling, 120-second capacity freshness, strict 18-key gate, and no-retry rule remain intact.
- Product and KB bytes are unchanged. No expectation was weakened.
- The future GUIDE7 receipt, 54 screenshots, and browser profile remain absent.

## Verification and limits

- Harness controls: 105/105 PASS.
- Adapter mutation negative: 3/3 PASS; no import, successful row, or traffic.
- Adapter syntax: PASS.
- Traffic: zero browser, runtime, lifecycle, HTTP, status, capacity, database, Support, and model requests.

This is an inert harness correction. It does not construct a fresh live gate or run the 54-row capture. The prior LIVE3 predicate, response origin, and cause remain unknown. Forgot remains unresolved/actionless. Separate bounded review is required; no CP1 readiness, acceptance, or CP2 claim is made.

