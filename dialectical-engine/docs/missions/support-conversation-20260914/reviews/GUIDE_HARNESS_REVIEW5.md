# GUIDE_HARNESS_REVIEW5 — safe failed-response capture review

- Ticket/run: `t_6a1ee530` / `156`
- Reviewer: `/root/baseline`; native reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed product: `5731eb6faac25f9712f04aea029a021f6eee9352` (clean detached checkout)
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Harness digest: `238db0310eb2bdc34245f213f458c35e6e86a0e74efa669548ae3b5125138341`
- Verdict: **REWORK_BOUNDED**

## Blocking finding

### GH5-R1 — pre-assert failures can still erase the attempted public response

`capture-public-guide.mjs:247-270` obtains the response, waits on the session gate and assistant DOM, reads rendered content, projects the API body, reads the runtime-log window, and constructs the diagnostic before the first `failureObservation` checkpoint at lines 271-279. The outer catch at lines 342-346 records only a closed `failureCode`.

Consequently, a missing assistant element, rendered-reply read failure, runtime-log read/diagnostic-consumer failure, or strict observation-projection rejection still exits without the already-received safe public API projection and without a staged attempted-row record. This recreates the evidence-loss class for failures before `checkpointGuideObservation`. The control named `malformed failure observation is rejected before persistence` confirms rejection; it does not prove safe failure persistence. The 91/91 proof covers assertion failures after a complete API/DOM/diagnostic tuple, not these earlier consumer failures.

This is an evidence-harness defect. It does not establish a product defect or identify the predicate, response origin, or cause of the sealed LIVE3 sequence-7 failure.

## Minimum correction

In a new immutable harness namespace:

1. Create an allowlisted staged attempted-row projection immediately after `safeResponse` exists. It may use a closed phase enum and nullable not-yet-observed DOM/diagnostic/equality fields, but may retain only canonical row identity, sanitized public status/outcome/text/source/action values, and later fixed diagnostic values.
2. Update and checkpoint the same safe observation after DOM comparison and diagnostic construction. On any intervening failure, persist a phase-specific closed code while leaving the completed `rows` array unchanged.
3. Add discriminating inert controls through the capture consumer boundary for missing assistant DOM, rendered-reply failure, invalid or missing public response shape, diagnostic-consumer failure, and assertion failure. Prove the last safe stage survives, no attempted row enters `rows`, and raw drafts, private/extra fields, headers, cookies, session identities/capabilities/credentials, and runtime bytes cannot survive.
4. Recompute the ordered-eight digest and adapter pins, then bind the reviewed harness and canonical proof to the eventual exact clean product revision and KB version before any fresh live gate. Preserve one-shot execution and do not reinterpret or resample the unknown LIVE3 failure.

## Retained PASS dispositions

- **Complete-tuple predicate persistence:** `projectGuideFailureObservation` and `checkpointGuideObservation` checkpoint a fixed-key public projection before `assertGuideObservation`; assertion failures then add one closed code. API/DOM false equality and ambiguous fixed diagnostic counts are retained. `rows.push` remains after successful assertion, so attempted failures are not counted as completed rows.
- **Privacy projection:** canonical public row fields, branch, HTTP status, allowlisted outcome, final public text/sources/actions, rendered equivalents, equality, and fixed diagnostic status/category/counts are admitted. Extra/private properties, raw/rejected drafts, headers, session identifiers, capabilities, attempt IDs, and runtime bytes are omitted. Malformed strict inputs fail closed.
- **Source oracle at reviewed revision:** rows 7 and 8 require `app-navigation`, allow optional `browse-public-debates` in either order, require exact `app-navigation` recovery, and reject browse-only, empty, and unrelated sets. The verifier consumes product `SUPPORT_SOURCE_POLICIES`, `supportSourceIdsSatisfyPolicy`, `SupportKnowledgeContext.sourcePolicy`, and `selectSupportRecoveryEntry`; production recovery selects the declared ID by value. The other 52 contracts are retained by the indexed delta.
- **Custody and namespace:** all 128 indexed inputs matched hash and byte count. The recomputed ordered-eight digest equals `238db031...`; canonical schema-2 proof binds product `5731eb6f...`, KB `fd3c63e4...`, and 91 unique passing controls. The copied adapter verifies the full digest before import and constructor digest equality before row projection; its sealed negative reports importer calls 0 and successful rows 0. GUIDE5 receipt/screens/profile remain absent and cannot overwrite GUIDE2 partial evidence.
- **Operational safeguards:** five groups, 31-second start spacing, 42-model ceiling, 120-second capacity freshness, strict body/source/action gates, no retry, pointer/keyboard same-destination checks, and unresolved/actionless Forgot remain carried by exact hashed dependencies.

## Evidence precision and limits

The canonical 91-control evidence is `GUIDE_HARNESS_FIX5-control-proof.json` (`c5719c86...`). The artifact named `GUIDE_HARNESS_FIX5-controls-final.log` contains the separate 3/3 adapter-negative record; it must not be cited as the 91-control transcript. This naming mismatch does not invalidate the canonical schema-2 proof or its digest.

This static review ran no harness, test, browser, runtime, HTTP, database, Support, model, capacity, lifecycle, product, or Git operation. It makes no product usefulness, readiness, checkpoint, owner-acceptance, or CP2 claim. Article bytes and prior retained dispositions were consumed from frozen indexed evidence rather than re-reviewed. An independent product review has reported a separate revision-`5731` query-variant issue; any future capture must bind the later corrected clean revision rather than reuse this product binding.
