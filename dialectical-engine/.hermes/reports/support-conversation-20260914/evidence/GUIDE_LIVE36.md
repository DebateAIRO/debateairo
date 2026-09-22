# GUIDE_LIVE36

Verdict: `FAILED_CAPTURE_ROW10_NO_RETRY`.

The exact reviewed operator ran once. Preflight, readiness, the single capacity frame, gate, and fresh logical58 row proof passed. Capture stopped with numeric status 1 on canonical row 10 after one real accepted response. No retry, second capacity read, restart, or additional Support request occurred; idle was not run after the stop-first failure.

Counts: attempted requests 1; completed API/DOM replies 1; completed screenshot rows 0; sessions 1; sends 1; model-attributed accepted drafts 1. The identifier-free session creation time is `2026-09-21T12:41:51.789Z`. The response was HTTP 200 `ANSWER_GROUNDED`, with API/DOM text, source, and action equality all true. Its sources were `app-navigation` and `settings-help-menus`; its canonical action was `help`. The full public response remains in the immutable actual receipt and is not duplicated here.

The saved top-pane PNG is a partial artifact, not a completed screenshot row. The end-pane and complete-expanded PNGs were not created. The failure diagnostic proves the body end was painted, the source/action footer existed, and style/scroll/viewport restoration succeeded. The controller selected `.supportAssistantCompact` as the pane: it reported `scrollHeight=clientHeight=882`, maximum scroll 0, and considered the footer contained, but the footer bottom was 887.203 while the viewport height was 844, so its center hit test could not prove paint.

This is a capture-controller pane-selection error on the evidence available. The compact product nests `.supportAssistantCompact` inside `.supportWidgetPanel`, and `.supportWidgetPanel` is the actual `max-height:70vh; overflow:auto` scroll container. The helper instead uses `paneSelector=root` for compact mode. Existing evidence therefore does not establish a product usability defect. The smallest successor is an offline real-path check and binding that selects `.supportWidgetPanel` for compact original-pane evidence, preserves the strict viewport paint and restoration guards, and retains the accepted row 10 without resending it.

The capacity frame was measured at `2026-09-21T12:41:48.132Z`, before the single send: 0 current hourly sessions, 52/100 messages in 24 hours, 15/500 calls today, relay available. It is failed-attempt evidence and is not reusable.
