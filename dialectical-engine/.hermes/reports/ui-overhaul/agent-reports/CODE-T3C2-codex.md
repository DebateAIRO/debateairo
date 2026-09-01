# CODE-T3C2 case file — t_1d7f74a9
1. Cause: the library chrome used title-case selectors and API aggregate totals instead of rendered-row counts.
2. Cause: the indexing warning lived inside `published.items.map`, multiplying disclosure by public-row count.
3. Cause: library rows lacked the shared T1 shell/core bezel vocabulary; a late audit also caught both layers flattened onto `--core`.
4. Change: recased selectors, derived `N TOTAL` from the selected rendered collection, moved one exact disclosure below the public list, and made shell/core fills distinct.
5. Migration: updated pda-s03 casing and exact `0 TOTAL`; preserved href, focus, current-page, and native-link assertions.
6. Routed one-liner: replaced only the dangling `Failure it MISSES` comment; no assertion was weakened for that comment fix.
7. Price: five permanent render tests (10 → 15), eight rejecting mutants plus one benign control, two dump artifacts, and one forced s8 source-pin re-anchor.
8. Near miss: broad selector-style patch context hit the wrong occurrence twice; precise surrounding JSX and focused pda runs caught it before acceptance.
9. Harness trap: failed assertions over JSDOM element arrays triggered opaque-origin `localStorage` serialization; scalar assertions restored useful RED output after two runs.
10. Packet defect: the ticket had no typed-state block or assignee, and `claim` rewrote its legacy workspace to scratch despite the epoch-33 marker binding slice/t3.
11. Packet ambiguity: “the `.count` expectation” did not yet exist in pda-s03; I added the exact selected-empty `0 TOTAL` expectation rather than inferring a stale line.
12. Environment: `rg` is absent; the recorded `grep` fallback ran with matcher liveness and AM12b 0 → 1 → 0 discrimination.
13. Browser review was intentionally not run here; the packet assigns it to the review seat and this seat emitted both final-tab DOM dumps.
14. No Git commands, commit, push, main-checkout write, or bug03 edit occurred; scope is accounted by the apply-patch ledger.
