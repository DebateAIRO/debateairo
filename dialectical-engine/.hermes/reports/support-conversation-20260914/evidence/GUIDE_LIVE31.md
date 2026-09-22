# GUIDE_LIVE31 execution report

Verdict: `FAILED_CAPTURE_ROW47_NO_RETRY`.

The exact reviewed operator ran once under `require_escalated`. Preflight, readiness, the first and only capacity frame, gate, and fresh 58-row proof returned status 0. The capture consumed that proof and gate, then stopped with numeric status 1. Idle was not run. No retry, second capacity read, runtime restart, or additional Support request occurred.

The partial actual receipt records 10 sends, 10 completed public API replies, 10 API/DOM-equal projections, and two new anonymous sessions. Nine rows completed all three screenshots; row 47 completed only its original-pane top image. The completed response sequences are 1, 2, 15, 19, 23, 27, 31, 35, 39, and 47. Session creation was observed at `2026-09-21T09:52:36.856Z` and `2026-09-21T09:53:08.483Z`; both sessions reported the required KB version. Row 23 saved its expanded, original-pane top, and original-pane footer images and has no failure diagnostic. This proves the contained-footer correction passed in the actual capture and the run moved beyond row 23.

Row 47 produced a valid HTTP 200 `REFUSE_ZONE` deterministic recovery reply. API and DOM text, empty sources, and empty actions were equal. Visual inspection confirms the full refusal body is painted in the original-pane top image. Screenshot evidence then failed because the reply intentionally has no source/action footer. The safe diagnostic code is `GUIDE_CAPTURE_SCROLL_EDGE_MISSING`; `footer` is null before and after top positioning. The top-pane image exists, footer and expanded images do not, and pane scroll plus viewport restoration both passed. The outer receipt retained the generic `GUIDE_HARNESS_CAPTURE_FAILED`, while the finite phase-log projection exposed the closed screenshot code and source anchors. No raw provider payload or private runtime log was read. Exact provider-call consumption after the initial frame is unavailable because no post-capture measurement was authorized or taken.

The measured frame started with a maximum 57 anonymous message events in 24 hours and this run sent 10, yielding a conservative post-attempt upper bound of 67 and at most 33 messages under the 100-message limit. That can cover 31 capture messages but cannot also preserve the six-message owner reserve. The second observed session gives a conservative full-five session not-before of `2026-09-21T10:53:13.483Z`; this is timing arithmetic, not a capacity result. Rolling daily-message expiry remains unknown without a later authorized measurement.

Runtime9 was not restarted and remains untouched. Because capture stopped before idle, postfailure runtime custody is unverified. Forgot-password navigation remains unresolved. This run is not CP1 readiness, completion, or acceptance.

Skills loaded: retained mission BODY/protocol and systematic debugging. No new skill body was read.
