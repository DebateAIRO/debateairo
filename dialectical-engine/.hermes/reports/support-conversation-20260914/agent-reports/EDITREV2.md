# EDITREV2 case file — CP1 exact-byte bilingual review pass 2

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `EDITREV2`, pass 2/3, ticket `t_fcd71150`, continuing reviewer session `/root/plan_review`, corrected content commit `bebbfa65217c24908cb60db4c40194304ff8d080`.

## Cause and result

The author changed only the four bytes identified in pass one. The human-case pair now states both shipped response targets and tells visitors to rely on the case receipt until the interface wording is aligned. The account-access pair now describes a required second verification step that accepts either an authenticator code or a saved unused recovery code. B1 and N1 are resolved without weakening credential guidance, guessing the Forgot password destination or adding owner ratification.

The remaining 32 article bytes from pass one and the catalog are unchanged. The 24 draft articles are therefore eligible for a single exact-byte editorial attestation covering the review continuity across both passes.

## Efficiency findings

- The correction manifest made pass two small: four before/after hashes, explicit finding IDs and one commit. This avoided repeating the broad factual audit.
- A future correction packet should include a machine-ready merged expected-hash list for every attested record. This pass reconstructed it by overlaying four corrected hashes onto the original 24-article manifest.
- The loader itself is the best schema validator. Parsing the finished JSON through `loadHelpCorpus` proves exact keys, dates, hashes, catalog digest and pair eligibility in one bounded check.
- The full-page Support SLA remains visibly inconsistent by design until its separately owned wording is aligned. Centralizing that promise would remove the need for explanatory knowledge copy and future re-review.

## Measurements and limitations

- Corrected hashes: 4/4 matched `EDITFIX1-manifest.json`.
- Unchanged original KB receipt hashes: 29/29 matched.
- Pass-one unchanged article bytes: 32/32 matched.
- Inventory: 36 files, 18 complete EN/RO pairs; 24 draft bytes remain unratified.
- Catalog canonical form: 6,655 UTF-8 bytes; SHA-256 `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe`.
- Visitor-body internal-path/reviewer/evidence leakage matches: 0.
- Heavy tests, builds, services, providers, databases and preview checks: 0.
- Runtime behavior, owner ratification and the exact Forgot password destination remain **UNVERIFIED**.
- Exact model-token usage is **UNAVAILABLE** from this harness.
