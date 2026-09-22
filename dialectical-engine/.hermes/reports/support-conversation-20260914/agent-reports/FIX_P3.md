# FIX_P3 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The recurring defect was boundary ownership, not a missing blacklist entry. Three parsers made local decisions with different notions of a boundary: the credential-value parser ended at every coordinator, the operation parser did not start a new group for several additive markers, and the path parser recognized roots only after a small prefix set. A fourth legacy regex then overrode the credential analyzer's deliberate benign-state exclusion. Each isolated rule looked conservative, but their composition left either residual sensitive text or an unsafe completion accepted at the final sink.

## Price paid

- The initial class RED required five unit files and exposed 52 failing cases. Expanding B2 from the witnessed `plus` samples to a generated additive class increased that to 66 failures; this was useful cost because it prevented a fourth keyword patch.
- The first implementation reached 335/337, then revealed two compatibility errors: Romanian `parola mea:` was supported only by the legacy fallback, and calling a canonicalizing path helper from inside a canonical-view loop changed the diagnostic predicate. Preserving that failed run made the causes reviewable instead of hiding them behind a rerun.
- One final 25-file frame executed 1081 tests once. The typecheck remained an inherited 76-diagnostic baseline and was byte-identical, so no time was spent trying to "fix" unrelated diagnostics.
- Token usage is UNAVAILABLE. The largest avoidable reasoning cost in earlier passes was treating transformed samples as individual strings instead of naming delimiter, coordinator, operation-group, and sink classes up front.

## What nearly went wrong

- I initially stopped at bare `and` correctly for the reported example but left the comma-coordinated form (`quartz, and ember`) governed by the older hard delimiter. The whole-class review prompt caught that before the final integrated run. The revised rule recognizes only a bounded benign follow-up; ambiguous coordinator tails remain owned by the value.
- Extending the path boundary with `:` caused the outer response-policy loop to observe an encoded URL through a nested canonicalization and report `PATH_OR_ROUTE` instead of `ENCODED_LINK_OR_PATH`. Splitting “this view has a path” from “any canonical view has a path” restored stable diagnostics.
- Removing the legacy regex exposed that `parola mea:` had depended on it because the shared connector required whitespace before punctuation. Fixing the analyzer, rather than retaining two competing redactors, removed the underlying ownership split.

## Dead ends avoided

- Adding only `plus` would have fixed the reviewer string while leaving `in addition`, `additionally`, `moreover`, `furthermore`, `în plus`, and `de asemenea` in the same defect class.
- Redacting everything after a credential label would prevent leakage but destroy ordinary recovery intent. The bounded independent-clause control preserves `and I need help` / `și am nevoie` while ambiguous tails fail closed.
- Screening only answer drafts would leave case summaries as a second unsafe sink. The same policy matrix now runs through both strict envelopes and through actual answer/summary service fixtures.
- Treating every percent sequence as benign would weaken the existing malformed structural-escape rule. `%5G` remains intentionally rejected; ordinary percentages remain accepted.

## Upgrades that make the next prompt more efficient

1. Give each security fix packet a generated class table with three columns: hostile transform, paired benign control, and actual sink. This turns “fix the sample” into a mechanical property from the first RED.
2. Keep one exported exact-view predicate and one bounded-canonical wrapper for transformed text. Call sites inside canonical loops must use the exact-view function, which prevents recursive normalization from changing attribution.
3. Make the credential analyzer the sole owner of labelled-value spans. Any fallback redactor must consume analyzer facts or operate only on a disjoint token shape.
4. Preserve one exact integrated-suite manifest and one inherited typecheck fingerprint. The author can run the affected matrix during development and the full manifest once at stable bytes.
5. Put the expected diagnostic category beside every security seed. An rc0 probe is insufficient; the probe should throw on residual fragments, acceptance mismatch, sink survival, or category drift.
6. A single future prompt can name: allowed paths, base revision, boundary classes, generated transforms, paired controls, exact sink fixtures, integrated manifest, and receipt schema. That is enough for one RED→GREEN author pass followed by an independent review, without rereading the historical package.

## Packet clarity

The packet correctly authorized whole classes, exact paths, final25 ownership, and the reused probe. Root's follow-up that B2 must extend beyond the witnessed `plus` keyword was materially useful and should be part of the initial packet template. The packet's instruction to run meaningful stable checks once appropriately superseded the older three-repeat worker default. No additional scope was required.
