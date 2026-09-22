# GUIDE_COMPACT_DIAG — self-report

## Identity and result

- Session: `/root/requirements` (original Sol requirements/author seat)
- Ticket: `t_21586114`
- Product revision inspected: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Verdict: `HARNESS_PRECONDITION_DEFECT_PROVED_LIVE7_CAUSE_UNRESOLVED_NO_PRODUCT_DEFECT_PROVED`
- Heavy lease: not acquired; static source and sealed evidence were sufficient.
- Product/harness/prior-evidence writes: none.
- Usage: unavailable; no token meter was exposed.

## Skills loaded

Actual retained BODY reads used by this original session: `superpowers:using-superpowers`, heartbeat protocol and worker contract, `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. This read-only diagnosis applied the retained systematic-debugging method. No new skill BODY was needed or claimed.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The failure scene was lost at the transition boundary. The harness saved strong row evidence after successful responses, but it did not save the compact widget state before and after the click that opens the next mode. That made the most likely mechanism inspectable in source yet impossible to attribute to the actual failed run.

The repeated cost came from validating expensive response rows before validating every UI mode and remount transition without Support traffic. Fifteen real requests succeeded before the first compact transition exposed the missing readiness contract. A zero-request transition preflight would have found the harness defect before model traffic and would have produced a small, decisive failure record. Exact token cost is unavailable, so this report does not invent a number.

Three upgrades make the workflow materially more efficient:

1. Treat UI transitions as a typed state machine. Every step writes a fixed safe projection before and after it, and the next step runs only when its explicit precondition is true.
2. Separate zero-request navigation/hydration preflight from the costly 54-row answer capture. The answer capture consumes capacity only after all full/compact, language, route-remount, storage-reset, privacy, and composer checks pass.
3. Make the runner authoritative for evidence and exit status. It should write checkpoints internally and return the child numeric status directly; shell logging must not mask failure through `tee`.

For a stronger one-prompt execution path, the prompt should point to one frozen input manifest and one state-machine runner. The runner should validate revision, reviewed harness digest, capacity, zero-request transitions, then row capture, and finally emit a complete receipt from checkpoints even on failure. The human-readable report should be derived from that receipt, not reconstructed after the run. This reduces re-reading, eliminates ambiguous stage reconstruction, and stops before expensive traffic whenever an inexpensive prerequisite fails.

## Limits

No failure DOM, screenshot, state projection, or child numeric status survived. A pre-hydration swallowed click is supported but is not proved as LIVE7's exact cause. No product behavior patch is justified. The next work is the append-only BIND13 harness/readiness contract with separate review and a zero-request preflight.
