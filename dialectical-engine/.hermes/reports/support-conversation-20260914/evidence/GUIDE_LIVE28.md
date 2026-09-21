# GUIDE_LIVE28 — capture stopped after first accepted response

- Ticket: `t_0874e640`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Verdict: `STOPPED_CAPTURE_SCREENSHOT_TARGET_MISMATCH`
- Execution: exact sealed FIX28 operator, `sandbox_permissions=require_escalated`, no outer redirection

## Phase result

The one-shot operator passed five phases in the same fresh frame:

- Preflight: status 0 at `2026-09-21T02:16:02.129Z`
- Readiness: status 0 at `2026-09-21T02:16:02.311Z`
- Capacity: status 0 at `2026-09-21T02:16:03.019Z`
- Gate: status 0 at `2026-09-21T02:16:03.057Z`
- Row proof: status 0 at `2026-09-21T02:16:03.539Z`, 58 rows validated
- Capture: status 1, `GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH`
- Idle: not started because stop-first applied

The capacity record measured the expected product/KB and an available relay before capture. It is evidence for this failed attempt and cannot be reused as a later fresh gate.

## Actual capture evidence

The capture attempted and completed one canonical row and created one anonymous session:

- Sequence 1, `Pricing`, full surface, English, model branch
- HTTP 200, `ANSWER_GROUNDED`
- Response origin `MODEL_ACCEPTED_DRAFT`
- Source `app-navigation` / “Navigate Dialectical Engine”
- No action
- API and visible text, sources, and actions were equal
- Diagnostic status `ACCEPTED_DRAFT`, with all invalid/duplicate/unmatched counts zero

The accepted public answer explained that published pricing is informational, not a checkout flow, and directed signed-in debate creation through the debate creator. This response passed its API/DOM and diagnostic checks. The failure occurred afterward while selecting the screenshot target. It is therefore neither a pre-browser/pre-question failure nor a response-policy failure.

No screenshot was recorded. The expected expanded, original-pane-top, and original-pane-footer files for row 1 are absent. The temporary browser profile is also absent after child cleanup. The public receipt recorded three HTTP 401 console events; their origins remain unknown. No raw headers, credentials, private records, or rejected model text were retained.

The receipt recorded one `createSession` and one `sendMessage`, but did not record an absolute session-creation timestamp. First-session time is therefore unknown and no second session was created. Owner availability was not calculated, and `GUIDE_LIVE25-owner-testability.json` was not created. A later node must treat the failed attempt's capacity and its one session as consumed history rather than assume a fresh five-slot frame.

Runtime custody was verified at readiness with PID 12272 and ordinary TLS `/help` status 200. Idle custody after failure is unverified because stop-first correctly prevented phase 7. No runtime stop, restart, or private ongoing-log read occurred.

## Efficiency finding

The model/API/UI result passed, but screenshot-target selection was the first live exercise of that exact post-answer state. Future capture bundles should execute the complete screenshot selector against a zero-Support fixture containing the exact rendered answer/source/action geometry before any paid request. The fixture must test the original nested pane and expanded view with the same selectors used by capture, then verify all three output targets can be resolved before a session is created.

The one-prompt operator also needs a checkpoint that records absolute session creation time at the request boundary. Without it, a failed attempt consumes capacity but cannot calculate natural expiry precisely, forcing conservative scheduling and more investigation.

## Limits

Only one of 31 planned rows completed. The result is not a full guidance demonstration, owner walkthrough, preview readiness determination, CP1 completion, or acceptance. Forgot password remains unresolved and actionless.

