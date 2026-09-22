# GUIDE_CAPTURE_FIX38 evidence report

Verdict: `PASS_FOOTER_CAPTURE_BOUND_REVIEW_REQUIRED`.

The saved LIVE30 row 23 evidence showed that the current Romanian export answer footer was already fully visible before the screenshot helper moved the pane. The old helper reproduced that needless backward movement (`scrollTop` 480 to 437). The correction preserves an already-contained footer, scrolls only forward when a footer is genuinely below the pane, waits for layout to settle, and rejects an uncontainable footer with a closed failure code and a safe geometry/restoration record.

The final offline browser frame passed 6/6 controls. The current four-turn row 23 case stayed at `scrollTop=480`, both footer labels were painted, and viewport and pane state were restored. A representative long answer moved forward from 104 to 352 and ended with the footer contained and painted. An impossible clipped footer failed with `GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE`; previous-target and mutated-source controls failed before geometry capture. Forwarded Support requests, external requests, status reads, capacity reads, database reads, and model requests were all zero.

Visual inspection passed for the original-pane top, preserved footer, complete expanded answer, and forward-scrolled long-reply footer. The preserved footer image is intentionally byte-identical to the top image because no scroll was needed. These are production-markup/CSS offline fixtures; they do not claim a fresh live Support answer.

Four intermediate fixture outcomes remain immutable evidence: two synthetic geometry setups did not initially create the intended below-pane case, one Playwright-wrapped exception required closed-code extraction, and one all-pass run ended only in the console summary after its proof had already been written. None was a product failure. The final fresh attempt passed all six controls without weakening the top-edge guard or painted-containment assertion.

The append-only binding selects fresh LIVE31 phase outputs, `GUIDE_LIVE_GUIDE23` actual evidence, an isolated profile, and 31 per-row screenshot-failure paths. All seven phase argv entries self-bind the final command contract. The capture phase selects the corrected local capture successor and helper. Readiness, idle, exact PID/PGID/PPID validation, Runtime9 custody, Support-principal preparation, TLS behavior, fixed31 ordering, pacing, and owner-capacity contract remain bound to their reviewed predecessors. The real operator guard rejected a stale command digest and reached a controlled first-phase boundary with the actual digest. All 154 future paths were unique and absent.

No live runtime, application page, HTTP, Support, status, capacity, database, or model operation occurred. Runtime9 post-LIVE30 custody remains operationally unverified until the later reviewed run. The fixed31 natural planning bound was retained as `2026-09-21T09:51:12.590Z`; it is not a capacity result. Forgot-password navigation remains unresolved, and this node does not claim CP1 readiness or acceptance.

Skills loaded: retained mission BODY/protocol instructions and systematic debugging. No new skill body was read for this resumed node.
