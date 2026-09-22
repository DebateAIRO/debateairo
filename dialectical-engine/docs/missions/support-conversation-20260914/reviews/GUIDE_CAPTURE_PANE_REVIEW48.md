# GUIDE_CAPTURE_PANE_REVIEW48 — compact pane and continuation review

- Ticket: `t_75f5344e`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `PASS_FINAL_COMPACT_PANE_CONTINUATION_BINDING`

## Bounded disposition

The LIVE36 compact screenshot failure is resolved in the reviewed binding. The shared screenshot helper now selects `.supportWidgetPanel` for compact mode, the real scroll viewport, while full mode remains on `.supportChatScroll`. The capture imports that helper directly. Target identity remains strict: exact prompt, API text, visible text, source/action layout, assistant role, before/after assistant counts and target ordinal must agree before geometry is read.

The final accepted control is `GUIDE_CAPTURE_PANE_FIX48-browser-control-final.json`, a replay of the retained row 10 public response through the real compiled React component. It includes the disclosure, user prompt and target assistant at ordinal 1. The earlier hand-built DOM evidence and the superseded ordinal-0 attempt are preserved only as failed/superseded evidence. The original selector reproduces `GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE`. With the corrected selector, row 10's body and source/action footer are painted and contained in the 390x844 pane; the complete article is captured separately and styles, pane scroll and viewport are restored. The bounded long control distinguishes real forward scrolling: its start and end images differ, its footer becomes painted after a forward scroll, its complete image contains the full long body and footer, and restoration passes.

All dynamic/private/external requests were intercepted before navigation. The control records Support 0, status 0, private/other API 0, external 0 and forwarded dynamic 0. Six session-auth attempts were intercepted and aborted. This is synthetic-response replay through the real compiled UI, not a new Support/model response.

## Row 10 layered evidence

The adopted layered-evidence conditions are met for a later qualified working-preview report. The retained LIVE36 artifact proves the actual row 10 HTTP 200 response, `MODEL_ACCEPTED_DRAFT`, exact API/DOM text, source and action equality, and one actual original-pane start image. The reviewed replay binds the same prompt hash, response hash, source IDs, action ID and assistant ordinal through the compiled component and actual helper, and proves real-pane start/footer/complete rendering and restoration with zero forwarded dynamic traffic.

The limitation remains explicit: replay images are synthetic-response replay and are never actual LIVE36 screenshots. LIVE36 remains `FAILED_CAPTURE_ROW10_NO_RETRY`; its missing live end and expanded images are not retroactively created. This evidence is sufficient only for `WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED`, subject to the remaining execution and review requirements below.

## Remaining execution and composition

The remaining plan is exactly 20 unique rows in the required order: compact RO `18,26,34,56,58,54`, keyboard Help to full RO `43` in the same session; full EN `5,13,21,25,29,37,45,53`; compact EN `8,12,42,55,57`. It uses exactly three new sessions and has a 17-model-call ceiling with 31-second request-start spacing. The transition checks preserve the RO session identity and capability, avoid a replacement session and restore the prior message before row 43.

The capacity gate accepts exactly 3 session, 26 message and 23 daily-call headroom, including six owner-reserved messages/model calls, and rejects the immediately lower 2/25/22 boundaries. The conservative two-owner-slot expiry `2026-09-21T13:41:56.789Z` is planning data only; fresh capacity must still pass at dispatch.

Composition retains all ten LIVE31 responses, the one LIVE36 row 10 response and exactly 20 future GUIDE26 responses. It preserves both failed-attempt verdicts, the row 47 footerless exception, the distinct non-actual row 10 replay qualification, three actual response segments and all six identifier-free session timestamps. Missing, duplicate, extra, wrong-revision and replay-relabeling controls reject. No completed case is resent.

## Final binding and limits

All seven phase argv entries select command contract SHA-256 `8488cc18fd0f507ba64cd82add66543af2b74c26586e8846d008b520a6533166`. The operator embeds that digest; its script SHA-256 is `130f193fbb60353b8cfd49717b8835e5129d98beb01d8593b22a04c9e02ea29e`. The exact 35-file reachable closure has aggregate SHA-256 `fcea2921ae57b403099f02e7d4e0dd99fca46bff79ebe8f9f0862f1f0cc45449` and includes the corrected helper, remaining-20 matrix/verifier/capture, composer and operational phase sources. LIVE37, actual GUIDE26 and composed output paths are fresh; all 115 future paths are unique and absent. Owner LIVE21 capacity and LIVE25 walkthrough paths remain reserved.

Actual execution of the remaining 20, content review of those responses and the composed 31, and fresh owner availability are still required. Every new actual response still requires current-target original-pane start/end plus separate expanded evidence. This verdict does not resolve the Forgot destination, approve CP1, or claim CP2 readiness.
