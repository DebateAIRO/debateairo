# GUIDE_FOOTERLESS_FIX39 evidence report

Verdict: `PASS_FOOTERLESS_HELPER_UNBOUND_REVIEW_REQUIRED`.

LIVE31 row 47 validly returned a deterministic refusal with no sources or actions. The FIX38 helper reproduced `GUIDE_CAPTURE_SCROLL_EDGE_MISSING` because it treated every answer as having a `.supportCitation` footer. The append-only successor accepts footer absence only when the already-validated API projection contains no source IDs and no action IDs. A separate call-contract adapter proves the API and visible source/action projections match before it derives that expectation.

The final offline browser frame passed 9/9 controls with zero forwarded Support or external requests. Exact saved row 47 passed in full Romanian. Short footerless replies passed in full and compact surfaces for English and Romanian. A long footerless reply preserved a painted body start, scrolled only forward, proved the final text edge painted in the original pane, and produced a complete expanded image containing all 60 public lines. Missing an expected source footer still fails with `GUIDE_CAPTURE_EXPECTED_FOOTER_MISSING`; previous-target and validated-source mismatch controls remain closed. Pane scroll, viewport, style, and expansion restoration passed.

The helper labels end evidence as either `SOURCE_ACTION_FOOTER` or `BODY_END`. It does not pretend an absent footer exists. Footer-backed rows retain FIX38 contained/no-scroll and forward-only reveal behavior by unchanged code. The new helper also retains exact current target, API/DOM projection, stale target, clipping, diagnostic persistence, and finally restoration guards.

Two fixture-only failures are retained. The first had already passed the behavioral cases but compared a Node assertion message too strictly after Node appended comparison text. The second visual review caught an `!important` height in the synthetic fixture that prevented inline evidence expansion; original-pane start/end passed, but the expanded image was clipped. Removing only that fixture override produced the final complete 60-line image. Neither failure justifies a product change.

The helper and its call contract are deliberately unbound. No live plan, runtime, status, capacity, database, Support, or model operation occurred. Runtime9 was untouched. Same-product continuation, session feasibility, and treatment of the ten retained LIVE31 responses remain separate review decisions. Forgot-password navigation remains unresolved; this node makes no CP1 readiness or acceptance claim.

Skills loaded: retained mission BODY/protocol and systematic debugging. No new skill body was read.
