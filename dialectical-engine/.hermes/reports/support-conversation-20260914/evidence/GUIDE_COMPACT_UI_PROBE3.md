# GUIDE_COMPACT_UI_PROBE3 evidence

- Ticket: `t_967133d1`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_FULL_LANGUAGE_INTERACTION_TIMEOUT`
- Child exit: `1`
- Fixed failure: `GUIDE_HARNESS_FULL_LANGUAGE_INTERACTION_TIMEOUT`

## Result

The corrected reviewed invocation passed argument validation and ran once. The first `full/en` transition stopped with hydration `NOT_READY` before any transition PASS was recorded. The bounded public checkpoint showed `/help`, one visible composer, two visible language controls with EN active, one visible Mode toggle in TERRACOTTA state, and a visible cookie region. These observations establish the failed stage; they do not establish a product cause.

The browser guard blocked one Support status attempt and one exact `GET /api/v1/support/cases` attempt. It recorded zero create-session, send-message, or other-Support attempts and zero actual Support requests forwarded to runtime. Fixed console counts were HTTP 401: 1, HTTP 404: 0, JS/hydration: 0, OTHER: 2. No synthetic response, capacity read, chat prompt, model call, database access, or private-log read occurred.

## Custody

Before and after the failed child, the exact clean product revision was retained by detached supervisor PID/PGID `77769`, PPID `1`, from the expected worktree. All 12 expected preview listeners remained present, all 9 unrelated listener records were preserved, and ordinary system TLS `GET https://localhost:3100/help` returned HTTP 200 without a custom CA or insecure mode. The ongoing private stack log was neither read nor hashed.

## Next bounded discriminator

Preserve the checkpoint and diagnose the full-view interaction handshake against the public producer without repeating this probe. The next node should distinguish whether the readiness interaction never produces its expected reversible mode transition or whether the harness waits for the wrong post-interaction state. No product change is supported by this receipt alone.

## Evidence limits

This was one browser attempt and was not retried. It proves guarded opening reached the first full-view readiness stage, then failed. It does not prove compact behavior, Support backend quality, quota state, testability, readiness, or acceptance.
